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

@Controller('clubs/:clubSlug/books/:bookId/reviews')
@UseGuards(ClubRolesGuard)
export class ReviewsController {
  constructor(private readonly reviewsService: ReviewsService) {}

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
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
    return this.reviewsService.create(
      clubSlug,
      bookId,
      userId,
      createReviewDto,
    );
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  async findAll(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
  ) {
    return this.reviewsService.findAll(clubSlug, bookId);
  }
}
