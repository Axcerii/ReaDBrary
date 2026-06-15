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

describe('Reviews Module (e2e)', () => {
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

    // Create a book in the club
    book = await prisma.book.create({
      data: {
        title: 'Le Petit Prince',
        slug: 'le-petit-prince',
        author: 'Antoine de Saint-Exupéry',
        genre: 'Fable',
        pages: 96,
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

  describe('POST /clubs/:clubSlug/books/:bookId/reviews', () => {
    it('should allow a member (READER) to give their review', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 5,
          comment: 'Chef-d’œuvre absolu !',
        });

      expect(response.status).toBe(201);
      expect(response.body.rating).toBe(5);
      expect(response.body.comment).toBe('Chef-d’œuvre absolu !');
      expect(response.body.userId).toBe(readerUser.id);
      expect(response.body.bookId).toBe(book.id);
      expect(response.body.user.name).toBe(readerUser.name);
    });

    it('should forbid a non-member from giving a review (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 4,
          comment: 'Pas mal',
        });

      expect(response.status).toBe(403);
    });

    it('should return 401 for an unauthenticated user', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 3,
        });

      expect(response.status).toBe(401);
    });

    it('should fail with 400 Bad Request if the rating is invalid (e.g. 0 or 6)', async () => {
      authenticateAs(readerUser);

      const response1 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 6,
        });
      expect(response1.status).toBe(400);

      const response2 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 0,
        });
      expect(response2.status).toBe(400);

      const response3 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 4.5, // float is not int
        });
      expect(response3.status).toBe(400);
    });

    it('should fail with 409 Conflict if a user submits multiple reviews for the same book (uniqueness)', async () => {
      authenticateAs(readerUser);

      // First review
      const res1 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({ rating: 4, comment: 'Premier commentaire' });
      expect(res1.status).toBe(201);

      // Second review (should fail)
      const res2 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({ rating: 2, comment: 'Deuxième commentaire' });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain('déjà donné votre avis');
    });

    it('should return 404 if the book does not belong to the club', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/non-existent-uuid/reviews`)
        .send({
          rating: 5,
        });

      expect(response.status).toBe(404);
    });

    it('should return 404 when submitting a review on an inactive book for a READER, but 201 for OWNER and ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          slug: 'livre-inactif-1',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
          clubId: club.id,
          isActive: false,
        },
      });

      // READER: 404
      authenticateAs(readerUser);
      let res = await apiRequest()
        .post(`/clubs/${club.slug}/books/${inactiveBook.id}/reviews`)
        .send({ rating: 4, comment: 'Commentaire' });
      expect(res.status).toBe(404);

      // OWNER: 201
      authenticateAs(ownerUser);
      res = await apiRequest()
        .post(`/clubs/${club.slug}/books/${inactiveBook.id}/reviews`)
        .send({ rating: 5, comment: 'Commentaire Owner' });
      expect(res.status).toBe(201);

      // ADMIN: 201
      authenticateAs(adminUser);
      res = await apiRequest()
        .post(`/clubs/${club.slug}/books/${inactiveBook.id}/reviews`)
        .send({ rating: 4, comment: 'Commentaire Admin' });
      expect(res.status).toBe(201);
    });
  });

  describe('GET /clubs/:clubSlug/books/:bookId/reviews', () => {
    beforeEach(async () => {
      // Create reviews from multiple users
      await prisma.review.create({
        data: {
          rating: 5,
          comment: 'Genial',
          userId: ownerUser.id,
          bookId: book.id,
        },
      });

      await prisma.review.create({
        data: {
          rating: 3,
          comment: 'Moyen',
          userId: editorUser.id,
          bookId: book.id,
        },
      });
    });

    it('should allow a member to list all reviews of a book', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/reviews`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].rating).toBe(3);
      expect(response.body[0].user.name).toBe(editorUser.name);
      expect(response.body[1].rating).toBe(5);
      expect(response.body[1].user.name).toBe(ownerUser.name);
    });

    it('should forbid listing reviews to a non-member (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/reviews`,
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 when retrieving reviews of an inactive book for a READER, but 200 for OWNER and ADMIN', async () => {
      const inactiveBook = await prisma.book.create({
        data: {
          title: 'Livre Inactif',
          slug: 'livre-inactif-2',
          author: 'Auteur',
          genre: 'Genre',
          pages: 100,
          clubId: club.id,
          isActive: false,
        },
      });

      await prisma.review.create({
        data: {
          rating: 4,
          comment: 'Pas mal',
          userId: ownerUser.id,
          bookId: inactiveBook.id,
        },
      });

      // READER: 404
      authenticateAs(readerUser);
      let res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(404);

      // OWNER: 200
      authenticateAs(ownerUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);

      // ADMIN: 200
      authenticateAs(adminUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('Calculation and exposition of average rating', () => {
    it('should return averageRating = null if no review has been left', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.averageRating).toBeNull();
    });

    it('should return the correct average rating after multiple reviews', async () => {
      authenticateAs(readerUser);

      // Add reviews directly in db
      await prisma.review.create({
        data: { rating: 5, userId: ownerUser.id, bookId: book.id },
      });
      await prisma.review.create({
        data: { rating: 2, userId: editorUser.id, bookId: book.id },
      });

      // Get single book details
      const responseSingle = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}`,
      );
      expect(responseSingle.status).toBe(200);
      expect(responseSingle.body.averageRating).toBe(3.5); // (5+2)/2 = 3.5

      // Get all books list
      const responseList = await apiRequest().get(`/clubs/${club.slug}/books`);
      expect(responseList.status).toBe(200);
      expect(responseList.body[0].averageRating).toBe(3.5);
    });
  });
});
