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

@Controller('admin')
@UseGuards(AdminGuard)
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('users')
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users/:id/deactivate')
  async deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Post('users/:id/reactivate')
  async reactivateUser(@Param('id') id: string) {
    return this.adminService.reactivateUser(id);
  }

  @Post('clubs/:clubSlug/books/import')
  async importBooks(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importBooks(clubSlug, importCsvDto.csv);
  }

  @Post('clubs/:clubSlug/members/import')
  async importMembers(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importMembers(clubSlug, importCsvDto.csv);
  }
}
