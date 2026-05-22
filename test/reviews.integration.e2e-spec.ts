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

describe('Module Reviews (e2e)', () => {
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
    it('devrait permettre à un membre (READER) de donner son avis', async () => {
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

    it('devrait interdire à un non-membre de donner son avis (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 4,
          comment: 'Pas mal',
        });

      expect(response.status).toBe(403);
    });

    it('devrait renvoyer 401 pour un utilisateur non authentifié', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({
          rating: 3,
        });

      expect(response.status).toBe(401);
    });

    it('devrait échouer avec 400 Bad Request si la note est invalide (ex: 0 ou 6)', async () => {
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

    it('devrait échouer avec 409 Conflict si un utilisateur donne plusieurs avis sur le même livre (unicité)', async () => {
      authenticateAs(readerUser);

      // Premier avis
      const res1 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({ rating: 4, comment: 'Premier commentaire' });
      expect(res1.status).toBe(201);

      // Deuxième avis (devrait échouer)
      const res2 = await apiRequest()
        .post(`/clubs/${club.slug}/books/${book.id}/reviews`)
        .send({ rating: 2, comment: 'Deuxième commentaire' });
      expect(res2.status).toBe(409);
      expect(res2.body.message).toContain('déjà donné votre avis');
    });

    it("devrait renvoyer 404 si le livre n'appartient pas au club", async () => {
      authenticateAs(readerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/books/non-existent-uuid/reviews`)
        .send({
          rating: 5,
        });

      expect(response.status).toBe(404);
    });

    it('devrait renvoyer 404 lors du dépôt d’un avis sur un livre inactif pour un READER, mais 201 pour OWNER et ADMIN', async () => {
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

      // READER : 404
      authenticateAs(readerUser);
      let res = await apiRequest()
        .post(`/clubs/${club.slug}/books/${inactiveBook.id}/reviews`)
        .send({ rating: 4, comment: 'Commentaire' });
      expect(res.status).toBe(404);

      // OWNER : 201
      authenticateAs(ownerUser);
      res = await apiRequest()
        .post(`/clubs/${club.slug}/books/${inactiveBook.id}/reviews`)
        .send({ rating: 5, comment: 'Commentaire Owner' });
      expect(res.status).toBe(201);

      // ADMIN : 201
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

    it('devrait permettre à un membre de lister tous les avis d’un livre', async () => {
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

    it('devrait interdire la liste des avis à un non-membre (403)', async () => {
      authenticateAs(nonMemberUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}/reviews`,
      );

      expect(response.status).toBe(403);
    });

    it('devrait renvoyer 404 lors de la récupération des avis d’un livre inactif pour un READER, mais 200 pour OWNER et ADMIN', async () => {
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

      await prisma.review.create({
        data: {
          rating: 4,
          comment: 'Pas mal',
          userId: ownerUser.id,
          bookId: inactiveBook.id,
        },
      });

      // READER : 404
      authenticateAs(readerUser);
      let res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(404);

      // OWNER : 200
      authenticateAs(ownerUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);

      // ADMIN : 200
      authenticateAs(adminUser);
      res = await apiRequest().get(
        `/clubs/${club.slug}/books/${inactiveBook.id}/reviews`,
      );
      expect(res.status).toBe(200);
    });
  });

  describe('Calcul et exposition de la note moyenne', () => {
    it('devrait retourner averageRating = null si aucun avis n’a été laissé', async () => {
      authenticateAs(readerUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/books/${book.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.averageRating).toBeNull();
    });

    it('devrait retourner la note moyenne correcte après plusieurs avis', async () => {
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
