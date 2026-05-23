import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { PagesService } from './pages.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';

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

@ApiTags('Pages')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books/:bookId/pages')
@UseGuards(ClubRolesGuard)
export class PagesController {
  constructor(private readonly pagesService: PagesService) {}

  private getUserStatus(req: AuthenticatedRequest) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    const isOwner = req.clubMember?.role === 'OWNER';
    return { isAdmin, isOwner };
  }

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Create a new page in a book and shift subsequent pages up' })
  @ApiResponse({ status: 201, description: 'Page created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid page index.' })
  async create(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Body() createPageDto: CreatePageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.pagesService.create(
      clubSlug,
      bookId,
      createPageDto,
      userStatus,
    );
  }

  @Post('upload')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Upload an image for a page' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'Image uploaded successfully, returns image URL.' })
  async uploadFile(@UploadedFile() file: any) {
    if (!file) {
      throw new BadRequestException('No file provided.');
    }
    return {
      url: `/uploads/${file.filename}`,
    };
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'List pages of a book with pagination (max 50)' })
  @ApiResponse({ status: 200, description: 'List of pages returned successfully.' })
  async findAll(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Req() req: AuthenticatedRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const userStatus = this.getUserStatus(req);
    const pageNum = page ? Number(page) : undefined;
    const limitNum = limit ? Number(limit) : undefined;
    return this.pagesService.findAll(
      clubSlug,
      bookId,
      { page: pageNum, limit: limitNum },
      userStatus,
    );
  }

  @Get(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Get a page by its index' })
  @ApiResponse({ status: 200, description: 'Page returned successfully.' })
  @ApiResponse({ status: 404, description: 'Page not found.' })
  async findOne(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.pagesService.findOne(
      clubSlug,
      bookId,
      Number(index),
      userStatus,
    );
  }

  @Patch(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Update a page and handle index shifting if the index is modified' })
  @ApiResponse({ status: 200, description: 'Page updated successfully.' })
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Body() updatePageDto: UpdatePageDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.pagesService.update(
      clubSlug,
      bookId,
      Number(index),
      updatePageDto,
      userStatus,
    );
  }

  @Delete(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({ summary: 'Delete a page and shift subsequent pages down' })
  @ApiResponse({ status: 200, description: 'Page deleted successfully.' })
  async remove(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.pagesService.remove(
      clubSlug,
      bookId,
      Number(index),
      userStatus,
    );
  }
}
