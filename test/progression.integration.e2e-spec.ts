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

describe('Module Progression (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: Club;
  let book: Book;
  let ownerUser: User;
  let editorUser: User;
  let readerUser: User;
  let nonMemberUser: User;

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

    // Create a book in the club with 100 pages
    book = await prisma.book.create({
      data: {
        title: 'Le Petit Prince',
        author: 'Antoine de Saint-Exupéry',
        genre: 'Fable',
        pages: 100,
        clubId: club.id,
      },
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

  const apiRequest = () => request(app.getHttpServer() as App);

  describe('PATCH /clubs/:clubSlug/books/:bookId/progression', () => {
    it('devrait permettre à un membre (READER) de mettre à jour sa progression', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 50,
        });

      expect(response.status).toBe(200);
      const body = response.body as {
        currentPage: number;
        userId: string;
        bookId: string;
        progressPercentage: number;
      };
      expect(body.currentPage).toBe(50);
      expect(body.userId).toBe(readerUser.id);
      expect(body.bookId).toBe(book.id);
      expect(body.progressPercentage).toBe(50);
    });

    it('devrait permettre à un membre (READER) de modifier une progression existante', async () => {
      authenticateAs(readerUser);

      // Première progression
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 25 });

      // Deuxième progression
      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 75 });

      expect(response.status).toBe(200);
      const body = response.body as {
        currentPage: number;
        progressPercentage: number;
      };
      expect(body.currentPage).toBe(75);
      expect(body.progressPercentage).toBe(75);
    });

    it('devrait interdire à un non-membre de mettre à jour sa progression (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(403);
    });

    it('devrait renvoyer 401 pour un utilisateur non authentifié', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(401);
    });

    it('devrait échouer avec 400 si la page est négative', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: -5,
        });

      expect(response.status).toBe(400);
    });

    it('devrait échouer avec 400 si la page n’est pas un entier', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 30.5,
        });

      expect(response.status).toBe(400);
    });

    it('devrait échouer avec 400 si la page dépasse le nombre total de pages du livre', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 101, // Le livre a 100 pages
        });

      expect(response.status).toBe(400);
      const body = response.body as { message: string | string[] };
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;
      expect(message).toContain('ne peut pas dépasser');
    });

    it("devrait renvoyer 404 si le livre n'appartient pas au club", async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/non-existent-uuid/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(404);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/progression', () => {
    it('devrait retourner currentPage = 0 si aucune progression n’a été enregistrée', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progression`,
      );

      expect(response.status).toBe(200);
      const body = response.body as {
        currentPage: number;
        progressPercentage: number;
        id: string | null;
      };
      expect(body.currentPage).toBe(0);
      expect(body.progressPercentage).toBe(0);
      expect(body.id).toBeNull();
    });

    it('devrait retourner la progression enregistrée correcte', async () => {
      authenticateAs(readerUser);

      // Enregistrer progression
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 40 });

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progression`,
      );

      expect(response.status).toBe(200);
      const body = response.body as {
        currentPage: number;
        progressPercentage: number;
        id: string | null;
      };
      expect(body.currentPage).toBe(40);
      expect(body.progressPercentage).toBe(40);
      expect(body.id).not.toBeNull();
    });

    it('devrait interdire l’accès à un non-membre (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progression`,
      );

      expect(response.status).toBe(403);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/progressions', () => {
    beforeEach(async () => {
      // Enregistrer des progressions directes ou via API
      authenticateAs(readerUser);
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 60 });

      authenticateAs(editorUser);
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 90 });
    });

    it('devrait permettre à l’OWNER de consulter la progression globale du club', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(200);

      const body = response.body as Array<{
        userId: string;
        userName: string | null;
        userEmail: string;
        currentPage: number;
        progressPercentage: number;
        updatedAt: string | null;
      }>;
      expect(body).toHaveLength(3); // owner, editor, reader

      const ownerProg = body.find((p) => p.userId === ownerUser.id);
      const editorProg = body.find((p) => p.userId === editorUser.id);
      const readerProg = body.find((p) => p.userId === readerUser.id);

      expect(ownerProg).toBeDefined();
      expect(editorProg).toBeDefined();
      expect(readerProg).toBeDefined();

      expect(ownerProg!.currentPage).toBe(0); // non commencé
      expect(ownerProg!.progressPercentage).toBe(0);
      expect(ownerProg!.userName).toBe(ownerUser.name);

      expect(editorProg!.currentPage).toBe(90);
      expect(editorProg!.progressPercentage).toBe(90);
      expect(editorProg!.userName).toBe(editorUser.name);

      expect(readerProg!.currentPage).toBe(60);
      expect(readerProg!.progressPercentage).toBe(60);
      expect(readerProg!.userName).toBe(readerUser.name);
    });

    it('devrait permettre à l’EDITOR de consulter la progression globale du club', async () => {
      authenticateAs(editorUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(200);
      const body = response.body as Array<{
        userId: string;
      }>;
      expect(body).toHaveLength(3);
    });

    it('devrait interdire au READER de consulter la progression globale (403)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(403);
    });

    it('devrait interdire au non-membre de consulter la progression globale (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(403);
    });
  });
});
