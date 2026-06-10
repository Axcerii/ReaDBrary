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

describe('Club Members Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ownerUser: User;
  let regularUser: User;
  let guestUser: User;

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

  beforeEach(async () => {
    await prisma.cleanDatabase();

    // Create default test users
    ownerUser = await prisma.user.create({
      data: { email: 'owner@example.com', name: 'Owner User', role: 'USER' },
    });
    regularUser = await prisma.user.create({
      data: { email: 'regular@example.com', name: 'Regular User', role: 'USER' },
    });
    guestUser = await prisma.user.create({
      data: { email: 'guest@example.com', name: 'Guest User', role: 'USER' },
    });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /clubs/:clubSlug/members', () => {
    it('should add a member with a specified role (as owner)', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Lecture', slug: 'club-lecture' },
      });
      // Set ownerUser as OWNER of the club
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/members`)
        .send({
          userId: regularUser.id,
          role: 'EDITOR',
        });

      expect(response.status).toBe(201);
      expect(response.body.clubId).toBe(club.id);
      expect(response.body.userId).toBe(regularUser.id);
      expect(response.body.role).toBe('EDITOR');
      expect(response.body.user.name).toBe('Regular User');

      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: club.id } },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('EDITOR');
    });

    it('should forbid non-owner user from adding a member', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Lecture', slug: 'club-lecture' },
      });
      // Set regularUser as READER of the club
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: regularUser.id, role: 'READER' },
      });

      authenticateAs(regularUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/members`)
        .send({
          userId: guestUser.id,
          role: 'EDITOR',
        });

      expect(response.status).toBe(403);
    });

    it('should add a member with the default READER role if not provided', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Philo', slug: 'club-philo' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: regularUser.id });

      expect(response.status).toBe(201);
      expect(response.body.role).toBe('READER');
    });

    it('should fail with 409 Conflict if the user is already a member', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Duplicata', slug: 'club-duplicata' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: regularUser.id });

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('déjà membre');
    });

    it('should fail with 404 Not Found if the club does not exist', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post('/clubs/non-existent-club-slug/members')
        .send({ userId: regularUser.id });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('club');
    });

    it('should fail with 404 Not Found if the user does not exist', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${club.slug}/members`)
        .send({ userId: '00000000-0000-0000-0000-000000000000' });

      expect(response.status).toBe(404);
      expect(response.body.message).toContain('utilisateur');
    });
  });

  describe('GET /clubs/:clubSlug/members', () => {
    it('should return the list of club members (as a club member, without email)', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Alpha', slug: 'club-alpha' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(regularUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].userId).toBe(ownerUser.id);
      expect(response.body[0].user.name).toBe('Owner User');
      expect(response.body[0].user.email).toBeUndefined(); // Email is hidden for non-admin
      expect(response.body[1].userId).toBe(regularUser.id);
      expect(response.body[1].user.name).toBe('Regular User');
      expect(response.body[1].user.email).toBeUndefined(); // Email is hidden for non-admin
    });

    it('should return the list of club members with emails if authenticated as platform ADMIN', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Alpha', slug: 'club-alpha' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      const adminUser = await prisma.user.create({
        data: { email: 'admin@example.com', name: 'Platform Admin', role: 'ADMIN' },
      });

      authenticateAs(adminUser);

      const response = await apiRequest().get(
        `/clubs/${club.slug}/members`,
      );

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].user.email).toBe('owner@example.com');
      expect(response.body[1].user.email).toBe('regular@example.com');
    });

    it('should return 404 Not Found if the club does not exist', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest().get(
        '/clubs/non-existent-club-slug/members',
      );

      expect(response.status).toBe(404);
    });
  });

  describe('PATCH /clubs/:clubSlug/members/:userId', () => {
    it('should update a member role (as owner)', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Dev', slug: 'club-dev' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/members/${regularUser.id}`)
        .send({ role: 'EDITOR' });

      expect(response.status).toBe(200);
      expect(response.body.role).toBe('EDITOR');

      const updated = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: club.id } },
      });
      expect(updated?.role).toBe('EDITOR');
    });

    it('should forbid non-owner user from updating a role', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Dev', slug: 'club-dev' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(regularUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/members/${ownerUser.id}`)
        .send({ role: 'EDITOR' });

      expect(response.status).toBe(403);
    });

    it('should return 404 Not Found if the membership relation does not exist', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Vide', slug: 'club-vide' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/members/${regularUser.id}`)
        .send({ role: 'EDITOR' });

      expect(response.status).toBe(404);
    });

    it('should return 400 Bad Request if the role is invalid', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .patch(`/clubs/${club.slug}/members/${regularUser.id}`)
        .send({ role: 'INVALID_ROLE' });

      expect(response.status).toBe(400);
    });
  });

  describe('DELETE /clubs/:clubSlug/members/:userId', () => {
    it('should remove a member from the club (as owner)', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Out', slug: 'club-out' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(ownerUser);

      const response = await apiRequest().delete(
        `/clubs/${club.slug}/members/${regularUser.id}`,
      );

      expect(response.status).toBe(200);

      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: club.id } },
      });
      expect(membership).toBeNull();
    });

    it('should forbid non-owner from removing a member', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Out', slug: 'club-out' },
      });
      await prisma.clubMember.createMany({
        data: [
          { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
          { clubId: club.id, userId: regularUser.id, role: 'READER' },
        ],
      });

      authenticateAs(regularUser);

      const response = await apiRequest().delete(
        `/clubs/${club.slug}/members/${ownerUser.id}`,
      );

      expect(response.status).toBe(403);
    });

    it('should return 404 Not Found if the membership relation does not exist', async () => {
      const club = await prisma.club.create({
        data: { name: 'Club Vide', slug: 'club-vide' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: ownerUser.id, role: 'OWNER' },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest().delete(
        `/clubs/${club.slug}/members/${regularUser.id}`,
      );

      expect(response.status).toBe(404);
    });
  });
});
