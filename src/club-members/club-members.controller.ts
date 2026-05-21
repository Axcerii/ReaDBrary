import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { ClubMembersService } from './club-members.service';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberRoleDto } from './dto/update-member-role.dto';

@Controller('clubs/:clubSlug/members')
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) { }

  @Post()
  async addMember(
    @Param('clubSlug') clubSlug: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.clubMembersService.addMember(clubSlug, addMemberDto);
  }

  @Patch(':userId')
  async updateMemberRole(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
    @Body() updateMemberRoleDto: UpdateMemberRoleDto,
  ) {
    return this.clubMembersService.updateMemberRole(clubSlug, userId, updateMemberRoleDto);
  }

  @Delete(':userId')
  async removeMember(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.removeMember(clubSlug, userId);
  }

  @Get()
  async findMembers(@Param('clubSlug') clubSlug: string) {
    return this.clubMembersService.findMembers(clubSlug);
  }
}
