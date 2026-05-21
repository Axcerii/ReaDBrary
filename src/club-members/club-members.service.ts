import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Injectable()
export class ClubMembersService {
  constructor(private readonly prisma: PrismaService) { }

  private async getClubIdBySlug(slug: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { slug },
    });
    if (!club) {
      throw new NotFoundException(`Le club avec le slug "${slug}" n'existe pas.`);
    }
    return club.id;
  }

  async addMember(clubSlug: string, addMemberDto: AddMemberDto) {
    const { userId, role } = addMemberDto;
    const clubId = await this.getClubIdBySlug(clubSlug);

    // 1. Check if user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user) {
      throw new NotFoundException(`L'utilisateur avec l'ID "${userId}" n'existe pas.`);
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

  async updateMemberRole(clubSlug: string, userId: string, updateMemberRoleDto: UpdateMemberRoleDto) {
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
        throw new NotFoundException(`La relation membre pour l'utilisateur "${userId}" dans le club "${clubSlug}" n'existe pas.`);
      }
      throw error;
    }
  }

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
        throw new NotFoundException(`La relation membre pour l'utilisateur "${userId}" dans le club "${clubSlug}" n'existe pas.`);
      }
      throw error;
    }
  }

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
