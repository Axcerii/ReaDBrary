import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePageDto } from './dto/create-page.dto';
import { UpdatePageDto } from './dto/update-page.dto';

@Injectable()
export class PagesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'identifiant d'un club de lecture à partir de son slug unique.
   * 
   * @param slug Le slug unique du club
   * @throws NotFoundException Si le club n'existe pas
   * @returns L'identifiant (ID) du club
   */
  private async getClubIdBySlug(slug: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { slug },
    });
    if (!club) {
      throw new NotFoundException(
        `Le club avec le slug "${slug}" n'existe pas.`,
      );
    }
    return club.id;
  }

  /**
   * Vérifie et récupère un livre appartenant à un club en validant sa visibilité d'activité.
   * 
   * @param clubId L'identifiant du club
   * @param bookId L'identifiant du livre
   * @param userStatus Le statut d'administration globale ou de propriétaire de club
   * @throws NotFoundException Si le livre n'existe pas ou s'il est inactif et inaccessible
   * @returns Le livre s'il est trouvé
   */
  private async findBookInClub(
    clubId: string,
    bookId: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.prisma.book.findFirst({
      where: { id: bookId, clubId },
    });
    if (!book) {
      throw new NotFoundException(
        `Le livre avec l'ID "${bookId}" n'existe pas dans ce club.`,
      );
    }
    if (!book.isActive && !userStatus.isAdmin && !userStatus.isOwner) {
      throw new NotFoundException(
        `Le livre avec l'ID "${bookId}" n'existe pas dans ce club.`,
      );
    }
    return book;
  }

  /**
   * Crée une nouvelle page à l'intérieur d'un livre.
   * Décale les index des pages suivantes d'une position vers le haut (transactionnel)
   * afin d'éviter tout doublon d'index dans la base de données.
   * 
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param createDto Les données de la page (index, titre, texte, image optionnelle)
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws BadRequestException Si l'index est hors limites (doit être entre 1 et total+1)
   * @returns La page nouvellement créée
   */
  async create(
    clubSlug: string,
    bookId: string,
    createDto: CreatePageDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const totalPages = await this.prisma.page.count({
      where: { bookId },
    });

    if (createDto.index < 1 || createDto.index > totalPages + 1) {
      throw new BadRequestException(
        `Index de page invalide. L'index doit être compris entre 1 et ${totalPages + 1}.`,
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Shift subsequent pages index up by 1 sequentially in reverse order to avoid unique constraint violations
      if (createDto.index <= totalPages) {
        for (let i = totalPages; i >= createDto.index; i--) {
          await tx.page.update({
            where: {
              bookId_index: {
                bookId,
                index: i,
              },
            },
            data: {
              index: i + 1,
            },
          });
        }
      }

      // Create new page
      const newPage = await tx.page.create({
        data: {
          index: createDto.index,
          title: createDto.title,
          text: createDto.text,
          image: createDto.image || null,
          bookId,
        },
      });

      // Synchronize book.pages count
      const count = await tx.page.count({ where: { bookId } });
      await tx.book.update({
        where: { id: bookId },
        data: { pages: count },
      });

      return newPage;
    });
  }

  /**
   * Récupère la liste des pages d'un livre sous forme de résultats paginés.
   * La taille de page (limite) maximale autorisée est de 50.
   * 
   * @param clubSlug Le slug du club
   * @param bookId L'identifiant du livre
   * @param query Les options de pagination (page, limit)
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @returns Un objet paginé contenant la liste de pages et les métadonnées de pagination
   */
  async findAll(
    clubSlug: string,
    bookId: string,
    query: { page?: number; limit?: number },
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const page = Number(query.page ?? 1);
    const limit = Math.min(Number(query.limit ?? 10), 50);

    const total = await this.prisma.page.count({
      where: { bookId },
    });
    const totalPages = Math.ceil(total / limit);

    const pages = await this.prisma.page.findMany({
      where: { bookId },
      orderBy: { index: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      data: pages,
      meta: {
        total,
        page,
        limit,
        totalPages,
      },
    };
  }

  /**
   * Récupère une page spécifique du livre par son index de page.
   * 
   * @param clubSlug Le slug du club
   * @param bookId L'identifiant du livre
   * @param index L'index de la page (1-indexed)
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws NotFoundException Si la page à cet index n'existe pas
   * @returns La page trouvée
   */
  async findOne(
    clubSlug: string,
    bookId: string,
    index: number,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const page = await this.prisma.page.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!page) {
      throw new NotFoundException(`La page à l'index ${index} n'existe pas.`);
    }

    return page;
  }

  /**
   * Met à jour une page existante.
   * Si l'index est modifié, décale de manière transactionnelle les autres pages
   * (vers le haut ou le bas selon la direction) pour préserver la séquence contiguë
   * sans conflit d'index unique.
   * 
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param index L'index actuel de la page à modifier
   * @param updateDto Les nouvelles données à appliquer
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws NotFoundException Si la page n'existe pas
   * @throws BadRequestException Si le nouvel index est hors limites (doit être entre 1 et total)
   * @returns La page mise à jour
   */
  async update(
    clubSlug: string,
    bookId: string,
    index: number,
    updateDto: UpdatePageDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const targetPage = await this.prisma.page.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!targetPage) {
      throw new NotFoundException(`La page à l'index ${index} n'existe pas.`);
    }

    const totalPages = await this.prisma.page.count({
      where: { bookId },
    });

    if (updateDto.index !== undefined && updateDto.index !== index) {
      if (updateDto.index < 1 || updateDto.index > totalPages) {
        throw new BadRequestException(
          `Index de destination invalide. L'index doit être compris entre 1 et ${totalPages}.`,
        );
      }

      const newIndex = updateDto.index;
      return this.prisma.$transaction(async (tx) => {
        // Shift target page temporarily to avoid unique constraints
        await tx.page.update({
          where: { id: targetPage.id },
          data: { index: -1 },
        });

        if (newIndex < index) {
          // Shift pages in [newIndex, index - 1] up by 1 sequentially in reverse order
          for (let i = index - 1; i >= newIndex; i--) {
            await tx.page.update({
              where: {
                bookId_index: {
                  bookId,
                  index: i,
                },
              },
              data: {
                index: i + 1,
              },
            });
          }
        } else {
          // Shift pages in [index + 1, newIndex] down by 1 sequentially in forward order
          for (let i = index + 1; i <= newIndex; i++) {
            await tx.page.update({
              where: {
                bookId_index: {
                  bookId,
                  index: i,
                },
              },
              data: {
                index: i - 1,
              },
            });
          }
        }

        // Apply new index and updates to target page
        return tx.page.update({
          where: { id: targetPage.id },
          data: {
            index: newIndex,
            title: updateDto.title !== undefined ? updateDto.title : targetPage.title,
            text: updateDto.text !== undefined ? updateDto.text : targetPage.text,
            image: updateDto.image !== undefined ? updateDto.image : targetPage.image,
          },
        });
      });
    }

    return this.prisma.page.update({
      where: { id: targetPage.id },
      data: {
        title: updateDto.title !== undefined ? updateDto.title : targetPage.title,
        text: updateDto.text !== undefined ? updateDto.text : targetPage.text,
        image: updateDto.image !== undefined ? updateDto.image : targetPage.image,
      },
    });
  }

  /**
   * Supprime une page spécifique et décale (vers le bas) les pages suivantes
   * pour combler le trou, de façon transactionnelle.
   * Met à jour également le nombre total de pages du livre.
   * 
   * @param clubSlug Le slug du club de lecture
   * @param bookId L'identifiant du livre
   * @param index L'index de la page à supprimer
   * @param userStatus Le statut d'accès de l'utilisateur demandeur
   * @throws NotFoundException Si la page à supprimer n'existe pas
   * @returns Un message de confirmation de la suppression
   */
  async remove(
    clubSlug: string,
    bookId: string,
    index: number,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    await this.findBookInClub(clubId, bookId, userStatus);

    const targetPage = await this.prisma.page.findUnique({
      where: {
        bookId_index: {
          bookId,
          index,
        },
      },
    });

    if (!targetPage) {
      throw new NotFoundException(`La page à l'index ${index} n'existe pas.`);
    }

    return this.prisma.$transaction(async (tx) => {
      const totalPages = await tx.page.count({ where: { bookId } });

      await tx.page.delete({
        where: { id: targetPage.id },
      });

      // Shift subsequent pages down by 1 sequentially in forward order
      for (let i = index + 1; i <= totalPages; i++) {
        await tx.page.update({
          where: {
            bookId_index: {
              bookId,
              index: i,
            },
          },
          data: {
            index: i - 1,
          },
        });
      }

      // Synchronize book.pages count
      const count = await tx.page.count({ where: { bookId } });
      await tx.book.update({
        where: { id: bookId },
        data: { pages: count },
      });

      return {
        message: `La page à l'index ${index} a été supprimée avec succès.`,
      };
    });
  }
}
