import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateProgressionDto } from './dto/update-progression.dto';
import { Progression } from '../../generated/prisma/client';
import { splitChapterIntoPages } from '../common/utils/markdown.utils';

@Injectable()
export class ProgressionService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Résout les détails d'une page virtuelle à un index global donné.
   */
  private async resolveVirtualPageDetails(bookId: string, pageIndex: number) {
    if (pageIndex <= 0) {
      return null;
    }

    const chapters = await this.prisma.chapter.findMany({
      where: { bookId },
      orderBy: { index: 'asc' },
    });

    let cumulativePages = 0;
    for (const chapter of chapters) {
      const virtualPages = splitChapterIntoPages(chapter.content);
      const chapterPagesCount = virtualPages.length;

      if (pageIndex <= cumulativePages + chapterPagesCount) {
        const pageOffset = pageIndex - cumulativePages - 1;
        return {
          id: `${chapter.id}-page-${pageOffset + 1}`,
          index: pageIndex,
          title: chapter.title,
          text: virtualPages[pageOffset] || '',
          image: null,
          bookId,
        };
      }
      cumulativePages += chapterPagesCount;
    }

    return null;
  }

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
   * Valide et récupère un livre au sein d'un club.
   * Gère la restriction de visibilité si le livre est inactif.
   *
   * @param clubId L'identifiant du club
   * @param bookId L'identifiant du livre
   * @param userStatus Le statut d'administration globale ou de propriétaire du club de l'utilisateur
   * @throws NotFoundException Si le livre n'existe pas ou s'il est inactif et inaccessible
   * @returns Le livre trouvé
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
   * Met à jour (ou crée) le marque-page de progression d'un utilisateur sur un livre.
   * Calcule le pourcentage de progression et fournit le contenu textuel et image de la page courante.
   *
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param userId L'identifiant de l'utilisateur
   * @param updateDto Le nouvel index de page courante
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws BadRequestException Si l'index de la page courante dépasse le nombre de pages du livre
   * @returns L'état de progression mis à jour avec le pourcentage et les détails de la page
   */
  async updateProgression(
    clubSlug: string,
    bookId: string,
    userId: string,
    updateDto: UpdateProgressionDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.findBookInClub(clubId, bookId, userStatus);

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });
    const totalCount = totalChapters > 0 ? totalChapters : book.pages;

    if (updateDto.currentPage > totalCount) {
      throw new BadRequestException(
        `Le chapitre ou la page courante (${updateDto.currentPage}) ne peut pas dépasser le nombre total (${totalCount}).`,
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
      totalCount > 0
        ? Math.round((progression.currentPage / totalCount) * 100)
        : 0;

    const pageDetails = await this.resolveVirtualPageDetails(
      bookId,
      progression.currentPage,
    );

    return {
      ...progression,
      progressPercentage,
      currentPageDetails: pageDetails || null,
    };
  }

  /**
   * Récupère la progression d'un membre sur un livre de club.
   * Renvoie également les métadonnées de la page en cours.
   *
   * @param clubSlug Le slug du club
   * @param bookId L'identifiant du livre
   * @param userId L'identifiant du membre concerné
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @returns L'état de progression du membre
   */
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

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });
    const totalCount = totalChapters > 0 ? totalChapters : book.pages;
    const currentPage = progression ? progression.currentPage : 0;
    const progressPercentage =
      totalCount > 0 ? Math.round((currentPage / totalCount) * 100) : 0;

    const pageDetails =
      currentPage > 0
        ? await this.resolveVirtualPageDetails(bookId, currentPage)
        : null;

    if (!progression) {
      return {
        id: null,
        userId,
        bookId,
        currentPage: 0,
        createdAt: null,
        updatedAt: null,
        progressPercentage,
        currentPageDetails: null,
      };
    }

    return {
      ...progression,
      progressPercentage,
      currentPageDetails: pageDetails || null,
    };
  }

  /**
   * Récupère la progression de lecture de TOUS les membres d'un club de lecture pour un livre donné.
   * Cette méthode est réservée aux propriétaires de clubs et aux éditeurs.
   *
   * @param clubSlug Le slug du club
   * @param bookId L'identifiant du livre
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @returns Un tableau des progressions de tous les membres avec leurs profils utilisateur
   */
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

    const progressionMap = new Map<string, any>();
    for (const p of progressions) {
      progressionMap.set(p.userId, p);
    }

    const totalChapters = await this.prisma.chapter.count({
      where: { bookId },
    });
    const totalCount = totalChapters > 0 ? totalChapters : book.pages;

    return members.map((member) => {
      const p = progressionMap.get(member.userId);
      const currentPage = p ? p.currentPage : 0;
      const progressPercentage =
        totalCount > 0 ? Math.round((currentPage / totalCount) * 100) : 0;

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
