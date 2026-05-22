import {
  Controller,
  Get,
  Patch,
  Body,
  Param,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { UpdateProgressionDto } from './dto/update-progression.dto';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
import { Request } from 'express';
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

@ApiTags('Progression de Lecture')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books/:bookId')
@UseGuards(ClubRolesGuard)
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  private getUserStatus(req: AuthenticatedRequest) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    const isOwner = req.clubMember?.role === 'OWNER';
    return { isAdmin, isOwner };
  }

  @Patch('progression')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Met à jour sa progression de lecture sur un livre' })
  @ApiResponse({ status: 200, description: 'Progression mise à jour avec succès.' })
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Body() updateProgressionDto: UpdateProgressionDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    const userStatus = this.getUserStatus(req);
    return this.progressionService.updateProgression(
      clubSlug,
      bookId,
      userId,
      updateProgressionDto,
      userStatus,
    );
  }

  @Get('progression')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Récupère sa progression de lecture et les détails de la page en cours' })
  @ApiResponse({ status: 200, description: 'Progression de lecture retournée.' })
  async get(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    const userStatus = this.getUserStatus(req);
    return this.progressionService.getProgression(clubSlug, bookId, userId, userStatus);
  }

  @Get('progressions')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Récupère la progression de lecture de tous les membres du club pour un livre' })
  @ApiResponse({ status: 200, description: 'Progressions globales retournées.' })
  async getGlobal(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.progressionService.getGlobalProgressions(clubSlug, bookId, userStatus);
  }
}
