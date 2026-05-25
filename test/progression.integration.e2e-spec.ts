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

describe('Progression Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: Club;
  let book: Book;
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
    it('should allow a member (READER) to update their progression', async () => {
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

    it('should allow a member (READER) to modify an existing progression', async () => {
      authenticateAs(readerUser);

      // First progression
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 25 });

      // Second progression
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

    it('should forbid a non-member from updating their progression (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(403);
    });

    it('should return 401 for an unauthenticated user', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(401);
    });

    it('should fail with 400 if the page is negative', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: -5,
        });

      expect(response.status).toBe(400);
    });

    it('should fail with 400 if the page is not an integer', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 30.5,
        });

      expect(response.status).toBe(400);
    });

    it('should fail with 400 if the page exceeds the total page count of the book', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({
          currentPage: 101, // The book has 100 pages
        });

      expect(response.status).toBe(400);
      const body = response.body as { message: string | string[] };
      const message = Array.isArray(body.message)
        ? body.message.join(' ')
        : body.message;
      expect(message).toContain('ne peut pas dépasser');
    });

    it('should return 404 if the book does not belong to the club', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/books/non-existent-uuid/progression`)
        .send({
          currentPage: 10,
        });

      expect(response.status).toBe(404);
    });

    it('should return 404 when updating progression on an inactive book for a READER, but 200 for OWNER and ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
          clubId: club.id,
          isActive: false,
        },
      });

      // READER
      authenticateAs(readerUser);
      let res = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${inactiveBook.id}/progression`)
        .send({ currentPage: 20 });
      expect(res.status).toBe(404);

      // OWNER
      authenticateAs(ownerUser);
      res = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${inactiveBook.id}/progression`)
        .send({ currentPage: 30 });
      expect(res.status).toBe(200);

      // ADMIN
      authenticateAs(adminUser);
      res = await apiRequest()
        .patch(`/clubs/${club.slug}/books/${inactiveBook.id}/progression`)
        .send({ currentPage: 40 });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/progression', () => {
    it('should return currentPage = 0 if no progression has been recorded', async () => {
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

    it('should return the correct recorded progression', async () => {
      authenticateAs(readerUser);

      // Record progression
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

    it('should deny access to a non-member (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progression`,
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 when reading progression on an inactive book for a READER, but 200 for OWNER and ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
          clubId: club.id,
          isActive: false,
        },
      });

      await prisma.progression.create({
        data: {
          userId: ownerUser.id,
          bookId: inactiveBook.id,
          currentPage: 50,
        },
      });

      // READER
      authenticateAs(readerUser);
      let res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progression`,
      );
      expect(res.status).toBe(404);

      // OWNER
      authenticateAs(ownerUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progression`,
      );
      expect(res.status).toBe(200);
      expect(res.body.currentPage).toBe(50);

      // ADMIN
      authenticateAs(adminUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progression`,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/progressions', () => {
    beforeEach(async () => {
      // Record progressions directly or via API
      authenticateAs(readerUser);
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 60 });

      authenticateAs(editorUser);
      await apiRequest()
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 90 });
    });

    it('should allow the OWNER to view the global club progression', async () => {
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

      expect(ownerProg!.currentPage).toBe(0); // not started
      expect(ownerProg!.progressPercentage).toBe(0);
      expect(ownerProg!.userName).toBe(ownerUser.name);

      expect(editorProg!.currentPage).toBe(90);
      expect(editorProg!.progressPercentage).toBe(90);
      expect(editorProg!.userName).toBe(editorUser.name);

      expect(readerProg!.currentPage).toBe(60);
      expect(readerProg!.progressPercentage).toBe(60);
      expect(readerProg!.userName).toBe(readerUser.name);
    });

    it('should allow the EDITOR to view the global club progression', async () => {
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

    it('should forbid the READER from viewing the global progression (403)', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(403);
    });

    it('should forbid non-members from viewing the global progression (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/progressions`,
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 when viewing the global progression of an inactive book for an EDITOR, but 200 for OWNER and ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
          clubId: club.id,
          isActive: false,
        },
      });

      // EDITOR
      authenticateAs(editorUser);
      let res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progressions`,
      );
      expect(res.status).toBe(404);

      // OWNER
      authenticateAs(ownerUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progressions`,
      );
      expect(res.status).toBe(200);

      // ADMIN
      authenticateAs(adminUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/progressions`,
      );
      expect(res.status).toBe(200);
    });
  });
});
