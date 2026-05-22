import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

dotenv.config();

jest.mock('../src/auth/auth', () => ({
  auth: {
    handler: jest.fn().mockResolvedValue({}),

    api: {
      getSession: jest.fn().mockResolvedValue(null),
    },
  },
}));

describe('Module Club Members (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /clubs/:clubSlug/members', () => {
    it('devrait ajouter un membre avec un rôle spécifié', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Lecture', slug: 'club-lecture' },
      });
      const user = await prisma.user.create({
        data: { email: 'user@example.com', name: 'Alice' },
      });

      const response = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/members`)
        .send({
          userId: user.id,
          role: 'EDITOR',
        });

      expect(response.status).toBe(201);
      expect(response.body.clubId).toBe(club.id);
      expect(response.body.userId).toBe(user.id);
      expect(response.body.role).toBe('EDITOR');
      expect(response.body.user.name).toBe('Alice');

      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: user.id, clubId: club.id } },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('EDITOR');
    });

    it('devrait ajouter un membre avec le rôle par défaut READER si non fourni', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Philo', slug: 'club-philo' },
      });
      const user = await prisma.user.create({
        data: { email: 'bob@example.com', name: 'Bob' },
      });

      const response = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: user.id });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe('READER');
    });

    it("devrait échouer avec 409 Conflict si l'utilisateur est déjà membre", async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Duplicata', slug: 'club-duplicata' },
      });
      const user = await prisma.user.create({
        data: { email: 'charlie@example.com', name: 'Charlie' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: 'READER' },
      });

      const response = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: user.id });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('déjà membre');
    });

    it("devrait échouer avec 404 Not Found si le club n'existe pas", async () => {
      const user = await prisma.user.create({
        data: { email: 'test@example.com' },
      });

      const response = await request(app.getHttpServer())
        .post('/clubs/non-existent-club-slug/members')
        .send({ userId: user.id });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('club');
    });

    it("devrait échouer avec 404 Not Found si l'utilisateur n'existe pas", async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test' },
      });

      const response = await request(app.getHttpServer())
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: 'non-existent-user-id' });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('utilisateur');
    });
  });

  describe('GET /clubs/:clubSlug/members', () => {
    it('devrait retourner la liste des membres du club', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Alpha', slug: 'club-alpha' },
      });
      const user1 = await prisma.user.create({
        data: { email: 'one@example.com', name: 'One' },
      });
      const user2 = await prisma.user.create({
        data: { email: 'two@example.com', name: 'Two' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: user1.id, role: 'OWNER' },
          { clubId: club.id, userId: user2.id, role: 'READER' },
        ],
      });

      const response = await request(app.getHttpServer()).get(
        `/clubs/${club.slug}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].userId).toBe(user1.id);
      expect(response.body[0].user.name).toBe('One');
      expect(response.body[1].userId).toBe(user2.id);
      expect(response.body[1].user.name).toBe('Two');
    });

    it("devrait renvoyer 404 Not Found si le club n'existe pas", async () => {
      const response = await request(app.getHttpServer()).get(
        '/clubs/non-existent-club-slug/members',
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /clubs/:clubSlug/members/:userId', () => {
    it("devrait mettre à jour le rôle d'un membre", async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Dev', slug: 'club-dev' },
      });
      const user = await prisma.user.create({
        data: { email: 'dev@example.com', name: 'Dev' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: 'READER' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/members/${user.id}`)
        .send({ role: 'OWNER' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('OWNER');

      const updated = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: user.id, clubId: club.id } },
      });
      expect(updated?.role).toBe('OWNER');
    });

    it("devrait renvoyer 404 Not Found si la relation membre n'existe pas", async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Vide', slug: 'club-vide' },
      });
      const user = await prisma.user.create({
        data: { email: 'no-member@example.com' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/members/${user.id}`)
        .send({ role: 'EDITOR' });

      expect(response.status).toBe(404);
    });

    it('devrait renvoyer 400 Bad Request si le rôle est invalide', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test' },
      });
      const user = await prisma.user.create({
        data: { email: 'test@example.com' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: 'READER' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clubs/${club.slug}/members/${user.id}`)
        .send({ role: 'INVALID_ROLE' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /clubs/:clubSlug/members/:userId', () => {
    it('devrait retirer un membre du club', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Out', slug: 'club-out' },
      });
      const user = await prisma.user.create({
        data: { email: 'out@example.com', name: 'Out' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: 'READER' },
      });

      const response = await request(app.getHttpServer()).delete(
        `/clubs/${club.slug}/members/${user.id}`,
      );

      expect(response.status).toBe(200);

      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: user.id, clubId: club.id } },
      });
      expect(membership).toBeNull();
    });

    it("devrait renvoyer 404 Not Found si la relation membre n'existe pas", async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Vide', slug: 'club-vide' },
      });
      const user = await prisma.user.create({
        data: { email: 'no-member@example.com' },
      });

      const response = await request(app.getHttpServer()).delete(
        `/clubs/${club.slug}/members/${user.id}`,
      );

      expect(response.status).toBe(404);
    });
  });
});
