import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { CreateBookDto } from './dto/create-book.dto';
import { UpdateBookDto } from './dto/update-book.dto';
import { BookQueryDto } from './dto/book-query.dto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BooksService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Récupère l'ID d'un club de lecture à partir de son slug.
   *
   * @param clubSlug Le slug unique du club
   * @throws NotFoundException Si le club n'est pas trouvé
   * @returns L'identifiant (ID) du club
   */
  private async getClubIdBySlug(clubSlug: string): Promise<string> {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
    });
    if (!club) {
      throw new NotFoundException(
        `Le club avec le slug "${clubSlug}" n'existe pas.`,
      );
    }
    return club.id;
  }

  /**
   * Crée un nouveau livre associé à un club de lecture.
   *
   * @param clubSlug Le slug du club auquel attacher le livre
   * @param createBookDto Les données du livre à créer
   * @returns Le livre créé avec averageRating initialisé à null
   */
  async create(clubSlug: string, createBookDto: CreateBookDto) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const createdBook = await this.prisma.book.create({
      data: {
        title: createBookDto.title,
        author: createBookDto.author,
        genre: createBookDto.genre,
        pages: createBookDto.pages ?? 0,
        theme: createBookDto.theme,
        clubId,
      },
    });

    return {
      ...createdBook,
      averageRating: null,
    };
  }

  /**
   * Récupère tous les livres d'un club de lecture avec filtres de recherche et pagination.
   * Calcule et injecte la note moyenne de chaque livre dans la réponse.
   * - Les membres READER et EDITOR ne voient que les livres actifs.
   * - Les OWNER et ADMIN globaux voient également les livres inactifs.
   *
   * @param clubSlug Le slug du club de lecture
   * @param query Les filtres optionnels (titre, auteur, genre) et pagination (page, limite)
   * @param userStatus Le statut/rôle de l'utilisateur demandeur
   * @returns La liste paginée des livres avec leur note moyenne
   */
  async findAll(
    clubSlug: string,
    query: BookQueryDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);

    const page = Number(query.page ?? 1);
    const limit = Number(query.limit ?? 10);

    const whereClause: any = {
      clubId,
      title: query.title
        ? { contains: query.title, mode: 'insensitive' }
        : undefined,
      author: query.author
        ? { contains: query.author, mode: 'insensitive' }
        : undefined,
      genre: query.genre
        ? { contains: query.genre, mode: 'insensitive' }
        : undefined,
    };

    if (!userStatus.isAdmin && !userStatus.isOwner) {
      whereClause.isActive = true;
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      skip: (page - 1) * limit,
      take: limit,
      orderBy: { createdAt: 'desc' },
    });

    const bookIds = books.map((book) => book.id);
    const avgRatings = await this.prisma.review.groupBy({
      by: ['bookId'],
      where: {
        bookId: { in: bookIds },
      },
      _avg: {
        rating: true,
      },
    });

    const ratingMap = new Map<string, number | null>();
    for (const item of avgRatings) {
      ratingMap.set(item.bookId, item._avg.rating);
    }

    return books.map((book) => ({
      ...book,
      averageRating: ratingMap.get(book.id) ?? null,
    }));
  }

  /**
   * Récupère un livre spécifique par son identifiant.
   * Calcule et renvoie la note moyenne calculée sur l'ensemble des revues de ce livre.
   *
   * @param clubSlug Le slug du club de lecture
   * @param id L'identifiant du livre
   * @param userStatus Le statut/rôle de l'utilisateur demandeur
   * @throws NotFoundException Si le livre n'existe pas ou s'il est inactif et inaccessible pour l'utilisateur
   * @returns Le livre trouvé agrémenté de sa note moyenne (averageRating)
   */
  async findOne(
    clubSlug: string,
    id: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const book = await this.prisma.book.findFirst({
      where: {
        id,
        clubId,
      },
    });

    if (!book) {
      throw new NotFoundException(
        `Le livre avec l'ID "${id}" n'existe pas dans ce club.`,
      );
    }

    if (!book.isActive && !userStatus.isAdmin && !userStatus.isOwner) {
      throw new NotFoundException(
        `Le livre avec l'ID "${id}" n'existe pas dans ce club.`,
      );
    }

    const reviewsAggregate = await this.prisma.review.aggregate({
      where: { bookId: book.id },
      _avg: {
        rating: true,
      },
    });

    return {
      ...book,
      averageRating: reviewsAggregate._avg.rating ?? null,
    };
  }

  /**
   * Modifie les informations d'un livre existant.
   * Seuls les administrateurs globaux et propriétaires de club ont le droit d'activer/désactiver un livre.
   *
   * @param clubSlug Le slug du club de lecture
   * @param id L'identifiant du livre
   * @param updateBookDto Les modifications à appliquer
   * @param userStatus Le statut/rôle de l'utilisateur demandeur
   * @throws ForbiddenException Si l'utilisateur tente de modifier isActive sans privilèges suffisants
   * @returns Le livre modifié
   */
  async update(
    clubSlug: string,
    id: string,
    updateBookDto: UpdateBookDto,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.findOne(clubSlug, id, userStatus);

    if (updateBookDto.isActive !== undefined) {
      if (!userStatus.isAdmin && !userStatus.isOwner) {
        throw new ForbiddenException(
          "Seuls l'administrateur ou le propriétaire du club peuvent modifier le statut d'activité.",
        );
      }
    }

    const updatedBook = await this.prisma.book.update({
      where: { id: book.id },
      data: updateBookDto,
    });

    return {
      ...updatedBook,
      averageRating: book.averageRating,
    };
  }

  /**
   * Supprime un livre d'un club de lecture.
   *
   * @param clubSlug Le slug du club de lecture
   * @param id L'identifiant du livre à supprimer
   * @param userStatus Le statut/rôle de l'utilisateur demandeur
   * @returns Le livre supprimé
   */
  async remove(
    clubSlug: string,
    id: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ) {
    const book = await this.findOne(clubSlug, id, userStatus);

    return this.prisma.book.delete({
      where: { id: book.id },
    });
  }

  /**
   * Exporte l'ensemble de la bibliothèque d'un club sous format CSV.
   * Applique le filtrage de visibilité (les livres inactifs sont masqués aux membres normaux).
   *
   * @param clubSlug Le slug du club de lecture
   * @param userStatus Le statut/rôle de l'utilisateur demandeur
   * @returns Le contenu textuel brut du fichier CSV généré
   */
  async exportCsv(
    clubSlug: string,
    userStatus: { isAdmin: boolean; isOwner: boolean },
  ): Promise<string> {
    const clubId = await this.getClubIdBySlug(clubSlug);
    const whereClause: any = { clubId };
    if (!userStatus.isAdmin && !userStatus.isOwner) {
      whereClause.isActive = true;
    }

    const books = await this.prisma.book.findMany({
      where: whereClause,
      orderBy: { title: 'asc' },
    });

    let csvContent = 'id,title,author,genre,pages,createdAt\n';
    for (const book of books) {
      const escape = (val: any) => {
        const str = String(val ?? '');
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      };

      csvContent += `${escape(book.id)},${escape(book.title)},${escape(book.author)},${escape(book.genre)},${book.pages},${escape(book.createdAt.toISOString())}\n`;
    }

    return csvContent;
  }
}
