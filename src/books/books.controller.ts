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

@ApiTags('Livres')
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
  @ApiOperation({ summary: 'Crée un livre dans un club' })
  @ApiResponse({ status: 201, description: 'Livre créé avec succès.' })
  async create(
    @Param('clubSlug') clubSlug: string,
    @Body() createBookDto: CreateBookDto,
  ) {
    return this.booksService.create(clubSlug, createBookDto);
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Liste les livres d\'un club avec filtres et pagination' })
  @ApiResponse({ status: 200, description: 'Liste des livres retournée avec succès.' })
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
  @ApiOperation({ summary: 'Exporte la bibliothèque d\'un club au format CSV' })
  @ApiResponse({ status: 200, description: 'Fichier CSV retourné.' })
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
  @ApiOperation({ summary: 'Récupère un livre par son identifiant' })
  @ApiResponse({ status: 200, description: 'Livre retourné avec succès.' })
  @ApiResponse({ status: 404, description: 'Livre non trouvé.' })
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
  @ApiOperation({ summary: 'Met à jour un livre (modification de ses propriétés ou de son statut d\'activité)' })
  @ApiResponse({ status: 200, description: 'Livre mis à jour avec succès.' })
  @ApiResponse({ status: 403, description: 'Interdit pour un EDITOR de modifier isActive.' })
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
  @ApiOperation({ summary: 'Supprime un livre du club' })
  @ApiResponse({ status: 200, description: 'Livre supprimé avec succès.' })
  async remove(
    @Param('clubSlug') clubSlug: string,
    @Param('id') id: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.booksService.remove(clubSlug, id, userStatus);
  }
}
