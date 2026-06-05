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
  UnauthorizedException,
} from '@nestjs/common';
import { ChaptersService } from './chapters.service';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { UpdateChapterDto } from './dto/update-chapter.dto';
import { UpdateChapterReadDto } from './dto/update-chapter-read.dto';
import { ClubRolesGuard } from '../auth/guards/club-roles.guard';
import { ClubRoles } from '../auth/decorators/club-roles.decorator';
import { ClubRole } from '../../generated/prisma/client';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { Request } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';

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

@ApiTags('Chapters')
@ApiBearerAuth()
@Controller('clubs/:clubSlug/books/:bookId/chapters')
@UseGuards(ClubRolesGuard)
export class ChaptersController {
  constructor(private readonly chaptersService: ChaptersService) {}

  private getUserStatus(req: AuthenticatedRequest) {
    const isAdmin = req.userSession?.user?.role === 'ADMIN';
    const isOwner = req.clubMember?.role === 'OWNER';
    return { isAdmin, isOwner };
  }

  @Post()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({
    summary: 'Create a new chapter in a book and shift subsequent chapters up',
  })
  @ApiResponse({ status: 201, description: 'Chapter created successfully.' })
  @ApiResponse({ status: 400, description: 'Invalid chapter index.' })
  async create(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Body() createChapterDto: CreateChapterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.chaptersService.create(
      clubSlug,
      bookId,
      createChapterDto,
      userStatus,
    );
  }

  @Post('upload')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (
          _req: Request,
          file: { originalname: string },
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Upload an image for the chapter markdown' })
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
  @ApiResponse({
    status: 201,
    description: 'Image uploaded successfully, returns image URL.',
  })
  uploadFile(@UploadedFile() file: { filename: string }) {
    if (!file) {
      throw new BadRequestException('No file provided.');
    }
    return {
      url: `/uploads/${file.filename}`,
    };
  }

  @Get()
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'List chapters of a book with pagination (max 50)' })
  @ApiResponse({
    status: 200,
    description: 'List of chapters returned successfully.',
  })
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
    const userId = req.userSession?.user?.id;
    return this.chaptersService.findAll(
      clubSlug,
      bookId,
      { page: pageNum, limit: limitNum },
      userStatus,
      userId,
    );
  }

  @Get(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Get a chapter by its index' })
  @ApiResponse({ status: 200, description: 'Chapter returned successfully.' })
  @ApiResponse({ status: 404, description: 'Chapter not found.' })
  async findOne(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    const userId = req.userSession?.user?.id;
    return this.chaptersService.findOne(
      clubSlug,
      bookId,
      Number(index),
      userStatus,
      userId,
    );
  }

  @Patch(':index/read')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR, ClubRole.READER)
  @ApiOperation({ summary: 'Toggle chapter read state' })
  @ApiResponse({ status: 200, description: 'Chapter read state updated successfully.' })
  async toggleRead(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Body() updateChapterReadDto: UpdateChapterReadDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userId = req.userSession?.user?.id;
    if (!userId) {
      throw new UnauthorizedException('Non authentifié');
    }
    const userStatus = this.getUserStatus(req);
    return this.chaptersService.toggleRead(
      clubSlug,
      bookId,
      Number(index),
      userId,
      updateChapterReadDto.read,
      userStatus,
    );
  }

  @Patch(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({
    summary:
      'Update a chapter and handle index shifting if the index is modified',
  })
  @ApiResponse({ status: 200, description: 'Chapter updated successfully.' })
  async update(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Body() updateChapterDto: UpdateChapterDto,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.chaptersService.update(
      clubSlug,
      bookId,
      Number(index),
      updateChapterDto,
      userStatus,
    );
  }

  @Delete(':index')
  @ClubRoles(ClubRole.OWNER, ClubRole.EDITOR)
  @ApiOperation({
    summary: 'Delete a chapter and shift subsequent chapters down',
  })
  @ApiResponse({ status: 200, description: 'Chapter deleted successfully.' })
  async remove(
    @Param('clubSlug') clubSlug: string,
    @Param('bookId') bookId: string,
    @Param('index') index: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const userStatus = this.getUserStatus(req);
    return this.chaptersService.remove(
      clubSlug,
      bookId,
      Number(index),
      userStatus,
    );
  }
}
