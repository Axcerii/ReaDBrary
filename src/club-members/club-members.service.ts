import {
  Injectable,
  ConflictException,
  NotFoundException,
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
    const { userId, role } = addMemberDto;
    const clubId = await this.getClubIdBySlug(clubSlug);

    // 1. Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(
        `L'utilisateur avec l'ID "${userId}" n'existe pas.`,
      );
    }

    // 2. Check if already a member
    const existingMembership = await this.prisma.clubMember.findUnique({
      where: {
        userId_clubId: { userId, clubId },
      },
    });
    if (existingMembership) {
      throw new ConflictException(`L'utilisateur est déjà membre de ce club.`);
    }

    // 3. Create membership
    return this.prisma.clubMember.create({
      data: {
        clubId,
        userId,
        role: role ?? 'READER',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
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
   * 
   * @param clubSlug Le slug du club
   * @returns Un tableau contenant les membres du club et leurs profils utilisateur
   */
  async findMembers(clubSlug: string) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    return this.prisma.clubMember.findMany({
      where: { clubId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });
  }
}
