import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ClubRole } from '../../generated/prisma/client';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Analyse (parse) une chaîne CSV brute en respectant la spécification RFC 4180.
   * Gère les guillemets imbriqués, les retours à la ligne et les champs délimités par des virgules.
   *
   * @param csvText La chaîne de caractères CSV brute
   * @returns Un tableau de lignes, chaque ligne étant un tableau de chaînes représentant les colonnes
   */
  private parseCsv(csvText: string): string[][] {
    const lines: string[][] = [];
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;

    for (let i = 0; i < csvText.length; i++) {
      const char = csvText[i];
      const nextChar = csvText[i + 1];

      if (inQuotes) {
        if (char === '"') {
          if (nextChar === '"') {
            currentField += '"';
            i++; // skip next quote
          } else {
            inQuotes = false;
          }
        } else {
          currentField += char;
        }
      } else {
        if (char === '"') {
          inQuotes = true;
        } else if (char === ',') {
          currentRow.push(currentField.trim());
          currentField = '';
        } else if (char === '\r' || char === '\n') {
          currentRow.push(currentField.trim());
          currentField = '';
          if (
            currentRow.length > 0 &&
            (currentRow.length > 1 || currentRow[0] !== '')
          ) {
            lines.push(currentRow);
          }
          currentRow = [];
          if (char === '\r' && nextChar === '\n') {
            i++; // skip \n
          }
        } else {
          currentField += char;
        }
      }
    }
    if (currentRow.length > 0 || currentField !== '') {
      currentRow.push(currentField.trim());
      if (
        currentRow.length > 0 &&
        (currentRow.length > 1 || currentRow[0] !== '')
      ) {
        lines.push(currentRow);
      }
    }
    return lines;
  }

  /**
   * Liste tous les utilisateurs de l'application.
   * Classés par date de création décroissante.
   *
   * @returns Un tableau d'utilisateurs avec leurs profils et statuts d'activité
   */
  async listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Désactive un utilisateur de la plateforme. Un utilisateur désactivé ne peut plus se connecter
   * et perd temporairement l'accès aux ressources privées des clubs de lecture.
   *
   * @param id L'identifiant de l'utilisateur à désactiver
   * @throws NotFoundException Si l'utilisateur n'existe pas
   * @returns L'identifiant, l'email et le statut mis à jour de l'utilisateur
   */
  async deactivateUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID "${id}" non trouvé.`);
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive: false },
      select: { id: true, email: true, isActive: true },
    });
  }

  /**
   * Réactive le compte d'un utilisateur désactivé.
   *
   * @param id L'identifiant de l'utilisateur à réactiver
   * @throws NotFoundException Si l'utilisateur n'existe pas
   * @returns L'identifiant, l'email et le statut mis à jour de l'utilisateur
   */
  async reactivateUser(id: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) {
      throw new NotFoundException(`Utilisateur avec l'ID "${id}" non trouvé.`);
    }
    return this.prisma.user.update({
      where: { id },
      data: { isActive: true },
      select: { id: true, email: true, isActive: true },
    });
  }

  /**
   * Importe des livres en masse dans un club à partir d'un fichier CSV.
   * Valide chaque ligne et applique l'import de façon transactionnelle (tous les livres ou aucun).
   *
   * @param clubSlug Le slug du club de lecture destinataire
   * @param csv Le contenu textuel brut du fichier CSV
   * @throws NotFoundException Si le club n'existe pas
   * @throws BadRequestException Si le CSV est vide, mal formaté ou contient des erreurs de validation (DTO)
   * @returns Un objet indiquant le succès et le nombre total de livres créés
   */
  async importBooks(clubSlug: string, csv: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
    });
    if (!club) {
      throw new NotFoundException(
        `Le club avec le slug "${clubSlug}" n'existe pas.`,
      );
    }

    const rows = this.parseCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('Le fichier CSV est vide.');
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const titleIdx = headers.indexOf('title');
    const authorIdx = headers.indexOf('author');
    const genreIdx = headers.indexOf('genre');
    const pagesIdx = headers.indexOf('pages');

    if (
      titleIdx === -1 ||
      authorIdx === -1 ||
      genreIdx === -1 ||
      pagesIdx === -1
    ) {
      throw new BadRequestException(
        'En-têtes CSV invalides. Les colonnes requises sont: title, author, genre, pages.',
      );
    }

    const errors: { row: number; error: string }[] = [];
    const booksToCreate: any[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // Skip completely empty rows
      if (row.length === 0 || (row.length === 1 && row[0] === '')) {
        continue;
      }

      const title = row[titleIdx]?.trim();
      const author = row[authorIdx]?.trim();
      const genre = row[genreIdx]?.trim();
      const pagesRaw = row[pagesIdx]?.trim();

      const rowErrors: string[] = [];

      if (!title) {
        rowErrors.push('Le titre est obligatoire.');
      }
      if (!author) {
        rowErrors.push("L'auteur est obligatoire.");
      }
      if (!genre) {
        rowErrors.push('Le genre est obligatoire.');
      }

      const pages = Number(pagesRaw);
      if (!pagesRaw || isNaN(pages) || !Number.isInteger(pages) || pages <= 0) {
        rowErrors.push('Le nombre de pages doit être un entier positif.');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          error: rowErrors.join(' '),
        });
      } else {
        booksToCreate.push({
          title,
          author,
          genre,
          pages,
          clubId: club.id,
        });
      }
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Erreur de validation CSV',
        errors,
      });
    }

    // Run transaction
    await this.prisma.$transaction(async (tx) => {
      for (const book of booksToCreate) {
        await tx.book.create({ data: book });
      }
    });

    return { success: true, count: booksToCreate.length };
  }

  /**
   * Importe et associe en masse des utilisateurs à un club à partir d'un fichier CSV.
   * Valide les rôles et l'existence des utilisateurs, puis met à jour (ou crée) les adhésions
   * de façon transactionnelle.
   *
   * @param clubSlug Le slug du club de lecture
   * @param csv Le contenu textuel brut du fichier CSV
   * @throws NotFoundException Si le club n'existe pas
   * @throws BadRequestException Si le CSV est vide, mal formaté, ou contient des lignes en erreur (ex: utilisateur inexistant)
   * @returns Un objet de succès avec le nombre d'adhésions créées/mises à jour
   */
  async importMembers(clubSlug: string, csv: string) {
    const club = await this.prisma.club.findUnique({
      where: { slug: clubSlug },
    });
    if (!club) {
      throw new NotFoundException(
        `Le club avec le slug "${clubSlug}" n'existe pas.`,
      );
    }

    const rows = this.parseCsv(csv);
    if (rows.length === 0) {
      throw new BadRequestException('Le fichier CSV est vide.');
    }

    const headers = rows[0].map((h) => h.toLowerCase().trim());
    const emailIdx = headers.indexOf('email');
    const roleIdx = headers.indexOf('role');

    if (emailIdx === -1 || roleIdx === -1) {
      throw new BadRequestException(
        'En-têtes CSV invalides. Les colonnes requises sont: email, role.',
      );
    }

    const errors: { row: number; error: string }[] = [];
    const membersToUpsert: { userId: string; role: ClubRole }[] = [];

    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 1;

      // Skip completely empty rows
      if (row.length === 0 || (row.length === 1 && row[0] === '')) {
        continue;
      }

      const email = row[emailIdx]?.trim();
      const roleRaw = row[roleIdx]?.trim().toUpperCase();

      const rowErrors: string[] = [];

      if (!email) {
        rowErrors.push("L'email est obligatoire.");
      } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        rowErrors.push("Format d'email invalide.");
      }

      const validRoles = ['OWNER', 'EDITOR', 'READER'];
      if (!roleRaw) {
        rowErrors.push('Le rôle est obligatoire.');
      } else if (!validRoles.includes(roleRaw)) {
        rowErrors.push('Le rôle doit être OWNER, EDITOR ou READER.');
      }

      if (rowErrors.length > 0) {
        errors.push({
          row: rowNum,
          error: rowErrors.join(' '),
        });
        continue;
      }

      const dbUser = await this.prisma.user.findUnique({
        where: { email },
      });

      if (!dbUser) {
        errors.push({
          row: rowNum,
          error: `L'utilisateur avec l'email "${email}" n'existe pas.`,
        });
        continue;
      }

      membersToUpsert.push({
        userId: dbUser.id,
        role: roleRaw as ClubRole,
      });
    }

    if (errors.length > 0) {
      throw new BadRequestException({
        message: 'Erreur de validation CSV',
        errors,
      });
    }

    // Run transaction
    await this.prisma.$transaction(async (tx) => {
      for (const member of membersToUpsert) {
        await tx.clubMember.upsert({
          where: {
            userId_clubId: { userId: member.userId, clubId: club.id },
          },
          update: { role: member.role },
          create: {
            userId: member.userId,
            clubId: club.id,
            role: member.role,
          },
        });
      }
    });

    return { success: true, count: membersToUpsert.length };
  }

  /**
   * Supprime un avis (critique) de livre.
   * Cette action est réservée aux administrateurs pour modération.
   *
   * @param id L'identifiant de l'avis à supprimer
   * @throws NotFoundException Si l'avis n'existe pas
   * @returns Un objet confirmant le succès de la suppression
   */
  async deleteReview(id: string) {
    const review = await this.prisma.review.findUnique({
      where: { id },
    });

    if (!review) {
      throw new NotFoundException(`Avis avec l'ID "${id}" non trouvé.`);
    }

    await this.prisma.review.delete({
      where: { id },
    });

    return { success: true, message: 'Avis supprimé avec succès.' };
  }
}
