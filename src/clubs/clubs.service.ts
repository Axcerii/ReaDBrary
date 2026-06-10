import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateClubDto } from './dto/create-club.dto';
import { UpdateClubDto } from './dto/update-club.dto';
import { ClubQueryDto } from './dto/club-query.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ClubsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Convertit une chaîne de caractères en slug d'URL valide.
   * Supprime les accents, convertit en minuscules, remplace les espaces par des tirets
   * et élimine les caractères spéciaux.
   *
   * @param text Le texte à slugifier
   * @returns Le slug résultant
   */
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

  /**
   * Crée un nouveau club de lecture.
   * Génère automatiquement un slug unique à partir du nom si aucun n'est fourni.
   *
   * @param createClubDto Les données du club à créer
   * @throws ConflictException Si le slug est déjà utilisé
   * @returns Le club créé
   */
  async create(createClubDto: CreateClubDto, creatorUserId: string) {
    const slug = this.slugify(createClubDto.slug || createClubDto.name);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const club = await tx.club.create({
          data: {
            name: createClubDto.name,
            slug,
            isPublic: createClubDto.isPublic ?? true,
            theme: createClubDto.theme,
          },
        });

        await tx.clubMember.create({
          data: {
            clubId: club.id,
            userId: creatorUserId,
            role: 'OWNER',
          },
        });

        return club;
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

  /**
   * Récupère les clubs de lecture en appliquant des filtres de recherche et de la pagination.
   * - Les administrateurs globaux voient tous les clubs.
   * - Les utilisateurs connectés voient les clubs actifs, ainsi que les clubs inactifs dont ils sont le propriétaire (OWNER).
   * - Les utilisateurs anonymes voient uniquement les clubs actifs.
   *
   * @param query Les paramètres de filtrage et de pagination (nom, page, limite)
   * @param sessionUser L'utilisateur connecté à l'origine de la requête
   * @returns Un tableau de clubs répondant aux critères
   */
  async findAll(
    query: ClubQueryDto,
    sessionUser?: { id: string; role: string } | null,
  ) {
    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);
    const skip = (page - 1) * limit;

    const nameFilter = query.name
      ? { contains: query.name, mode: 'insensitive' as const }
      : undefined;

    let whereClause: any = {};

    if (sessionUser?.role === 'ADMIN') {
      whereClause = nameFilter ? { name: nameFilter } : {};
    } else if (sessionUser) {
      whereClause = {
        name: nameFilter,
        OR: [
          { isActive: true },
          {
            isActive: false,
            members: {
              some: {
                userId: sessionUser.id,
                role: 'OWNER' as const,
              },
            },
          },
        ],
      };
    } else {
      whereClause = {
        isActive: true,
        name: nameFilter,
      };
    }

    return this.prisma.club.findMany({
      where: whereClause,
      skip,
      take: limit,
      orderBy: { name: 'asc' },
    });
  }

  /**
   * Récupère un club spécifique par son identifiant.
   * Valide les droits d'accès si le club est désactivé.
   *
   * @param id L'identifiant du club
   * @param sessionUser L'utilisateur à l'origine de la requête (pour la validation des accès inactifs)
   * @throws NotFoundException Si le club n'existe pas ou s'il est inactif et que l'utilisateur n'y a pas droit
   * @returns Le club trouvé
   */
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

  /**
   * Met à jour les informations d'un club spécifique.
   * Seuls les administrateurs globaux ou propriétaires de club peuvent désactiver/réactiver un club.
   *
   * @param id L'identifiant du club à modifier
   * @param updateClubDto Les nouvelles données à appliquer
   * @param sessionUser L'utilisateur effectuant la modification
   * @throws NotFoundException Si le club n'existe pas
   * @throws ForbiddenException Si l'utilisateur tente de modifier isActive sans avoir les droits requis
   * @throws ConflictException Si le nouveau slug est déjà pris
   * @returns Le club mis à jour
   */
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

  /**
   * Supprime définitivement un club de lecture par son identifiant.
   *
   * @param id L'identifiant du club à supprimer
   * @throws NotFoundException Si le club n'existe pas
   * @returns Le club supprimé
   */
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
