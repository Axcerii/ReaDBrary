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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Membres de Club')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/members')
export class ClubMembersController {
  constructor(private readonly clubMembersService: ClubMembersService) {}

  @Post()
  @ApiOperation({ summary: 'Ajoute ou invite un membre dans un club' })
  @ApiResponse({ status: 201, description: 'Le membre a été ajouté avec succès.' })
  async addMember(
    @Param('clubSlug') clubSlug: string,
    @Body() addMemberDto: AddMemberDto,
  ) {
    return this.clubMembersService.addMember(clubSlug, addMemberDto);
  }

  @Patch(':userId')
  @ApiOperation({ summary: 'Modifie le rôle d\'un membre au sein du club' })
  @ApiResponse({ status: 200, description: 'Le rôle du membre a été mis à jour.' })
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
  @ApiOperation({ summary: 'Exclut ou retire un membre du club' })
  @ApiResponse({ status: 200, description: 'Le membre a été retiré du club.' })
  async removeMember(
    @Param('clubSlug') clubSlug: string,
    @Param('userId') userId: string,
  ) {
    return this.clubMembersService.removeMember(clubSlug, userId);
  }

  @Get()
  @ApiOperation({ summary: 'Liste tous les membres d\'un club' })
  @ApiResponse({ status: 200, description: 'Liste des membres retournée.' })
  async findMembers(@Param('clubSlug') clubSlug: string) {
    return this.clubMembersService.findMembers(clubSlug);
  }
}
