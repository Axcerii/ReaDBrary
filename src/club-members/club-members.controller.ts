import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
} from '@nestjs/common';
import { ClubMembersService } from './club-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';

@ApiTags('Club Members')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/members')
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  @Post()
  @ApiOperation({ summary: 'Add or invite a member to a club' })
  @ApiResponse({ status: 201, description: 'Member added successfully.' })
  async addMember(
    @Param('clubSlug') clubSlug: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.clubMembersService.addMember(clubSlug, addMemberDto);
  }

  @Patch(':userId')
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
  @ApiOperation({ summary: 'Remove a member from the club' })
  @ApiResponse({ status: 200, description: 'Member removed successfully.' })
  async removeMember(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.removeMember(clubSlug, userId);
  }

  @Get()
  @ApiOperation({ summary: 'List all members of a club' })
  @ApiResponse({
    status: 200,
    description: 'List of members returned successfully.',
  })
  async findMembers(@Param('clubSlug') clubSlug: string) {
    return this.clubMembersService.findMembers(clubSlug);
  }
}
