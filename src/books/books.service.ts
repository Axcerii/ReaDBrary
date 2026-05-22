import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';

@Injectable()
export class BooksService {
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

  async create(clubSlug: string, createBookDto: CreateBookDto) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const createdBook = await this.prisma.book.create({
      data: {
        title: createBookDto.title,
        author: createBookDto.author,
        genre: createBookDto.genre,
        pages: createBookDto.pages,
        clubId,
      },
    });
    return {
      ...createdBook,
      averageRating: null,
    };
  }

  async findAll(
    clubSlug: string,
    query: BookQueryDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const whereClause: any = {
      clubId,
      title: query.title
        ? { contains: query.title, mode: 'insensitive' }
        : undefined,
      author: query.author
        ? { contains: query.author, mode: 'insensitive' }
        : undefined,
      genre: query.genre
        ? { contains: query.genre, mode: 'insensitive' }
        : undefined,
    };

    if (!userStatus.isAdmin && !userStatus.isOwner) {
      whereClause.isActive = true;
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const bookIds = books.map((book) => book.id);
    const avgRatings = await this.prisma.review.groupBy({
      by: ['bookId'],
      where: {
        bookId: { in: bookIds },
      },
      _avg: {
        rating: true,
      },
    });

    const ratingMap = new Map<string, number | null>();
    for (const item of avgRatings) {
      ratingMap.set(item.bookId, item._avg.rating);
    }

    return books.map((book) => ({
      ...book,
      averageRating: ratingMap.get(book.id) ?? null,
    }));
  }

  async findOne(
    clubSlug: string,
    id: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.prisma.book.findFirst({
      where: {
        id,
        clubId,
      },
    });

    if (!book) {
      throw new NotFoundException(
        `Le livre avec l'ID "${id}" n'existe pas dans ce club.`,
      );
    }

    if (!book.isActive && !userStatus.isAdmin && !userStatus.isOwner) {
      throw new NotFoundException(
        `Le livre avec l'ID "${id}" n'existe pas dans ce club.`,
      );
    }

    const reviewsAggregate = await this.prisma.review.aggregate({
      where: { bookId: book.id },
      _avg: {
        rating: true,
      },
    });

    return {
      ...book,
      averageRating: reviewsAggregate._avg.rating ?? null,
    };
  }

  async update(
    clubSlug: string,
    id: string,
    updateBookDto: UpdateBookDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.findOne(clubSlug, id, userStatus);

    if (updateBookDto.isActive !== undefined) {
      if (!userStatus.isAdmin && !userStatus.isOwner) {
        throw new ForbiddenException(
          "Seuls l'administrateur ou le propriétaire du club peuvent modifier le statut d'activité.",
        );
      }
    }

    const updatedBook = await this.prisma.book.update({
      where: { id: book.id },
      data: updateBookDto,
    });

    return {
      ...updatedBook,
      averageRating: book.averageRating,
    };
  }

  async remove(
    clubSlug: string,
    id: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.findOne(clubSlug, id, userStatus);

    return this.prisma.book.delete({
      where: { id: book.id },
    });
  }

  async exportCsv(
    clubSlug: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ): Promise<string> {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const whereClause: any = { clubId };
    if (!userStatus.isAdmin && !userStatus.isOwner) {
      whereClause.isActive = true;
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      orderBy: { title: 'asc' },
    });

    let csvContent = 'id,title,author,genre,pages,createdAt\n';
    for (const book of books) {
      const escape = (val: any) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      csvContent += `${escape(book.id)},${escape(book.title)},${escape(book.author)},${escape(book.genre)},${book.pages},${escape(book.createdAt.toISOString())}\n`;
    }

    return csvContent;
  }
}
