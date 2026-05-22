import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AdminGuard } from '../auth/guards/admin.guard';
import { ImportCsvDto } from './dto/import-csv.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Administration')
@ApiBearerAuth()
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  @ApiOperation({ summary: 'Liste tous les utilisateurs de la plateforme' })
  @ApiResponse({ status: 200, description: 'Liste des utilisateurs retournée avec succès.' })
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users/:id/deactivate')
  @ApiOperation({ summary: 'Désactive un utilisateur' })
  @ApiResponse({ status: 200, description: 'L\'utilisateur a été désactivé avec succès.' })
  async deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Post('users/:id/reactivate')
  @ApiOperation({ summary: 'Réactive un utilisateur' })
  @ApiResponse({ status: 200, description: 'L\'utilisateur a été réactivé avec succès.' })
  async reactivateUser(@Param('id') id: string) {
    return this.adminService.reactivateUser(id);
  }

  @Post('clubs/:clubSlug/books/import')
  @ApiOperation({ summary: 'Importe des livres dans un club via un contenu CSV' })
  @ApiResponse({ status: 201, description: 'Livres importés avec succès.' })
  async importBooks(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importBooks(clubSlug, importCsvDto.csv);
  }

  @Post('clubs/:clubSlug/members/import')
  @ApiOperation({ summary: 'Importe des membres dans un club via un contenu CSV' })
  @ApiResponse({ status: 201, description: 'Membres importés avec succès.' })
  async importMembers(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importMembers(clubSlug, importCsvDto.csv);
  }
}
