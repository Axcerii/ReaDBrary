import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ReviewsService } from './reviews.service';
import { CreateReviewDto } from './dto/create-review.dto';
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

@ApiTags('Critiques / Avis')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books/:bookId/reviews')
@UseGuards(ClubRolesGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  private getUserStatus(req: AuthenticatedRequest) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    const isOwner = req.clubMember?.role === 'OWNER';
    return { isAdmin, isOwner };
  }

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Crée ou met à jour un avis/une critique sur un livre' })
  @ApiResponse({ status: 201, description: 'Critique créée ou mise à jour avec succès.' })
  async create(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Body() createReviewDto: CreateReviewDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    const userStatus = this.getUserStatus(req);
    return this.reviewsService.create(
      clubSlug,
      bookId,
      userId,
      createReviewDto,
      userStatus,
    );
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Récupère tous les avis/les critiques d\'un livre' })
  @ApiResponse({ status: 200, description: 'Liste des avis retournée.' })
  async findAll(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.reviewsService.findAll(clubSlug, bookId, userStatus);
  }
}
