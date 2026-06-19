import {
  Injectable,
  ConflictException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class ClubMembersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'identifiant d'un club de lecture à partir de son slug unique.
   *
   * @param slug Le slug unique du club
   * @throws NotFoundException Si le club n'existe pas
   * @returns L'identifiant (ID) du club
   */
  private async getClubIdBySlug(slug: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { slug },
    });
    if (!club) {
      throw new NotFoundException(
        `Le club avec le slug "${slug}" n'existe pas.`,
      );
    }
    return club.id;
  }

  /**
   * Ajoute un utilisateur existant en tant que membre dans un club de lecture.
   * Rôle par défaut : READER.
   *
   * @param clubSlug Le slug du club
   * @param addMemberDto Les informations sur le membre à ajouter (userId, role)
   * @throws NotFoundException Si l'utilisateur n'existe pas
   * @throws ConflictException Si l'utilisateur fait déjà partie du club
   * @returns La relation de membre créée avec les détails de l'utilisateur
   */
  async addMember(clubSlug: string, addMemberDto: AddMemberDto) {
    const { userId, email, role } = addMemberDto;
    const clubId = await this.getClubIdBySlug(clubSlug);

    // 1. Check if user exists
    let user;
    if (userId) {
      user = await this.prisma.user.findUnique({
        where: { id: userId },
      });
      if (!user) {
        throw new NotFoundException(
          `L'utilisateur avec l'ID "${userId}" n'existe pas.`,
        );
      }
    } else if (email) {
      user = await this.prisma.user.findUnique({
        where: { email },
      });
      if (!user) {
        throw new NotFoundException(
          `L'utilisateur avec l'adresse email "${email}" n'existe pas.`,
        );
      }
    } else {
      throw new BadRequestException(
        "L'identifiant de l'utilisateur (userId) ou son email est obligatoire.",
      );
    }

    // 2. Check if already a member
    const existingMembership = await this.prisma.clubMember.findUnique({
      where: {
        userId_clubId: { userId: user.id, clubId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(`L'utilisateur est déjà membre de ce club.`);
    }

    // 3. Create membership
    return this.prisma.clubMember.create({
      data: {
        clubId,
        userId: user.id,
        role: role ?? 'READER',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
    });
  }

  /**
   * Modifie le rôle interne d'un membre d'un club de lecture (ex: transformer un READER en EDITOR).
   *
   * @param clubSlug Le slug du club de lecture
   * @param userId L'identifiant de l'utilisateur à modifier
   * @param updateMemberRoleDto Le nouveau rôle à attribuer
   * @throws NotFoundException Si l'utilisateur n'est pas membre de ce club
   * @returns La relation de membre mise à jour
   */
  async updateMemberRole(
    clubSlug: string,
    userId: string,
    updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    const { role } = updateMemberRoleDto;
    const clubId = await this.getClubIdBySlug(clubSlug);

    try {
      return await this.prisma.clubMember.update({
        where: {
          userId_clubId: { userId, clubId },
        },
        data: { role },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(
          `La relation membre pour l'utilisateur "${userId}" dans le club "${clubSlug}" n'existe pas.`,
        );
      }
      throw error;
    }
  }

  /**
   * Retire un membre (exclusion) d'un club de lecture.
   *
   * @param clubSlug Le slug du club
   * @param userId L'identifiant du membre à retirer
   * @throws NotFoundException Si l'utilisateur n'est pas membre de ce club
   * @returns La relation de membre supprimée
   */
  async removeMember(clubSlug: string, userId: string) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    try {
      return await this.prisma.clubMember.delete({
        where: {
          userId_clubId: { userId, clubId },
        },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(
          `La relation membre pour l'utilisateur "${userId}" dans le club "${clubSlug}" n'existe pas.`,
        );
      }
      throw error;
    }
  }

  /**
   * Récupère la liste de tous les membres faisant partie d'un club de lecture.
   * Expose l'adresse email uniquement aux administrateurs de la plateforme.
   *
   * @param clubSlug Le slug du club
   * @param userStatus Le statut administrateur de l'utilisateur à l'origine de la requête
   * @returns Un tableau contenant les membres du club et leurs profils utilisateur
   */
  async findMembers(clubSlug: string, userStatus: { isAdmin: boolean }) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: userStatus.isAdmin,
            image: true,
          },
        },
      },
    });
  }

  /**
   * Permet à un utilisateur de rejoindre directement un club public
   * ou de faire une demande d'adhésion pour un club privé.
   */
  async joinClub(clubSlug: string, userId: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
    });
    if (!club) {
      throw new NotFoundException(`Le club avec le slug "${clubSlug}" n'existe pas.`);
    }

    // Check if already a member
    const existingMembership = await this.prisma.clubMember.findUnique({
      where: {
        userId_clubId: { userId, clubId: club.id },
      },
    });
    if (existingMembership) {
      throw new ConflictException('Vous êtes déjà membre de ce cercle de lecture.');
    }

    // Check if user is an ADMIN to join instantly
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    const isAdmin = user?.role === 'ADMIN';

    if (club.isPublic || isAdmin) {
      // Public club or Admin: join instantly as READER
      const membership = await this.prisma.clubMember.create({
        data: {
          clubId: club.id,
          userId,
          role: 'READER',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
      return { status: 'JOINED', membership };
    } else {
      // Private club: check if request already exists
      const existingRequest = await this.prisma.clubJoinRequest.findUnique({
        where: {
          userId_clubId: { userId, clubId: club.id },
        },
      });
      if (existingRequest) {
        return { status: 'PENDING' };
      }

      await this.prisma.clubJoinRequest.create({
        data: {
          clubId: club.id,
          userId,
        },
      });
      return { status: 'PENDING' };
    }
  }

  /**
   * Récupère le statut d'adhésion d'un utilisateur par rapport à un club.
   */
  async getJoinStatus(clubSlug: string, userId: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
    });
    if (!club) {
      throw new NotFoundException(`Le club avec le slug "${clubSlug}" n'existe pas.`);
    }

    const membership = await this.prisma.clubMember.findUnique({
      where: {
        userId_clubId: { userId, clubId: club.id },
      },
    });

    if (membership) {
      return { isMember: true, role: membership.role, hasPendingRequest: false };
    }

    const pendingRequest = await this.prisma.clubJoinRequest.findUnique({
      where: {
        userId_clubId: { userId, clubId: club.id },
      },
    });

    return {
      isMember: false,
      role: null,
      hasPendingRequest: !!pendingRequest,
    };
  }

  /**
   * Liste les demandes d'adhésion en attente pour un club (pour OWNER ou ADMIN).
   */
  async findJoinRequests(clubSlug: string) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    return this.prisma.clubJoinRequest.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Approuve une demande d'adhésion (ajoute le membre et supprime la demande).
   */
  async approveJoinRequest(clubSlug: string, userId: string) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    const request = await this.prisma.clubJoinRequest.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    });
    if (!request) {
      throw new NotFoundException("La demande d'adhésion n'existe pas.");
    }

    return this.prisma.$transaction(async (tx) => {
      // Remove request
      await tx.clubJoinRequest.delete({
        where: {
          userId_clubId: { userId, clubId },
        },
      });

      // Add as READER member
      return tx.clubMember.create({
        data: {
          clubId,
          userId,
          role: 'READER',
        },
        include: {
          user: {
            select: {
              id: true,
              name: true,
              email: true,
              image: true,
            },
          },
        },
      });
    });
  }

  /**
   * Refuse et supprime une demande d'adhésion.
   */
  async rejectJoinRequest(clubSlug: string, userId: string) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    const request = await this.prisma.clubJoinRequest.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    });
    if (!request) {
      throw new NotFoundException("La demande d'adhésion n'existe pas.");
    }

    await this.prisma.clubJoinRequest.delete({
      where: {
        userId_clubId: { userId, clubId },
      },
    });

    return { success: true };
  }
}
