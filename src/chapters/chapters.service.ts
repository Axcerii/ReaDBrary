import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { splitChapterIntoPages } from '../common/utils/markdown.utils';
import { Prisma } from '../../generated/prisma/client';

@Injectable()
export class ChaptersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'identifiant d'un club de lecture à partir de son slug unique.
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
   * Vérifie et récupère un livre appartenant à un club en validant sa visibilité d'activité.
   */
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

  /**
   * Met à jour le nombre total de pages virtuelles du livre.
   * Compte les pages de chaque chapitre à l'aide du parser de démarquage (markdown splitter).
   */
  private async syncBookPagesCount(
    tx: Prisma.TransactionClient,
    bookId: string,
  ) {
    const chapters = await tx.chapter.findMany({
      where: { bookId },
      orderBy: { index: 'asc' },
    });

    let totalPages = 0;
    for (const chapter of chapters) {
      const virtualPages = splitChapterIntoPages(chapter.content);
      totalPages += virtualPages.length;
    }

    await tx.book.update({
      where: { id: bookId },
      data: { pages: totalPages },
    });
  }

  /**
   * Crée un nouveau chapitre.
   * Décale les index des chapitres suivants.
   */
  async create(
    clubSlug: string,
    bookId: string,
    createDto: CreateChapterDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });

    if (createDto.index < 1 || createDto.index > totalChapters + 1) {
      throw new BadRequestException(
        `Index de chapitre invalide. L'index doit être compris entre 1 et ${totalChapters + 1}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Shift subsequent chapters index up by 1 sequentially in reverse order
      if (createDto.index <= totalChapters) {
        for (let i = totalChapters; i >= createDto.index; i--) {
          await tx.chapter.update({
            where: {
              bookId_index: {
                bookId,
                index: i,
              },
            },
            data: {
              index: i + 1,
            },
          });
        }
      }

      // Create new chapter
      const newChapter = await tx.chapter.create({
        data: {
          index: createDto.index,
          title: createDto.title,
          content: createDto.content,
          bookId,
        },
      });

      // Synchronize book.pages count
      await this.syncBookPagesCount(tx, bookId);

      return newChapter;
    });
  }

  /**
   * Récupère la liste des chapitres sous forme paginée.
   */
  async findAll(
    clubSlug: string,
    bookId: string,
    query: { page?: number; limit?: number },
    userStatus: { isAdmin: boolean; isOwner: boolean },
    userId?: string,
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 10), 50);

    const total = await this.prisma.chapter.count({
      where: { bookId },
    });
    const totalPages = Math.ceil(total / limit);

    const chapters = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { index: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const readChapters = userId
      ? await this.prisma.chapterRead.findMany({
          where: { userId, bookId },
          select: { chapterId: true },
        })
      : [];
    const readSet = new Set(readChapters.map((rc) => rc.chapterId));

    const chaptersWithRead = chapters.map((chapter) => ({
      ...chapter,
      isRead: userId ? readSet.has(chapter.id) : false,
    }));

    return {
      data: chaptersWithRead,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Récupère un chapitre par son index.
   */
  async findOne(
    clubSlug: string,
    bookId: string,
    index: number,
    userStatus: { isAdmin: boolean; isOwner: boolean },
    userId?: string,
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const chapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Le chapitre à l'index ${index} n'existe pas.`,
      );
    }

    const isRead = userId
      ? await this.prisma.chapterRead
          .findUnique({
            where: {
              userId_chapterId: {
                userId,
                chapterId: chapter.id,
              },
            },
          })
          .then(Boolean)
      : false;

    return {
      ...chapter,
      isRead,
    };
  }

  /**
   * Marque ou démarque un chapitre comme lu et recalcule la progression automatiquement.
   */
  async toggleRead(
    clubSlug: string,
    bookId: string,
    index: number,
    userId: string,
    read: boolean,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);
    const chapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!chapter) {
      throw new NotFoundException(
        `Le chapitre à l'index ${index} n'existe pas.`,
      );
    }

    if (read) {
      await this.prisma.chapterRead.upsert({
        where: {
          userId_chapterId: {
            userId,
            chapterId: chapter.id,
          },
        },
        create: {
          userId,
          chapterId: chapter.id,
          bookId,
        },
        update: {},
      });
    } else {
      await this.prisma.chapterRead.deleteMany({
        where: {
          userId,
          chapterId: chapter.id,
        },
      });
    }

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });

    const readChaptersCount = await this.prisma.chapterRead.count({
      where: { userId, bookId },
    });

    await this.prisma.progression.upsert({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
      update: {
        currentPage: readChaptersCount,
      },
      create: {
        userId,
        bookId,
        currentPage: readChaptersCount,
      },
    });

    return {
      chapterId: chapter.id,
      index: chapter.index,
      isRead: read,
      currentPage: readChaptersCount,
      totalChapters,
      progressPercentage:
        totalChapters > 0 ? Math.round((readChaptersCount / totalChapters) * 100) : 0,
    };
  }

  /**
   * Met à jour un chapitre. Décale les index si nécessaire.
   */
  async update(
    clubSlug: string,
    bookId: string,
    index: number,
    updateDto: UpdateChapterDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const targetChapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!targetChapter) {
      throw new NotFoundException(
        `Le chapitre à l'index ${index} n'existe pas.`,
      );
    }

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });

    if (updateDto.index !== undefined && updateDto.index !== index) {
      if (updateDto.index < 1 || updateDto.index > totalChapters) {
        throw new BadRequestException(
          `Index de destination invalide. L'index doit être compris entre 1 et ${totalChapters}.`,
        );
      }

      const newIndex = updateDto.index;
      return this.prisma.$transaction(async (tx) => {
        // Shift target chapter temporarily to avoid unique constraints
        await tx.chapter.update({
          where: { id: targetChapter.id },
          data: { index: -1 },
        });

        if (newIndex < index) {
          // Shift chapters in [newIndex, index - 1] up by 1 sequentially in reverse order
          for (let i = index - 1; i >= newIndex; i--) {
            await tx.chapter.update({
              where: {
                bookId_index: {
                  bookId,
                  index: i,
                },
              },
              data: {
                index: i + 1,
              },
            });
          }
        } else {
          // Shift chapters in [index + 1, newIndex] down by 1 sequentially in forward order
          for (let i = index + 1; i <= newIndex; i++) {
            await tx.chapter.update({
              where: {
                bookId_index: {
                  bookId,
                  index: i,
                },
              },
              data: {
                index: i - 1,
              },
            });
          }
        }

        // Apply updates to target chapter
        const updated = await tx.chapter.update({
          where: { id: targetChapter.id },
          data: {
            index: newIndex,
            title:
              updateDto.title !== undefined
                ? updateDto.title
                : targetChapter.title,
            content:
              updateDto.content !== undefined
                ? updateDto.content
                : targetChapter.content,
          },
        });

        // Recalculate book pages
        await this.syncBookPagesCount(tx, bookId);

        return updated;
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.chapter.update({
        where: { id: targetChapter.id },
        data: {
          title:
            updateDto.title !== undefined
              ? updateDto.title
              : targetChapter.title,
          content:
            updateDto.content !== undefined
              ? updateDto.content
              : targetChapter.content,
        },
      });

      // Recalculate book pages
      await this.syncBookPagesCount(tx, bookId);

      return updated;
    });
  }

  /**
   * Supprime un chapitre et décale les chapitres suivants vers le bas.
   */
  async remove(
    clubSlug: string,
    bookId: string,
    index: number,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const targetChapter = await this.prisma.chapter.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!targetChapter) {
      throw new NotFoundException(
        `Le chapitre à l'index ${index} n'existe pas.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const totalChapters = await tx.chapter.count({ where: { bookId } });

      await tx.chapter.delete({
        where: { id: targetChapter.id },
      });

      // Shift subsequent chapters down by 1 sequentially in forward order
      for (let i = index + 1; i <= totalChapters; i++) {
        await tx.chapter.update({
          where: {
            bookId_index: {
              bookId,
              index: i,
            },
          },
          data: {
            index: i - 1,
          },
        });
      }

      // Recalculate book pages
      await this.syncBookPagesCount(tx, bookId);

      return {
        message: `Le chapitre à l'index ${index} a été supprimé avec succès.`,
      };
    });
  }
}
