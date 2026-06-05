import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Req,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { ClubsService } from './clubs.service';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubQueryDto } from './dto/club-query.dto';
import { Request } from 'express';
import { auth } from '../auth/auth';
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
      return session?.user
        ? { id: session.user.id, role: session.user.role }
        : null;
    } catch {
      return null;
    }
  }

  @Post()
  @ApiOperation({ summary: 'Create a new book club' })
  @ApiResponse({ status: 201, description: 'Club created successfully.' })
  async create(@Body() createClubDto: CreateClubDto, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    if (!sessionUser) {
      throw new UnauthorizedException(
        'Vous devez être connecté pour fonder un cercle.',
      );
    }
    return this.clubsService.create(createClubDto, sessionUser.id);
  }

  @Get()
  @ApiOperation({
    summary:
      'List all book clubs (public or based on member permissions) with filters and pagination',
  })
  @ApiResponse({
    status: 200,
    description: 'List of clubs returned successfully.',
  })
  async findAll(@Query() query: ClubQueryDto, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findAll(query, sessionUser);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get details of a club' })
  @ApiResponse({
    status: 200,
    description: 'Club details returned successfully.',
  })
  @ApiResponse({ status: 404, description: 'Club not found or inaccessible.' })
  async findOne(@Param('id') id: string, @Req() req: Request) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.findOne(id, sessionUser);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update club details (or its activity status)' })
  @ApiResponse({ status: 200, description: 'Club updated successfully.' })
  async update(
    @Param('id') id: string,
    @Body() updateClubDto: UpdateClubDto,
    @Req() req: Request,
  ) {
    const sessionUser = await this.getSessionUser(req);
    return this.clubsService.update(id, updateClubDto, sessionUser);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a club' })
  @ApiResponse({ status: 200, description: 'Club deleted successfully.' })
  remove(@Param('id') id: string) {
    return this.clubsService.remove(id);
  }
}
