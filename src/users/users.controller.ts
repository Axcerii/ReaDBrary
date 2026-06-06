import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  UnauthorizedException,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { auth } from '../auth/auth';
import { Request } from 'express';

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

@ApiTags('Users')
@Controller('api/users')
export class UserController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('profile-picture')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (
          _req: any,
          file: { originalname: string },
          cb: (error: Error | null, filename: string) => void,
        ) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(null, `profile-${uniqueSuffix}${extname(file.originalname)}`);
        },
      }),
    }),
  )
  @ApiOperation({ summary: 'Upload a new profile picture' })
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
    status: 200,
    description: 'Profile picture uploaded and updated successfully.',
  })
  async uploadProfilePicture(
    @UploadedFile() file: any,
    @Req() req: Request,
  ) {
    if (!file) {
      throw new BadRequestException('No file provided.');
    }

    const session = (await auth.api.getSession({
      headers: req.headers as Record<string, string>,
    })) as BetterAuthSession | null;

    if (!session || !session.user) {
      throw new UnauthorizedException('Non authentifié');
    }

    const userId = session.user.id;
    const imageUrl = `/uploads/${file.filename}`;

    const updatedUser = await this.prisma.user.update({
      where: { id: userId },
      data: { image: imageUrl },
    });

    return {
      success: true,
      image: imageUrl,
      user: updatedUser,
    };
  }
}
