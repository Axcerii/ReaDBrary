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

  private async verifyBookInClub(clubSlug: string, bookId: string) {
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
    return book;
  }

  async create(
    clubSlug: string,
    bookId: string,
    userId: string,
    createReviewDto: CreateReviewDto,
  ) {
    await this.verifyBookInClub(clubSlug, bookId);

    // Uniqueness constraint: a user can only review a book once
    const existingReview = await this.prisma.review.findUnique({
      where: {
        userId_bookId: {
          userId,
          bookId,
        },
      },
    });

    if (existingReview) {
      throw new ConflictException(
        'Vous avez déjà donné votre avis sur ce livre.',
      );
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

  async findAll(clubSlug: string, bookId: string) {
    await this.verifyBookInClub(clubSlug, bookId);

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
