import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User, Club, Book } from '../generated/prisma/client';

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

describe('Module Pages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: Club;
  let book: Book;
  let ownerUser: User;
  let editorUser: User;
  let readerUser: User;
  let nonMemberUser: User;
  let adminUser: User;
  let tempFilePath: string;

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

    // Create a temporary file for upload testing
    tempFilePath = path.join(__dirname, 'temp-test-image.jpg');
    fs.writeFileSync(tempFilePath, 'fake-image-content');
  });

  afterAll(async () => {
    await app.close();
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
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

    // Create a book (initially 0 pages, will grow as pages are added)
    book = await prisma.book.create({
      data: {
        title: 'Livre E2E',
        author: 'Auteur E2E',
        genre: 'Sci-Fi',
        pages: 0,
        clubId: club.id,
      },
    });
  });

  describe('POST /clubs/:clubSlug/books/:bookId/pages', () => {
    it('devrait permettre à un EDITOR ou OWNER de créer une page et décaler les suivantes', async () => {
      mockSession = {
        user: { id: editorUser.id, email: editorUser.email, role: 'USER' },
      };

      // 1. Create page 1
      const res1 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages`)
        .send({
          index: 1,
          title: 'Page 1',
          text: 'Contenu 1',
        })
        .expect(201);

      expect(res1.body.index).toBe(1);
      expect(res1.body.title).toBe('Page 1');

      // 2. Create page 2 at end
      const res2 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages`)
        .send({
          index: 2,
          title: 'Page 2',
          text: 'Contenu 2',
        })
        .expect(201);

      expect(res2.body.index).toBe(2);

      // Verify book pages updated to 2
      let updatedBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(updatedBook?.pages).toBe(2);

      // 3. Insert page at index 1 (should shift index 1->2, 2->3)
      const res3 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages`)
        .send({
          index: 1,
          title: 'Nouvelle Page 1',
          text: 'Contenu Nouveau',
        })
        .expect(201);

      expect(res3.body.index).toBe(1);

      // Check final pages in DB
      const pages = await prisma.page.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(pages.length).toBe(3);
      expect(pages[0].title).toBe('Nouvelle Page 1');
      expect(pages[0].index).toBe(1);

      expect(pages[1].title).toBe('Page 1');
      expect(pages[1].index).toBe(2);

      expect(pages[2].title).toBe('Page 2');
      expect(pages[2].index).toBe(3);

      updatedBook = await prisma.book.findUnique({ where: { id: book.id } });
      expect(updatedBook?.pages).toBe(3);
    });

    it('devrait interdire la création de page à un READER', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages`)
        .send({
          index: 1,
          title: 'Page 1',
          text: 'Reader try',
        })
        .expect(403);
    });

    it('devrait renvoyer 400 Bad Request si l index est hors limite', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      // Cannot create at index 2 since total pages is 0
      await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages`)
        .send({
          index: 2,
          title: 'Page 2',
          text: 'Contenu 2',
        })
        .expect(400);
    });
  });

  describe('POST /clubs/:clubSlug/books/:bookId/pages/upload', () => {
    it('devrait permettre de charger une image et renvoyer son URL', async () => {
      mockSession = {
        user: { id: editorUser.id, email: editorUser.email, role: 'USER' },
      };

      const res = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/pages/upload`)
        .attach('file', tempFilePath)
        .expect(201);

      expect(res.body.url).toBeDefined();
      expect(res.body.url).toContain('/uploads/');
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/pages', () => {
    it('devrait retourner les pages avec pagination', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      // Create 3 pages first
      await prisma.page.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'P1', text: 'T1' },
          { bookId: book.id, index: 2, title: 'P2', text: 'T2' },
          { bookId: book.id, index: 3, title: 'P3', text: 'T3' },
        ],
      });

      // Update book count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 3 },
      });

      const res = await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/pages`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].index).toBe(1);
      expect(res.body.data[1].index).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/pages/:index', () => {
    it('devrait retourner une page spécifique ou 404 si absente', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      await prisma.page.create({
        data: { bookId: book.id, index: 1, title: 'Page 1', text: 'T1' },
      });

      const res = await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/pages/1`)
        .expect(200);

      expect(res.body.title).toBe('Page 1');

      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/pages/2`)
        .expect(404);
    });

    it('devrait masquer les pages d un livre désactivé aux membres classiques (404)', async () => {
      // Deactivate book
      await prisma.book.update({
        where: { id: book.id },
        data: { isActive: false },
      });

      await prisma.page.create({
        data: { bookId: book.id, index: 1, title: 'Page Secrete', text: 'T1' },
      });

      // Readers get 404
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };
      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/pages/1`)
        .expect(404);

      // Owner can read it
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };
      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/pages/1`)
        .expect(200);
    });
  });

  describe('PATCH /clubs/:clubSlug/books/:bookId/pages/:index', () => {
    it('devrait permettre de modifier les données et l index (avec shifting)', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      await prisma.page.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'P1', text: 'T1' },
          { bookId: book.id, index: 2, title: 'P2', text: 'T2' },
          { bookId: book.id, index: 3, title: 'P3', text: 'T3' },
        ],
      });

      // Update pages count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 3 },
      });

      // Move P2 (index 2) to index 1
      await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/books/${book.id}/pages/2`)
        .send({
          index: 1,
          title: 'P2 Modifiée',
        })
        .expect(200);

      const pages = await prisma.page.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(pages[0].title).toBe('P2 Modifiée');
      expect(pages[0].index).toBe(1);

      expect(pages[1].title).toBe('P1');
      expect(pages[1].index).toBe(2);

      expect(pages[2].title).toBe('P3');
      expect(pages[2].index).toBe(3);
    });
  });

  describe('DELETE /clubs/:clubSlug/books/:bookId/pages/:index', () => {
    it('devrait supprimer une page et décaler les suivantes vers le bas', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      await prisma.page.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'P1', text: 'T1' },
          { bookId: book.id, index: 2, title: 'P2', text: 'T2' },
          { bookId: book.id, index: 3, title: 'P3', text: 'T3' },
        ],
      });

      // Update pages count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 3 },
      });

      await request(app.getHttpServer())
        .delete(`/clubs/${club.slug}/books/${book.id}/pages/2`)
        .expect(200);

      const pages = await prisma.page.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(pages.length).toBe(2);
      expect(pages[0].title).toBe('P1');
      expect(pages[0].index).toBe(1);

      expect(pages[1].title).toBe('P3');
      expect(pages[1].index).toBe(2);

      const updatedBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(updatedBook?.pages).toBe(2);
    });
  });

  describe('Integration Progression', () => {
    it('devrait inclure currentPageDetails dans la reponse de progression', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      // Create 2 pages
      await prisma.page.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'Intro', text: 'C1' },
          { bookId: book.id, index: 2, title: 'Chapitre 1', text: 'C2' },
        ],
      });

      // Update book count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 2 },
      });

      // Set user progression to page 2
      await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/books/${book.id}/progression`)
        .send({ currentPage: 2 })
        .expect(200);

      // Fetch progression
      const res = await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/progression`)
        .expect(200);

      expect(res.body.currentPage).toBe(2);
      expect(res.body.currentPageDetails).toBeDefined();
      expect(res.body.currentPageDetails.title).toBe('Chapitre 1');
      expect(res.body.currentPageDetails.text).toBe('C2');
    });
  });
});
