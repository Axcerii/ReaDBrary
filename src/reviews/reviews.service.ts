import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateReviewDto } from './dto/create-review.dto';

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Vérifie qu'un livre appartient à un club spécifique et valide sa visibilité (si actif ou si l'utilisateur est admin/owner).
   *
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws NotFoundException Si le livre n'existe pas ou s'il est inactif et inaccessible
   * @returns Le livre s'il est trouvé et accessible
   */
  private async verifyBookInClub(
    clubSlug: string,
    bookId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.prisma.book.findFirst({
      where: {
        id: bookId,
        club: { slug: clubSlug },
      },
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
   * Crée un avis (critique / note) sur un livre de club.
   * L'utilisateur ne peut laisser qu'un seul avis par livre (contrainte d'unicité).
   *
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param userId L'identifiant de l'utilisateur qui rédige l'avis
   * @param createReviewDto Les données de l'avis (note de 1 à 5, commentaire)
   * @param userStatus Le statut d'accès de l'utilisateur
   * @throws ConflictException Si l'utilisateur a déjà rédigé un avis sur ce livre
   * @returns L'avis créé incluant le profil réduit de l'utilisateur
   */
  async create(
    clubSlug: string,
    bookId: string,
    userId: string,
    createReviewDto: CreateReviewDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    await this.verifyBookInClub(clubSlug, bookId, userStatus);

    // Uniqueness constraint: a user can only review a book once. If exists, update it.
    const existingReview = await this.prisma.review.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    if (existingReview) {
      return this.prisma.review.update({
        where: {
          id: existingReview.id,
        },
        data: {
          rating: createReviewDto.rating,
          comment: createReviewDto.comment,
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

    return this.prisma.review.create({
      data: {
        rating: createReviewDto.rating,
        comment: createReviewDto.comment,
        userId,
        bookId,
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
   * Récupère tous les avis déposés sur un livre donné.
   *
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @returns Un tableau des avis classés du plus récent au plus ancien
   */
  async findAll(
    clubSlug: string,
    bookId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    await this.verifyBookInClub(clubSlug, bookId, userStatus);

    return this.prisma.review.findMany({
      where: {
        bookId,
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
      orderBy: {
        createdAt: 'desc',
      },
    });
  }
}
