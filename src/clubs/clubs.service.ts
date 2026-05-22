import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  private slugify(text: string): string {
    return text
      .toString()
      .normalize('NFD') // split accented characters into their base characters and diacritical marks
      .replace(/[\u0300-\u036f]/g, '') // remove all the accents
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '-') // replace spaces with -
      .replace(/[^\w\-]+/g, '') // remove all non-word chars except dashes
      .replace(/\-\-+/g, '-'); // replace multiple dashes with a single dash
  }

  async create(createClubDto: CreateClubDto) {
    const slug = this.slugify(createClubDto.slug || createClubDto.name);
    try {
      return await this.prisma.club.create({
        data: {
          name: createClubDto.name,
          slug,
        },
      });
    } catch (error: any) {
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Le slug "${slug}" est déjà utilisé par un autre club.`,
        );
      }
      throw error;
    }
  }

  async findAll(sessionUser?: { id: string; role: string } | null) {
    if (sessionUser?.role === 'ADMIN') {
      return this.prisma.club.findMany();
    }

    if (sessionUser) {
      return this.prisma.club.findMany({
        where: {
          OR: [
            { isActive: true },
            {
              isActive: false,
              members: {
                some: {
                  userId: sessionUser.id,
                  role: 'OWNER',
                },
              },
            },
          ],
        },
      });
    }

    return this.prisma.club.findMany({
      where: { isActive: true },
    });
  }

  async findOne(id: string, sessionUser?: { id: string; role: string } | null) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });
    if (!club) {
      throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
    }

    if (!club.isActive) {
      const isAdmin = sessionUser?.role === 'ADMIN';
      const membership = sessionUser
        ? await this.prisma.clubMember.findUnique({
            where: { userId_clubId: { userId: sessionUser.id, clubId: id } },
          })
        : null;
      const isOwner = membership?.role === 'OWNER';

      if (!isAdmin && !isOwner) {
        throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
      }
    }

    return club;
  }

  async update(
    id: string,
    updateClubDto: UpdateClubDto,
    sessionUser?: { id: string; role: string } | null,
  ) {
    const club = await this.prisma.club.findUnique({ where: { id } });
    if (!club) {
      throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
    }

    if (updateClubDto.isActive !== undefined) {
      if (!sessionUser) {
        throw new ForbiddenException(
          "Seuls l'administrateur ou le propriétaire du club peuvent modifier le statut d'activité.",
        );
      }

      const isAdmin = sessionUser.role === 'ADMIN';
      const membership = await this.prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: sessionUser.id, clubId: id } },
      });
      const isOwner = membership?.role === 'OWNER';

      if (!isAdmin && !isOwner) {
        throw new ForbiddenException(
          "Seuls l'administrateur ou le propriétaire du club peuvent modifier le statut d'activité.",
        );
      }
    }

    const updateData: any = { ...updateClubDto };
    if (updateClubDto.slug) {
      updateData.slug = this.slugify(updateClubDto.slug);
    }

    try {
      return await this.prisma.club.update({
        where: { id },
        data: updateData,
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
      }
      if (error.code === 'P2002') {
        throw new ConflictException(
          `Le slug "${updateData.slug}" est déjà utilisé par un autre club.`,
        );
      }
      throw error;
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.club.delete({
        where: { id },
      });
    } catch (error: any) {
      if (error.code === 'P2025') {
        throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
      }
      throw error;
    }
  }
}
