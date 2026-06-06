import {
  Controller,
  Get,
  Post,
  Param,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import { ClubMembersService } from './club-members.service';
import { Request } from 'express';
import { auth } from '../auth/auth';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
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

@ApiTags('Club Join Requests')
@ApiBearerAuth()
@Controller('clubs/:clubSlug')
export class ClubJoinRequestsController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  private async getSessionUser(req: Request) {
    try {
      const session = (await auth.api.getSession({
        headers: req.headers as Record<string, string>,
      })) as BetterAuthSession | null;
      return session?.user
        ? { id: session.user.id, role: session.user.role }
        : null;
    } catch {
      return null;
    }
  }

  @Post('join')
  @ApiOperation({ summary: 'Join a public club or request to join a private club' })
  @ApiResponse({ status: 201, description: 'Successfully joined or request pending.' })
  async joinClub(@Param('clubSlug') clubSlug: string, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    if (!sessionUser) {
      throw new UnauthorizedException(
        'Vous devez être connecté pour rejoindre ce cercle.',
      );
    }
    return this.clubMembersService.joinClub(clubSlug, sessionUser.id);
  }

  @Get('join-status')
  @ApiOperation({ summary: 'Get current user join status for this club' })
  @ApiResponse({ status: 200, description: 'Returns join status.' })
  async getJoinStatus(
    @Param('clubSlug') clubSlug: string,
    @Req() req: Request,
  ) {
    const sessionUser = await this.getSessionUser(req);
    if (!sessionUser) {
      return { isMember: false, role: null, hasPendingRequest: false };
    }
    return this.clubMembersService.getJoinStatus(clubSlug, sessionUser.id);
  }

  @Get('join-requests')
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'List all pending join requests (Owner only)' })
  @ApiResponse({ status: 200, description: 'List of requests returned.' })
  async findJoinRequests(@Param('clubSlug') clubSlug: string) {
    return this.clubMembersService.findJoinRequests(clubSlug);
  }

  @Post('join-requests/:userId/approve')
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'Approve a join request (Owner only)' })
  @ApiResponse({ status: 200, description: 'Request approved successfully.' })
  async approveRequest(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.approveJoinRequest(clubSlug, userId);
  }

  @Post('join-requests/:userId/reject')
  @UseGuards(ClubRolesGuard)
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'Reject a join request (Owner only)' })
  @ApiResponse({ status: 200, description: 'Request rejected successfully.' })
  async rejectRequest(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.rejectJoinRequest(clubSlug, userId);
  }
}
