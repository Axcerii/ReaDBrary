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

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

interface AuthenticatedRequest extends Request {
  userSession?: BetterAuthSession;
}

@Controller('clubs/:clubSlug/books/:bookId')
@UseGuards(ClubRolesGuard)
export class ProgressionController {
  constructor(private readonly progressionService: ProgressionService) {}

  @Patch('progression')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
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
    return this.progressionService.updateProgression(
      clubSlug,
      bookId,
      userId,
      updateProgressionDto,
    );
  }

  @Get('progression')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  async get(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    return this.progressionService.getProgression(clubSlug, bookId, userId);
  }

  @Get('progressions')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  async getGlobal(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
  ) {
    return this.progressionService.getGlobalProgressions(clubSlug, bookId);
  }
}
