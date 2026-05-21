import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Res,
} from '@nestjs/common';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
import type { Response } from 'express';

@Controller('clubs/:clubSlug/books')
@UseGuards(ClubRolesGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  async create(
    @Param('clubSlug') clubSlug: string,
    @Body() createBookDto: CreateBookDto,
  ) {
    return this.booksService.create(clubSlug, createBookDto);
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  async findAll(
    @Param('clubSlug') clubSlug: string,
    @Query() query: BookQueryDto,
  ) {
    return this.booksService.findAll(clubSlug, query);
  }

  @Get('export')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  async exportCsv(
    @Param('clubSlug') clubSlug: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    const csv = await this.booksService.exportCsv(clubSlug);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-${clubSlug}.csv"`,
    );
    return csv;
  }

  @Get(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  async findOne(@Param('clubSlug') clubSlug: string, @Param('id') id: string) {
    return this.booksService.findOne(clubSlug, id);
  }

  @Patch(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('id') id: string,
    @Body() updateBookDto: UpdateBookDto,
  ) {
    return this.booksService.update(clubSlug, id, updateBookDto);
  }

  @Delete(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  async remove(@Param('clubSlug') clubSlug: string, @Param('id') id: string) {
    return this.booksService.remove(clubSlug, id);
  }
}
