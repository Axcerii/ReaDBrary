import { Injectable, ConflictException, NotFoundException } from '@nestjs/common';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) { }

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
        throw new ConflictException(`Le slug "${slug}" est déjà utilisé par un autre club.`);
      }
      throw error;
    }
  }

  async findAll() {
    return this.prisma.club.findMany();
  }

  async findOne(id: string) {
    const club = await this.prisma.club.findUnique({
      where: { id },
    });
    if (!club) {
      throw new NotFoundException(`Le club avec l'ID "${id}" n'existe pas.`);
    }
    return club;
  }

  async update(id: string, updateClubDto: UpdateClubDto) {
    const updateData: any = { ...updateClubDto };
    if (updateClubDto.slug) {
      updateData.slug = this.slugify(updateClubDto.slug);
    } else if (updateClubDto.name && updateClubDto.slug === undefined) {
      // If updating name and slug is not explicitly provided, we DO NOT automatically change the slug 
      // unless specified, but let's stick to updateData as is. Or wait, if we want to change it we can,
      // but usually slug stays the same on name update unless requested, or if they specify a new name,
      // we can optionally update slug or keep it. Let's just keep the existing behavior unless they pass slug.
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
        throw new ConflictException(`Le slug "${updateData.slug}" est déjà utilisé par un autre club.`);
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
