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

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

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
  async create(@Body() createClubDto: CreateClubDto) {
    return this.clubsService.create(createClubDto);
  }

  @Get()
  async findAll(@Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findAll(sessionUser);
  }

  @Get(':id')
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findOne(id, sessionUser);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateClubDto: UpdateClubDto,
    @Req() req: Request,
  ) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.update(id, updateClubDto, sessionUser);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }
}
