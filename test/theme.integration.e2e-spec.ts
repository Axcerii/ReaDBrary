import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User, Club, Book, DragonTheme } from '../generated/prisma/client';
import { App } from 'supertest/types';

dotenv.config();

let mockSession: any = null;

jest.mock('../src/auth/auth', () => ({
  auth: {
    handler: jest.fn().mockResolvedValue({}),
    api: {
      getSession: jest.fn().mockImplementation(() => mockSession),
    },
  },
}));

describe('Theme Categories (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerUser: User;
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
    mockSession = null;

    // Create a user for test authorization
    ownerUser = await prisma.user.create({
      data: { email: 'owner@example.com', name: 'Owner User', role: 'USER' },
    });

    adminUser = await prisma.user.create({
      data: { email: 'admin@example.com', name: 'Admin User', role: 'ADMIN' },
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

  describe('Clubs Theme support', () => {
    it('should create a club with a custom valid theme and retrieve it', async () => {
      authenticateAs(ownerUser);

      const payload = {
        name: 'The Dragon Alliance',
        theme: DragonTheme.Yinva,
      };

      // Create club
      const createResponse = await apiRequest()
        .post('/clubs')
        .send(payload);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('id');
      expect(createResponse.body.name).toBe(payload.name);
      expect(createResponse.body.theme).toBe(DragonTheme.Yinva);

      const clubId = createResponse.body.id;

      // Retrieve club
      const getResponse = await apiRequest()
        .get(`/clubs/${clubId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.theme).toBe(DragonTheme.Yinva);
    });

    it('should fail to create a club with an invalid theme', async () => {
      authenticateAs(ownerUser);

      const payload = {
        name: 'The Dragon Alliance',
        theme: 'InvalidDragon',
      };

      const response = await apiRequest()
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(400);
      expect(response.body.message[0]).toContain(
        "Le thème doit être l'un des dragons suivants",
      );
    });

    it('should allow updating the club to a valid theme', async () => {
      authenticateAs(ownerUser);

      const club = await prisma.club.create({
        data: {
          name: 'The Phoenix Guild',
          slug: 'the-phoenix-guild',
          theme: DragonTheme.Pura,
        },
      });

      await prisma.clubMember.create({
        data: {
          clubId: club.id,
          userId: ownerUser.id,
          role: 'OWNER',
        },
      });

      const updateResponse = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ theme: DragonTheme.Goliath });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.theme).toBe(DragonTheme.Goliath);

      // Verify db state
      const dbClub = await prisma.club.findUnique({
        where: { id: club.id },
      });
      expect(dbClub?.theme).toBe(DragonTheme.Goliath);
    });

    it('should fail to update the club to an invalid theme', async () => {
      authenticateAs(ownerUser);

      const club = await prisma.club.create({
        data: {
          name: 'The Phoenix Guild',
          slug: 'the-phoenix-guild',
          theme: DragonTheme.Pura,
        },
      });

      await prisma.clubMember.create({
        data: {
          clubId: club.id,
          userId: ownerUser.id,
          role: 'OWNER',
        },
      });

      const updateResponse = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ theme: 'Phoenix' });

      expect(updateResponse.status).toBe(400);
      expect(updateResponse.body.message[0]).toContain(
        "Le thème doit être l'un des dragons suivants",
      );
    });
  });

  describe('Books Theme support', () => {
    let testClub: Club;

    beforeEach(async () => {
      testClub = await prisma.club.create({
        data: {
          name: 'Dragon Readers',
          slug: 'dragon-readers',
          theme: DragonTheme.Goliath,
        },
      });

      await prisma.clubMember.create({
        data: {
          clubId: testClub.id,
          userId: ownerUser.id,
          role: 'OWNER',
        },
      });
    });

    it('should create a book with a valid custom theme and retrieve it', async () => {
      authenticateAs(ownerUser);

      const payload = {
        title: 'Eragon',
        author: 'Christopher Paolini',
        genre: 'Fantasy',
        pages: 500,
        theme: DragonTheme.Aqua,
      };

      const createResponse = await apiRequest()
        .post(`/clubs/${testClub.slug}/books`)
        .send(payload);

      expect(createResponse.status).toBe(201);
      expect(createResponse.body).toHaveProperty('id');
      expect(createResponse.body.title).toBe(payload.title);
      expect(createResponse.body.theme).toBe(DragonTheme.Aqua);

      const bookId = createResponse.body.id;

      // Retrieve book
      const getResponse = await apiRequest()
        .get(`/clubs/${testClub.slug}/books/${bookId}`);

      expect(getResponse.status).toBe(200);
      expect(getResponse.body.theme).toBe(DragonTheme.Aqua);
    });

    it('should fail to create a book with an invalid theme', async () => {
      authenticateAs(ownerUser);

      const payload = {
        title: 'Eragon',
        author: 'Christopher Paolini',
        genre: 'Fantasy',
        pages: 500,
        theme: 'FireDragon',
      };

      const createResponse = await apiRequest()
        .post(`/clubs/${testClub.slug}/books`)
        .send(payload);

      expect(createResponse.status).toBe(400);
      expect(createResponse.body.message[0]).toContain(
        "Le thème doit être l'un des dragons suivants",
      );
    });

    it('should allow updating the book to a valid theme', async () => {
      authenticateAs(ownerUser);

      const book = await prisma.book.create({
        data: {
          title: 'A Game of Thrones',
          slug: 'a-game-of-thrones-1',
          author: 'George R.R. Martin',
          genre: 'Fantasy',
          pages: 800,
          theme: DragonTheme.Chronos,
          clubId: testClub.id,
        },
      });

      const updateResponse = await apiRequest()
        .patch(`/clubs/${testClub.slug}/books/${book.id}`)
        .send({ theme: DragonTheme.Lada });

      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.theme).toBe(DragonTheme.Lada);

      // Verify db state
      const dbBook = await prisma.book.findUnique({
        where: { id: book.id },
      });
      expect(dbBook?.theme).toBe(DragonTheme.Lada);
    });

    it('should fail to update the book to an invalid theme', async () => {
      authenticateAs(ownerUser);

      const book = await prisma.book.create({
        data: {
          title: 'A Game of Thrones',
          slug: 'a-game-of-thrones-2',
          author: 'George R.R. Martin',
          genre: 'Fantasy',
          pages: 800,
          theme: DragonTheme.Chronos,
          clubId: testClub.id,
        },
      });

      const updateResponse = await apiRequest()
        .patch(`/clubs/${testClub.slug}/books/${book.id}`)
        .send({ theme: 'Targaryen' });

      expect(updateResponse.status).toBe(400);
      expect(updateResponse.body.message[0]).toContain(
        "Le thème doit être l'un des dragons suivants",
      );
    });
  });
});
