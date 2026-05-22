import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { Request } from 'express';
import { auth } from '../auth/auth';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

@ApiTags('Clubs')
@ApiBearerAuth()
@Controller('clubs')
export class ClubsController {
  constructor(private readonly clubsService: ClubsService) {}

  private async getSessionUser(req: Request) {
    try {
      const session = (await auth.api.getSession({
        headers: req.headers as Record<string, string>,
      })) as BetterAuthSession | null;
      return session?.user ? { id: session.user.id, role: session.user.role } : null;
    } catch {
      return null;
    }
  }

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau club de lecture' })
  @ApiResponse({ status: 201, description: 'Le club a été créé avec succès.' })
  async create(@Body() createClubDto: CreateClubDto) {
    return this.clubsService.create(createClubDto);
  }

  @Get()
  @ApiOperation({ summary: 'Liste tous les clubs de lecture (publics ou selon les droits du membre)' })
  @ApiResponse({ status: 200, description: 'Liste des clubs retournée.' })
  async findAll(@Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findAll(sessionUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère les détails d\'un club' })
  @ApiResponse({ status: 200, description: 'Détails du club retournés.' })
  @ApiResponse({ status: 404, description: 'Club non trouvé ou inaccessible.' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findOne(id, sessionUser);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour les informations d\'un club (ou son statut d\'activité)' })
  @ApiResponse({ status: 200, description: 'Club mis à jour avec succès.' })
  async update(
    @Param('id') id: string,
    @Body() updateClubDto: UpdateClubDto,
    @Req() req: Request,
  ) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.update(id, updateClubDto, sessionUser);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un club' })
  @ApiResponse({ status: 200, description: 'Club supprimé avec succès.' })
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }
}
