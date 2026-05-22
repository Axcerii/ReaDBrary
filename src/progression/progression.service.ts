import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressionDto } from './dto/update-progression.dto';
import { Progression } from '../../generated/prisma/client';

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService) {}

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

  private async findBookInClub(
    clubId: string,
    bookId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, clubId },
    });
    if (!book) {
      throw new NotFoundException(
        `Le livre avec l'ID "${bookId}" n'existe pas dans ce club.`,
      );
    }
    if (!book.isActive && !userStatus.isAdmin && !userStatus.isOwner) {
      throw new NotFoundException(
        `Le livre avec l'ID "${bookId}" n'existe pas dans ce club.`,
      );
    }
    return book;
  }

  async updateProgression(
    clubSlug: string,
    bookId: string,
    userId: string,
    updateDto: UpdateProgressionDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.findBookInClub(clubId, bookId, userStatus);

    if (updateDto.currentPage > book.pages) {
      throw new BadRequestException(
        `La page courante (${updateDto.currentPage}) ne peut pas dépasser le nombre total de pages du livre (${book.pages}).`,
      );
    }

    const progression = await this.prisma.progression.upsert({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
      update: {
        currentPage: updateDto.currentPage,
      },
      create: {
        userId,
        bookId,
        currentPage: updateDto.currentPage,
      },
    });

    const progressPercentage =
      book.pages > 0
        ? Math.round((progression.currentPage / book.pages) * 100)
        : 0;

    return {
      ...progression,
      progressPercentage,
    };
  }

  async getProgression(
    clubSlug: string,
    bookId: string,
    userId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.findBookInClub(clubId, bookId, userStatus);

    const progression = await this.prisma.progression.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    const currentPage = progression ? progression.currentPage : 0;
    const progressPercentage =
      book.pages > 0 ? Math.round((currentPage / book.pages) * 100) : 0;

    if (!progression) {
      return {
        id: null,
        userId,
        bookId,
        currentPage: 0,
        createdAt: null,
        updatedAt: null,
        progressPercentage,
      };
    }

    return {
      ...progression,
      progressPercentage,
    };
  }

  async getGlobalProgressions(
    clubSlug: string,
    bookId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.findBookInClub(clubId, bookId, userStatus);

    const members = await this.prisma.clubMember.findMany({
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

    const progressions = await this.prisma.progression.findMany({
      where: { bookId },
    });

    const progressionMap = new Map<string, Progression>();
    for (const p of progressions) {
      progressionMap.set(p.userId, p);
    }

    return members.map((member) => {
      const p = progressionMap.get(member.userId);
      const currentPage = p ? p.currentPage : 0;
      const progressPercentage =
        book.pages > 0 ? Math.round((currentPage / book.pages) * 100) : 0;

      return {
        userId: member.userId,
        userName: member.user.name,
        userEmail: member.user.email,
        currentPage,
        progressPercentage,
        updatedAt: p ? p.updatedAt : null,
      };
    });
  }
}
