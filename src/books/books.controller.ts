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
  Req,
} from '@nestjs/common';
import { BooksService } from './books.service';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
import type { Response, Request } from 'express';

import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

interface AuthenticatedRequest extends Request {
  clubMember?: {
    role: 'OWNER' | 'EDITOR' | 'READER';
  };
  userSession?: BetterAuthSession;
}

@ApiTags('Books')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books')
@UseGuards(ClubRolesGuard)
export class BooksController {
  constructor(private readonly booksService: BooksService) {}

  private getUserStatus(req: AuthenticatedRequest) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    const isOwner = req.clubMember?.role === 'OWNER';
    return { isAdmin, isOwner };
  }

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Create a book in a club' })
  @ApiResponse({ status: 201, description: 'Book created successfully.' })
  async create(
    @Param('clubSlug') clubSlug: string,
    @Body() createBookDto: CreateBookDto,
  ) {
    return this.booksService.create(clubSlug, createBookDto);
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'List books of a club with filters and pagination' })
  @ApiResponse({ status: 200, description: 'List of books returned successfully.' })
  async findAll(
    @Param('clubSlug') clubSlug: string,
    @Query() query: BookQueryDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.booksService.findAll(clubSlug, query, userStatus);
  }

  @Get('export')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Export a club library in CSV format' })
  @ApiResponse({ status: 200, description: 'CSV file returned.' })
  async exportCsv(
    @Param('clubSlug') clubSlug: string,
    @Res({ passthrough: true }) res: Response,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    const csv = await this.booksService.exportCsv(clubSlug, userStatus);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="library-${clubSlug}.csv"`,
    );
    return csv;
  }

  @Get(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Get a book by its ID' })
  @ApiResponse({ status: 200, description: 'Book returned successfully.' })
  @ApiResponse({ status: 404, description: 'Book not found.' })
  async findOne(
    @Param('clubSlug') clubSlug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.booksService.findOne(clubSlug, id, userStatus);
  }

  @Patch(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Update a book (modify its properties or activity status)' })
  @ApiResponse({ status: 200, description: 'Book updated successfully.' })
  @ApiResponse({ status: 403, description: 'Forbidden for an EDITOR to modify isActive.' })
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('id') id: string,
    @Body() updateBookDto: UpdateBookDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.booksService.update(clubSlug, id, updateBookDto, userStatus);
  }

  @Delete(':id')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Delete a book from the club' })
  @ApiResponse({ status: 200, description: 'Book deleted successfully.' })
  async remove(
    @Param('clubSlug') clubSlug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.booksService.remove(clubSlug, id, userStatus);
  }
}
