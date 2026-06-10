import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Req,
} from '@nestjs/common';
import { ClubMembersService } from './club-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
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

@ApiTags('Club Members')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/members')
@UseGuards(ClubRolesGuard)
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  @Post()
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'Add or invite a member to a club' })
  @ApiResponse({ status: 201, description: 'Member added successfully.' })
  async addMember(
    @Param('clubSlug') clubSlug: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.clubMembersService.addMember(clubSlug, addMemberDto);
  }

  @Patch(':userId')
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'Update a member role within the club' })
  @ApiResponse({
    status: 200,
    description: 'Member role updated successfully.',
  })
  async updateMemberRole(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    return this.clubMembersService.updateMemberRole(
      clubSlug,
      userId,
      updateMemberRoleDto,
    );
  }

  @Delete(':userId')
  @ClubRoles(ClubRole.OWNER)
  @ApiOperation({ summary: 'Remove a member from the club' })
  @ApiResponse({ status: 200, description: 'Member removed successfully.' })
  async removeMember(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.removeMember(clubSlug, userId);
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'List all members of a club' })
  @ApiResponse({
    status: 200,
    description: 'List of members returned successfully.',
  })
  async findMembers(
    @Param('clubSlug') clubSlug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    return this.clubMembersService.findMembers(clubSlug, { isAdmin });
  }
}

