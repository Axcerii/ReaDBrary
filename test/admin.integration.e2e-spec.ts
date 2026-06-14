import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User, Club } from '../generated/prisma/client';
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

describe('Administration Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminUser: User;
  let regularUser: User;
  let club: Club;

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
    adminUser = await prisma.user.create({
      data: {
        email: 'admin@example.com',
        name: 'Admin User',
        role: 'ADMIN',
      },
    });

    regularUser = await prisma.user.create({
      data: {
        email: 'user@example.com',
        name: 'Regular User',
        role: 'USER',
      },
    });

    // Create club
    club = await prisma.club.create({
      data: {
        name: 'Club Test Admin',
        slug: 'club-test-admin',
      },
    });

    // Make regular user a member of the club
    await prisma.clubMember.create({
      data: {
        clubId: club.id,
        userId: regularUser.id,
        role: 'READER',
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

  describe('Global Admin Access (AdminGuard)', () => {
    it('should deny access to unauthenticated users (401)', async () => {
      authenticateAs(null);
      const response = await apiRequest().get('/admin/users');
      expect(response.status).toBe(401);
    });

    it('should deny access to standard users (403)', async () => {
      authenticateAs(regularUser);
      const response = await apiRequest().get('/admin/users');
      expect(response.status).toBe(403);
      expect(response.body.message).toContain('Accès réservé');
    });

    it('should allow access to administrators (200)', async () => {
      authenticateAs(adminUser);
      const response = await apiRequest().get('/admin/users');
      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBe(2);
    });
  });

  describe('User management (deactivation / reactivation)', () => {
    it('should allow deactivating and then reactivating a user', async () => {
      authenticateAs(adminUser);

      // Deactivate
      const resDeactivate = await apiRequest().post(
        `/admin/users/${regularUser.id}/deactivate`,
      );
      expect(resDeactivate.status).toBe(201);
      expect(resDeactivate.body.isActive).toBe(false);

      const dbUserInactive = await prisma.user.findUnique({
        where: { id: regularUser.id },
      });
      expect(dbUserInactive?.isActive).toBe(false);

      // Reactivate
      const resReactivate = await apiRequest().post(
        `/admin/users/${regularUser.id}/reactivate`,
      );
      expect(resReactivate.status).toBe(201);
      expect(resReactivate.body.isActive).toBe(true);

      const dbUserActive = await prisma.user.findUnique({
        where: { id: regularUser.id },
      });
      expect(dbUserActive?.isActive).toBe(true);
    });

    it('should forbid any action on the club for a deactivated user (403)', async () => {
      // 1. Deactivation by the admin
      authenticateAs(adminUser);
      await apiRequest().post(`/admin/users/${regularUser.id}/deactivate`);

      // 2. The deactivated user attempts to access the club's books
      authenticateAs(regularUser);
      const response = await apiRequest().get(`/clubs/${club.slug}/books`);

      expect(response.status).toBe(403);
      expect(response.body.message).toContain('désactivé');
    });
  });

  describe('CSV import of books', () => {
    it('should successfully import valid books', async () => {
      authenticateAs(adminUser);

      const csv = `title,author,genre,pages
Livre A,Auteur A,Genre A,120
Livre B,Auteur B,Genre B,250`;

      const response = await apiRequest()
        .post(`/admin/clubs/${club.slug}/books/import`)
        .send({ csv });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);

      const dbBooks = await prisma.book.findMany({
        where: { clubId: club.id },
        orderBy: { title: 'asc' },
      });

      expect(dbBooks.length).toBe(2);
      expect(dbBooks[0].title).toBe('Livre A');
      expect(dbBooks[0].pages).toBe(120);
      expect(dbBooks[1].title).toBe('Livre B');
      expect(dbBooks[1].pages).toBe(250);
    });

    it('should fail transactionally if a row contains an error', async () => {
      authenticateAs(adminUser);

      // Book B has -100 pages (invalid)
      const csv = `title,author,genre,pages
Livre A,Auteur A,Genre A,120
Livre B,Auteur B,Genre B,-100`;

      const response = await apiRequest()
        .post(`/admin/clubs/${club.slug}/books/import`)
        .send({ csv });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Erreur de validation CSV');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].row).toBe(3);
      expect(response.body.errors[0].error).toContain('entier positif');

      // Transactional: no book should be inserted (not even Book A)
      const dbBooks = await prisma.book.findMany({
        where: { clubId: club.id },
      });
      expect(dbBooks).toHaveLength(0);
    });

    it('should fail with 404 Not Found if the club does not exist', async () => {
      authenticateAs(adminUser);
      const csv = `title,author,genre,pages\nLivre A,Auteur A,Genre A,120`;

      const response = await apiRequest()
        .post('/admin/clubs/club-inexistant/books/import')
        .send({ csv });

      expect(response.status).toBe(404);
    });
  });

  describe('CSV import of members', () => {
    let secondUser: User;

    beforeEach(async () => {
      secondUser = await prisma.user.create({
        data: {
          email: 'second@example.com',
          name: 'Second User',
          role: 'USER',
        },
      });
    });

    it('should successfully import / modify members', async () => {
      authenticateAs(adminUser);

      // regularUser is already READER. We change them to EDITOR, and add secondUser as READER.
      const csv = `email,role
user@example.com,EDITOR
second@example.com,READER`;

      const response = await apiRequest()
        .post(`/admin/clubs/${club.slug}/members/import`)
        .send({ csv });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.count).toBe(2);

      const member1 = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: club.id } },
      });
      const member2 = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: secondUser.id, clubId: club.id } },
      });

      expect(member1?.role).toBe('EDITOR');
      expect(member2?.role).toBe('READER');
    });

    it('should fail transactionally if a user does not exist', async () => {
      authenticateAs(adminUser);

      const csv = `email,role
user@example.com,EDITOR
inconnu@example.com,READER`;

      const response = await apiRequest()
        .post(`/admin/clubs/${club.slug}/members/import`)
        .send({ csv });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Erreur de validation CSV');
      expect(response.body.errors).toHaveLength(1);
      expect(response.body.errors[0].row).toBe(3);
      expect(response.body.errors[0].error).toContain("n'existe pas");

      // No modification performed (regularUser remains READER)
      const member1 = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: club.id } },
      });
      expect(member1?.role).toBe('READER');
    });

    it('should fail transactionally if a role is invalid', async () => {
      authenticateAs(adminUser);

      const csv = `email,role
second@example.com,INVALIDE`;

      const response = await apiRequest()
        .post(`/admin/clubs/${club.slug}/members/import`)
        .send({ csv });

      expect(response.status).toBe(400);
      expect(response.body.errors[0].error).toContain(
        'rôle doit être OWNER, EDITOR ou READER',
      );

      const member2 = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: secondUser.id, clubId: club.id } },
      });
      expect(member2).toBeNull();
    });
  });

  describe('Review Moderation (deleting reviews)', () => {
    let book: any;
    let review: any;

    beforeEach(async () => {
      // Create a book in the club
      book = await prisma.book.create({
        data: {
          title: 'Book for reviews',
          slug: 'book-for-reviews',
          author: 'Author A',
          genre: 'Genre A',
          pages: 150,
          clubId: club.id,
        },
      });

      // Create a review for the book by regularUser
      review = await prisma.review.create({
        data: {
          rating: 4,
          comment: 'Very interesting book.',
          userId: regularUser.id,
          bookId: book.id,
        },
      });
    });

    it('should allow an administrator to delete a review', async () => {
      authenticateAs(adminUser);

      const response = await apiRequest().delete(`/admin/reviews/${review.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      const dbReview = await prisma.review.findUnique({
        where: { id: review.id },
      });
      expect(dbReview).toBeNull();
    });

    it('should deny access to unauthenticated users (401)', async () => {
      authenticateAs(null);

      const response = await apiRequest().delete(`/admin/reviews/${review.id}`);

      expect(response.status).toBe(401);

      // Verify review still exists
      const dbReview = await prisma.review.findUnique({
        where: { id: review.id },
      });
      expect(dbReview).not.toBeNull();
    });

    it('should deny access to standard users (403)', async () => {
      authenticateAs(regularUser);

      const response = await apiRequest().delete(`/admin/reviews/${review.id}`);

      expect(response.status).toBe(403);

      // Verify review still exists
      const dbReview = await prisma.review.findUnique({
        where: { id: review.id },
      });
      expect(dbReview).not.toBeNull();
    });

    it('should return 404 if the review does not exist', async () => {
      authenticateAs(adminUser);

      const response = await apiRequest().delete(
        '/admin/reviews/00000000-0000-0000-0000-000000000000',
      );

      expect(response.status).toBe(404);
    });
  });
});
