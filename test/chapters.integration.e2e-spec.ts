/* eslint-disable @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument */
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

describe('Chapters Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let club: Club;
  let book: Book;
  let ownerUser: User;
  let editorUser: User;
  let readerUser: User;
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

    // Create a book (initially 0 pages, will grow as chapters are added)
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

  describe('POST /clubs/:clubSlug/books/:bookId/chapters', () => {
    it('should allow an EDITOR or OWNER to create a chapter and shift subsequent ones', async () => {
      mockSession = {
        user: { id: editorUser.id, email: editorUser.email, role: 'USER' },
      };

      // 1. Create chapter 1 with 1 virtual page
      const res1 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .send({
          index: 1,
          title: 'Chapitre 1',
          content: 'Contenu 1',
        })
        .expect(201);

      expect(res1.body.index).toBe(1);
      expect(res1.body.title).toBe('Chapitre 1');

      // Verify book pages updated to 1
      let updatedBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(updatedBook?.pages).toBe(1);

      // 2. Create chapter 2 with 2 virtual pages (using --- delimiter)
      const res2 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .send({
          index: 2,
          title: 'Chapitre 2',
          content: 'Partie A\n---\nPartie B',
        })
        .expect(201);

      expect(res2.body.index).toBe(2);

      // Verify book pages updated to 1 + 2 = 3
      updatedBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(updatedBook?.pages).toBe(3);

      // 3. Insert chapter at index 1 (should shift index 1->2, 2->3)
      const res3 = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .send({
          index: 1,
          title: 'Nouveau Chapitre 1',
          content: 'Nouveau Contenu\n<!-- pagebreak -->\nSeconde page', // 2 virtual pages
        })
        .expect(201);

      expect(res3.body.index).toBe(1);

      // Check final chapters in DB
      const chapters = await prisma.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(chapters.length).toBe(3);
      expect(chapters[0].title).toBe('Nouveau Chapitre 1');
      expect(chapters[0].index).toBe(1);

      expect(chapters[1].title).toBe('Chapitre 1');
      expect(chapters[1].index).toBe(2);

      expect(chapters[2].title).toBe('Chapitre 2');
      expect(chapters[2].index).toBe(3);

      // Verify book pages updated to 2 (nouveau ch1) + 1 (ch1) + 2 (ch2) = 5
      updatedBook = await prisma.book.findUnique({ where: { id: book.id } });
      expect(updatedBook?.pages).toBe(5);
    });

    it('should forbid chapter creation for a READER', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .send({
          index: 1,
          title: 'Chapitre 1',
          content: 'Reader try',
        })
        .expect(403);
    });

    it('should return 400 Bad Request if the index is out of bounds', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      // Cannot create at index 2 since total chapters is 0
      await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .send({
          index: 2,
          title: 'Chapitre 2',
          content: 'Contenu 2',
        })
        .expect(400);
    });
  });

  describe('POST /clubs/:clubSlug/books/:bookId/chapters/upload', () => {
    it('should allow uploading an image and return its URL', async () => {
      mockSession = {
        user: { id: editorUser.id, email: editorUser.email, role: 'USER' },
      };

      const res = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/books/${book.id}/chapters/upload`)
        .attach('file', tempFilePath)
        .expect(201);

      expect(res.body.url).toBeDefined();
      expect(res.body.url).toContain('/uploads/');
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/chapters', () => {
    it('should return chapters with pagination', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      // Create 3 chapters first
      await prisma.chapter.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'C1', content: 'T1' },
          { bookId: book.id, index: 2, title: 'C2', content: 'T2' },
          { bookId: book.id, index: 3, title: 'C3', content: 'T3' },
        ],
      });

      const res = await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/chapters`)
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(res.body.data.length).toBe(2);
      expect(res.body.data[0].index).toBe(1);
      expect(res.body.data[1].index).toBe(2);
      expect(res.body.meta.total).toBe(3);
      expect(res.body.meta.totalPages).toBe(2);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/chapters/:index', () => {
    it('should return a specific chapter or 404 if absent', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      await prisma.chapter.create({
        data: { bookId: book.id, index: 1, title: 'Chapitre 1', content: 'T1' },
      });

      const res = await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/chapters/1`)
        .expect(200);

      expect(res.body.title).toBe('Chapitre 1');

      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/chapters/2`)
        .expect(404);
    });

    it('should hide chapters of a deactivated book from standard members (404)', async () => {
      // Deactivate book
      await prisma.book.update({
        where: { id: book.id },
        data: { isActive: false },
      });

      await prisma.chapter.create({
        data: {
          bookId: book.id,
          index: 1,
          title: 'Chapitre Secret',
          content: 'T1',
        },
      });

      // Readers get 404
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };
      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/chapters/1`)
        .expect(404);

      // Owner can read it
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };
      await request(app.getHttpServer())
        .get(`/clubs/${club.slug}/books/${book.id}/chapters/1`)
        .expect(200);
    });
  });

  describe('PATCH /clubs/:clubSlug/books/:bookId/chapters/:index', () => {
    it('should allow modifying data and index (with shifting)', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      await prisma.chapter.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'C1', content: 'T1' },
          { bookId: book.id, index: 2, title: 'C2', content: 'T2' },
          { bookId: book.id, index: 3, title: 'C3', content: 'T3' },
        ],
      });

      // Move C2 (index 2) to index 1
      await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/books/${book.id}/chapters/2`)
        .send({
          index: 1,
          title: 'C2 Modifiée',
        })
        .expect(200);

      const chapters = await prisma.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(chapters[0].title).toBe('C2 Modifiée');
      expect(chapters[0].index).toBe(1);

      expect(chapters[1].title).toBe('C1');
      expect(chapters[1].index).toBe(2);

      expect(chapters[2].title).toBe('C3');
      expect(chapters[2].index).toBe(3);
    });
  });

  describe('DELETE /clubs/:clubSlug/books/:bookId/chapters/:index', () => {
    it('should delete a chapter and shift subsequent chapters down', async () => {
      mockSession = {
        user: { id: ownerUser.id, email: ownerUser.email, role: 'USER' },
      };

      await prisma.chapter.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'C1', content: 'T1' },
          { bookId: book.id, index: 2, title: 'C2', content: 'T2\n---\nT2.2' }, // 2 pages
          { bookId: book.id, index: 3, title: 'C3', content: 'T3' },
        ],
      });

      // Set initial count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 4 },
      });

      await request(app.getHttpServer())
        .delete(`/clubs/${club.slug}/books/${book.id}/chapters/2`)
        .expect(200);

      const chapters = await prisma.chapter.findMany({
        where: { bookId: book.id },
        orderBy: { index: 'asc' },
      });

      expect(chapters.length).toBe(2);
      expect(chapters[0].title).toBe('C1');
      expect(chapters[0].index).toBe(1);

      expect(chapters[1].title).toBe('C3');
      expect(chapters[1].index).toBe(2);

      // Virtual pages are now C1 (1) + C3 (1) = 2
      const updatedBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(updatedBook?.pages).toBe(2);
    });
  });

  describe('Integration Progression', () => {
    it('should include currentPageDetails resolved virtually in the progression response', async () => {
      mockSession = {
        user: { id: readerUser.id, email: readerUser.email, role: 'USER' },
      };

      // Create 2 chapters
      await prisma.chapter.createMany({
        data: [
          { bookId: book.id, index: 1, title: 'Intro', content: 'C1' },
          {
            bookId: book.id,
            index: 2,
            title: 'Chapitre 1',
            content: 'Partie A\n---\nPartie B',
          }, // global page 2 & 3
        ],
      });

      // Update book count
      await prisma.book.update({
        where: { id: book.id },
        data: { pages: 3 },
      });

      // Set user progression to page 2 (first page of Chapter 1)
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
      expect(res.body.currentPageDetails.text).toBe('Partie A');
    });
  });
});
