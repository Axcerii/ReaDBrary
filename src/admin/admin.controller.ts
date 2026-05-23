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
  @ApiOperation({ summary: 'List all users on the platform' })
  @ApiResponse({ status: 200, description: 'List of users returned successfully.' })
  async listUsers() {
    return this.adminService.listUsers();
  }

  @Post('users/:id/deactivate')
  @ApiOperation({ summary: 'Deactivate a user' })
  @ApiResponse({ status: 200, description: 'User deactivated successfully.' })
  async deactivateUser(@Param('id') id: string) {
    return this.adminService.deactivateUser(id);
  }

  @Post('users/:id/reactivate')
  @ApiOperation({ summary: 'Reactivate a user' })
  @ApiResponse({ status: 200, description: 'User reactivated successfully.' })
  async reactivateUser(@Param('id') id: string) {
    return this.adminService.reactivateUser(id);
  }

  @Post('clubs/:clubSlug/books/import')
  @ApiOperation({ summary: 'Import books into a club via CSV' })
  @ApiResponse({ status: 201, description: 'Books imported successfully.' })
  async importBooks(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importBooks(clubSlug, importCsvDto.csv);
  }

  @Post('clubs/:clubSlug/members/import')
  @ApiOperation({ summary: 'Import members into a club via CSV' })
  @ApiResponse({ status: 201, description: 'Members imported successfully.' })
  async importMembers(
    @Param('clubSlug') clubSlug: string,
    @Body() importCsvDto: ImportCsvDto,
  ) {
    return this.adminService.importMembers(clubSlug, importCsvDto.csv);
  }
}
