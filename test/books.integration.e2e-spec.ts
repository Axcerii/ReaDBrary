import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User, Club, Book } from '../generated/prisma/client';
import { App } from 'supertest/types';

dotenv.config();

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: string;
  };
}

let mockSession: BetterAuthSession | null = null;

jest.mock('../src/auth/auth', () => ({
  auth: {
    handler: jest.fn().mockResolvedValue({}),
    api: {
      getSession: jest.fn().mockImplementation(() => mockSession),
    },
  },
}));

describe('Module Books (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: Club;
  let ownerUser: User;
  let editorUser: User;
  let readerUser: User;
  let nonMemberUser: User;
  let adminUser: User;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AppModule],
    })
      .overrideProvider(ConfigService)
      .useValue({
        get: (key: string) => {
          if (key === 'DATABASE_URL') {
            const user = process.env.POSTGRES_USER;
            const pass = process.env.POSTGRES_PASSWORD;
            const port = process.env.POSTGRES_PORT_TEST;
            const db = process.env.POSTGRES_DB;
            return `postgresql://${user}:${pass}@localhost:${port}/${db}-test?schema=public`;
          }
          return process.env[key];
        },
      })
      .compile();

    app = moduleFixture.createNestApplication();
    prisma = app.get<PrismaService>(PrismaService);
    await app.init();
  });

  beforeEach(async () => {
    await prisma.cleanDatabase();

    // Create users
    ownerUser = await prisma.user.create({
      data: { email: 'owner@example.com', name: 'Owner User', role: 'USER' },
    });
    editorUser = await prisma.user.create({
      data: { email: 'editor@example.com', name: 'Editor User', role: 'USER' },
    });
    readerUser = await prisma.user.create({
      data: { email: 'reader@example.com', name: 'Reader User', role: 'USER' },
    });
    nonMemberUser = await prisma.user.create({
      data: {
        email: 'stranger@example.com',
        name: 'Stranger User',
        role: 'USER',
      },
    });
    adminUser = await prisma.user.create({
      data: { email: 'admin@example.com', name: 'Admin User', role: 'ADMIN' },
    });

    // Create club
    club = await prisma.club.create({
      data: { name: 'Club de Lecture E2E', slug: 'club-lecture-e2e' },
    });

    // Assign club roles
    await prisma.clubMember.createMany({
      data: [
        { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
        { clubId: club.id, userId: editorUser.id, role: 'EDITOR' },
        { clubId: club.id, userId: readerUser.id, role: 'READER' },
      ],
    });
  });

  afterAll(async () => {
    await app.close();
  });

  const authenticateAs = (user: User | null) => {
    if (!user) {
      mockSession = null;
    } else {
      mockSession = {
        user: {
          id: user.id,
          email: user.email,
          role: user.role,
        },
      };
    }
  };

  // Helper to bypass ESLint any warning for supertest request app.getHttpServer()
  const apiRequest = () =>
    request(app.getHttpServer() as App);

  describe('POST /clubs/:clubSlug/books', () => {
    it('devrait permettre à un OWNER de créer un livre', async () => {
      authenticateAs(ownerUser);

      const payload = {
        title: 'Le Petit Prince',
        author: 'Antoine de Saint-Exupéry',
        genre: 'Fable',
        pages: 96,
      };

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send(payload);

      expect(response.status).toBe(201);

      const body = response.body as Book;
      expect(body.title).toBe(payload.title);
      expect(body.clubId).toBe(club.id);

      const book = await prisma.book.findUnique({ where: { id: body.id } });
      expect(book).not.toBeNull();
    });

    it('devrait permettre à un EDITOR de créer un livre', async () => {
      authenticateAs(editorUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send({
          title: '1984',
          author: 'George Orwell',
          genre: 'Dystopie',
          pages: 328,
        });

      expect(response.status).toBe(201);
    });

    it('devrait interdire à un READER de créer un livre (403)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send({
          title: 'Interdit',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
        });

      expect(response.status).toBe(403);
    });

    it('devrait rejeter un utilisateur non authentifié (401)', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send({
          title: 'Anonyme',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
        });

      expect(response.status).toBe(401);
    });

    it('devrait permettre à un ADMIN global de créer un livre même hors club', async () => {
      authenticateAs(adminUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send({
          title: 'Bypass Admin',
          author: 'Admin',
          genre: 'Tech',
          pages: 500,
        });

      expect(response.status).toBe(201);
    });

    it('devrait échouer avec 400 Bad Request si les validations DTO échouent', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books`)
        .send({
          title: '', // Empty
          author: 'Auteur',
          genre: 'Genre',
          pages: -10, // Invalid pages
        });

      expect(response.status).toBe(400);

      const body = response.body as { message: string[] };
      expect(body.message).toContain('Le titre est obligatoire');
      expect(body.message).toContain(
        'Le nombre de pages doit être supérieur à 0',
      );
    });
  });

  describe('GET /clubs/:clubSlug/books', () => {
    beforeEach(async () => {
      await prisma.book.create({
        data: {
          title: 'Livre Un',
          author: 'Auteur A',
          genre: 'Sci-Fi',
          pages: 100,
          clubId: club.id,
          createdAt: new Date('2026-05-21T10:00:00Z'),
        },
      });
      await prisma.book.create({
        data: {
          title: 'Livre Deux',
          author: 'Auteur B',
          genre: 'Fantasy',
          pages: 200,
          clubId: club.id,
          createdAt: new Date('2026-05-21T11:00:00Z'),
        },
      });
      await prisma.book.create({
        data: {
          title: 'Livre Trois',
          author: 'Auteur A',
          genre: 'Sci-Fi',
          pages: 300,
          clubId: club.id,
          createdAt: new Date('2026-05-21T12:00:00Z'),
        },
      });
    });

    it('devrait permettre à un READER de lister tous les livres du club', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(`/clubs/${club.slug}/books`);

      expect(response.status).toBe(200);

      const books = response.body as Book[];
      expect(books).toHaveLength(3);
    });

    it('devrait filtrer les livres par auteur', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books?author=Auteur A`,
      );

      expect(response.status).toBe(200);

      const books = response.body as Book[];
      expect(books).toHaveLength(2);
      expect(books[0].title).toBe('Livre Trois');
    });

    it('devrait filtrer les livres par genre (insensible à la casse)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books?genre=fantasy`,
      );

      expect(response.status).toBe(200);

      const books = response.body as Book[];
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Livre Deux');
    });

    it('devrait paginer correctement les résultats', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books?page=2&limit=2`,
      );

      expect(response.status).toBe(200);

      const books = response.body as Book[];
      expect(books).toHaveLength(1);
      expect(books[0].title).toBe('Livre Un'); // Order by createdAt desc, page 2 has the first created
    });

    it('devrait masquer les livres inactifs pour READER et EDITOR, mais les afficher pour OWNER et ADMIN', async () => {
      await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          author: 'Auteur X',
          genre: 'Mystère',
          pages: 150,
          clubId: club.id,
          isActive: false,
        },
      });

      // READER : ne voit que les 3 livres actifs
      authenticateAs(readerUser);
      let res = await apiRequest().get(`/clubs/${club.slug}/books`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);
      expect(res.body.find((b: any) => b.title === 'Livre Inactif')).toBeUndefined();

      // EDITOR : ne voit que les 3 livres actifs
      authenticateAs(editorUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(3);

      // OWNER : voit les 4 livres
      authenticateAs(ownerUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      expect(res.body.find((b: any) => b.title === 'Livre Inactif')).toBeDefined();

      // ADMIN : voit les 4 livres
      authenticateAs(adminUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
    });

    it("devrait interdire l'accès à un non-membre (403)", async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(`/clubs/${club.slug}/books`);

      expect(response.status).toBe(403);
    });
  });

  describe('GET /clubs/:clubSlug/books/:id', () => {
    let createdBook: Book;

    beforeEach(async () => {
      createdBook = await prisma.book.create({
        data: {
          title: 'Livre Unique',
          author: 'Auteur',
          genre: 'Genre',
          pages: 150,
          clubId: club.id,
        },
      });
    });

    it('devrait retourner le livre pour un membre du club', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${createdBook.id}`,
      );

      expect(response.status).toBe(200);

      const body = response.body as Book;
      expect(body.title).toBe('Livre Unique');
    });

    it("devrait renvoyer 404 si le livre n'existe pas dans ce club", async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/non-existent-uuid`,
      );

      expect(response.status).toBe(404);
    });

    it('devrait retourner 404 pour un livre inactif pour READER et EDITOR, mais 200 pour OWNER et ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Secret Inactif',
          author: 'Auteur',
          genre: 'Genre',
          pages: 150,
          clubId: club.id,
          isActive: false,
        },
      });

      // READER
      authenticateAs(readerUser);
      let res = await apiRequest().get(`/clubs/${club.slug}/books/${inactiveBook.id}`);
      expect(res.status).toBe(404);

      // EDITOR
      authenticateAs(editorUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books/${inactiveBook.id}`);
      expect(res.status).toBe(404);

      // OWNER
      authenticateAs(ownerUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books/${inactiveBook.id}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toBe('Livre Secret Inactif');

      // ADMIN
      authenticateAs(adminUser);
      res = await apiRequest().get(`/clubs/${club.slug}/books/${inactiveBook.id}`);
      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /clubs/:clubSlug/books/:id', () => {
    let createdBook: Book;

    beforeEach(async () => {
      createdBook = await prisma.book.create({
        data: {
          title: 'Livre Original',
          author: 'Auteur',
          genre: 'Genre',
          pages: 150,
          clubId: club.id,
        },
      });
    });

    it('devrait permettre à un EDITOR de mettre à jour le livre', async () => {
      authenticateAs(editorUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${createdBook.id}`)
        .send({ title: 'Livre Modifié', pages: 180 });

      expect(response.status).toBe(200);

      const body = response.body as Book;
      expect(body.title).toBe('Livre Modifié');
      expect(body.pages).toBe(180);
    });

    it('devrait refuser la mise à jour à un READER (403)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${createdBook.id}`)
        .send({ title: 'Livre Hacked' });

      expect(response.status).toBe(403);
    });

    it('devrait interdire à un EDITOR de modifier isActive (403)', async () => {
      authenticateAs(editorUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${createdBook.id}`)
        .send({ isActive: false });

      expect(response.status).toBe(403);
    });

    it('devrait autoriser à un OWNER ou ADMIN de modifier isActive (200)', async () => {
      // Par l'OWNER
      authenticateAs(ownerUser);
      let response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${createdBook.id}`)
        .send({ isActive: false });
      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(false);

      // Par l'ADMIN (réactiver)
      authenticateAs(adminUser);
      response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${createdBook.id}`)
        .send({ isActive: true });
      expect(response.status).toBe(200);
      expect(response.body.isActive).toBe(true);
    });

    it('devrait renvoyer 404 si un EDITOR tente de modifier un livre inactif (car invisible pour lui)', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Inactif',
          author: 'Auteur',
          genre: 'Genre',
          pages: 150,
          clubId: club.id,
          isActive: false,
        },
      });

      authenticateAs(editorUser);
      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${inactiveBook.id}`)
        .send({ title: 'Nouveau titre' });

      expect(response.status).toBe(404);
    });
  });

  describe('DELETE /clubs/:clubSlug/books/:id', () => {
    let createdBook: Book;

    beforeEach(async () => {
      createdBook = await prisma.book.create({
        data: {
          title: 'Livre Mortel',
          author: 'Auteur',
          genre: 'Genre',
          pages: 150,
          clubId: club.id,
        },
      });
    });

    it('devrait permettre à un OWNER de supprimer le livre', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest().delete(
        `/clubs/${club.slug}/books/${createdBook.id}`,
      );

      expect(response.status).toBe(200);

      const book = await prisma.book.findUnique({
        where: { id: createdBook.id },
      });
      expect(book).toBeNull();
    });

    it('devrait refuser la suppression à un READER (403)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().delete(
        `/clubs/${club.slug}/books/${createdBook.id}`,
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /clubs/:clubSlug/books/export (Personal Bonus)', () => {
    beforeEach(async () => {
      await prisma.book.createMany({
        data: [
          {
            title: 'Livre A',
            author: 'Auteur A',
            genre: 'Genre A',
            pages: 100,
            clubId: club.id,
          },
          {
            title: 'Livre B',
            author: 'Auteur B',
            genre: 'Genre B',
            pages: 200,
            clubId: club.id,
          },
        ],
      });
    });

    it('devrait exporter la liste des livres au format CSV', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/export`,
      );

      expect(response.status).toBe(200);
      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.headers['content-disposition']).toContain(
        'library-club-lecture-e2e.csv',
      );

      const csvLines = response.text.split('\n');
      expect(csvLines[0]).toBe('id,title,author,genre,pages,createdAt');
      expect(csvLines[1]).toContain('Livre A');
      expect(csvLines[2]).toContain('Livre B');
    });

    it("devrait interdire l'export à un non-membre (403)", async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/export`,
      );

      expect(response.status).toBe(403);
    });

    it('devrait masquer les livres inactifs dans l’export CSV pour READER, mais les inclure pour OWNER', async () => {
      await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          author: 'Auteur C',
          genre: 'Genre C',
          pages: 150,
          clubId: club.id,
          isActive: false,
        },
      });

      // READER
      authenticateAs(readerUser);
      let response = await apiRequest().get(`/clubs/${club.slug}/books/export`);
      expect(response.status).toBe(200);
      let csvLines = response.text.trim().split('\n');
      // En-tête + Livre A + Livre B = 3 lignes
      expect(csvLines).toHaveLength(3);
      expect(response.text).not.toContain('Livre Inactif');

      // OWNER
      authenticateAs(ownerUser);
      response = await apiRequest().get(`/clubs/${club.slug}/books/export`);
      expect(response.status).toBe(200);
      csvLines = response.text.trim().split('\n');
      // En-tête + Livre A + Livre B + Livre Inactif = 4 lignes
      expect(csvLines).toHaveLength(4);
      expect(response.text).toContain('Livre Inactif');
    });
  });
});
