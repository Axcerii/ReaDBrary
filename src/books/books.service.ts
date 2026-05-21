import { Injectable, NotFoundException } from '@nestjs/common';
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
    return this.prisma.book.create({
      data: {
        title: createBookDto.title,
        author: createBookDto.author,
        genre: createBookDto.genre,
        pages: createBookDto.pages,
        clubId,
      },
    });
  }

  async findAll(clubSlug: string, query: BookQueryDto) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    return this.prisma.book.findMany({
      where: {
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
      },
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(clubSlug: string, id: string) {
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
    return book;
  }

  async update(clubSlug: string, id: string, updateBookDto: UpdateBookDto) {
    const book = await this.findOne(clubSlug, id);

    return this.prisma.book.update({
      where: { id: book.id },
      data: updateBookDto,
    });
  }

  async remove(clubSlug: string, id: string) {
    const book = await this.findOne(clubSlug, id);

    return this.prisma.book.delete({
      where: { id: book.id },
    });
  }

  async exportCsv(clubSlug: string): Promise<string> {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const books = await this.prisma.book.findMany({
      where: { clubId },
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
