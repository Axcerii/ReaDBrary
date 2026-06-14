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
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

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

@ApiTags('Reading Progression')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books/:bookSlug')
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
  @ApiOperation({ summary: 'Update reading progression on a book' })
  @ApiResponse({
    status: 200,
    description: 'Progression updated successfully.',
  })
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('bookSlug') bookSlug: string,
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
      bookSlug,
      userId,
      updateProgressionDto,
      userStatus,
    );
  }

  @Get('progression')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Get reading progression and current page details' })
  @ApiResponse({
    status: 200,
    description: 'Reading progression returned successfully.',
  })
  async get(
    @Param('clubSlug') clubSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    const userStatus = this.getUserStatus(req);
    return this.progressionService.getProgression(
      clubSlug,
      bookSlug,
      userId,
      userStatus,
    );
  }

  @Get('progressions')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({
    summary: 'Get reading progression of all club members for a book',
  })
  @ApiResponse({
    status: 200,
    description: 'Global progressions returned successfully.',
  })
  async getGlobal(
    @Param('clubSlug') clubSlug: string,
    @Param('bookSlug') bookSlug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.progressionService.getGlobalProgressions(
      clubSlug,
      bookSlug,
      userStatus,
    );
  }
}
