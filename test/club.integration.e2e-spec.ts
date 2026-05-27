import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as dotenv from 'dotenv';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { User } from '../generated/prisma/client';
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

describe('Clubs Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

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
    authenticateAs(null);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /clubs', () => {
    it('should create a club with a specified slug', async () => {
      const payload = {
        name: 'Club Spécifié',
        slug: 'mon-slug-perso',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.body.name).toBe(payload.name);
      expect(response.body.slug).toBe('mon-slug-perso');

      const clubInDb = await prisma.club.findUnique({
        where: { id: response.body.id },
      });
      expect(clubInDb).toBeDefined();
      expect(clubInDb?.slug).toBe('mon-slug-perso');
    });

    it('should create a club and auto-generate the slug if not provided', async () => {
      const payload = {
        name: 'Le Cercle des Développeurs Forts',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('le-cercle-des-developpeurs-forts');
    });

    it('should clean and slugify a name containing accents and special characters correctly', async () => {
      const payload = {
        name: 'Café Littéraire & Débats (2026)!',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('cafe-litteraire-debats-2026');
    });

    it('should fail with 409 Conflict if the slug already exists', async () => {
      await prisma.club.create({
        data: {
          name: 'Club Existant',
          slug: 'slug-unique',
        },
      });

      const payload = {
        name: 'Autre Club',
        slug: 'slug-unique',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(409);
      expect(response.body.message).toContain('est déjà utilisé');
    });
  });

  describe('GET /clubs', () => {
    it('should return the list of all clubs', async () => {
      await prisma.club.createMany({
        data: [
          { name: 'Club Alpha', slug: 'club-alpha' },
          { name: 'Club Beta', slug: 'club-beta' },
        ],
      });

      const response = await request(app.getHttpServer()).get('/clubs');

      expect(response.status).toBe(200);
      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body).toHaveLength(2);
      expect(response.body[0].slug).toBe('club-alpha');
      expect(response.body[1].slug).toBe('club-beta');
    });

    it('should filter out inactive clubs for anonymous visitors', async () => {
      await prisma.club.createMany({
        data: [
          { name: 'Club Actif', slug: 'club-actif', isActive: true },
          { name: 'Club Inactif', slug: 'club-inactif', isActive: false },
        ],
      });

      const response = await apiRequest().get('/clubs');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].slug).toBe('club-actif');
    });

    it('should display inactive clubs for global administrators', async () => {
      const admin = await prisma.user.create({
        data: { email: 'admin@test.com', name: 'Admin', role: 'ADMIN' },
      });
      await prisma.club.createMany({
        data: [
          { name: 'Club Actif', slug: 'club-actif', isActive: true },
          { name: 'Club Inactif', slug: 'club-inactif', isActive: false },
        ],
      });

      authenticateAs(admin);
      const response = await apiRequest().get('/clubs');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
    });

    it('should display inactive clubs for their owner', async () => {
      const owner = await prisma.user.create({
        data: { email: 'owner@test.com', name: 'Owner', role: 'USER' },
      });
      const otherUser = await prisma.user.create({
        data: { email: 'other@test.com', name: 'Other', role: 'USER' },
      });

      const club = await prisma.club.create({
        data: { name: 'Club Inactif', slug: 'club-inactif', isActive: false },
      });

      await prisma.clubMember.create({
        data: { clubId: club.id, userId: owner.id, role: 'OWNER' },
      });

      // For owner
      authenticateAs(owner);
      const resOwner = await apiRequest().get('/clubs');
      expect(resOwner.status).toBe(200);
      expect(resOwner.body).toHaveLength(1);
      expect(resOwner.body[0].slug).toBe('club-inactif');

      // For another user
      authenticateAs(otherUser);
      const resOther = await apiRequest().get('/clubs');
      expect(resOther.status).toBe(200);
      expect(resOther.body).toHaveLength(0);
    });

    it('should filter clubs by name (case insensitive)', async () => {
      await prisma.club.createMany({
        data: [
          {
            name: 'NestJS Book Club',
            slug: 'nestjs-book-club',
            isActive: true,
          },
          { name: 'React Readers', slug: 'react-readers', isActive: true },
          { name: 'Vue Enthusiasts', slug: 'vue-enthusiasts', isActive: true },
        ],
      });

      const response = await apiRequest().get('/clubs?name=nestjs');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].name).toBe('NestJS Book Club');
    });

    it('should paginate the returned clubs', async () => {
      await prisma.club.createMany({
        data: [
          { name: 'Club A', slug: 'club-a', isActive: true },
          { name: 'Club B', slug: 'club-b', isActive: true },
          { name: 'Club C', slug: 'club-c', isActive: true },
          { name: 'Club D', slug: 'club-d', isActive: true },
          { name: 'Club E', slug: 'club-e', isActive: true },
        ],
      });

      const response = await apiRequest().get('/clubs?page=2&limit=2');
      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(2);
      // Trié par nom ascendant: Club A, Club B, Club C, Club D, Club E
      // Page 2 avec limite 2 saute les 2 premiers (A, B) et prend les 2 suivants (C, D)
      expect(response.body[0].name).toBe('Club C');
      expect(response.body[1].name).toBe('Club D');
    });
  });

  describe('GET /clubs/:id', () => {
    it('should return a club by its ID', async () => {
      const created = await prisma.club.create({
        data: { name: 'Club Unique', slug: 'club-unique' },
      });

      const response = await request(app.getHttpServer()).get(
        `/clubs/${created.id}`,
      );

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Club Unique');
      expect(response.body.slug).toBe('club-unique');
    });

    it('should return 404 Not Found if the ID does not exist', async () => {
      const response = await request(app.getHttpServer()).get(
        '/clubs/non-existent-uuid-1234',
      );

      expect(response.status).toBe(404);
    });

    it('should return 404 if the club is inactive and the user is a visitor or non-owner member', async () => {
      const otherUser = await prisma.user.create({
        data: { email: 'other@test.com', name: 'Other', role: 'USER' },
      });
      const club = await prisma.club.create({
        data: { name: 'Club Inactif', slug: 'club-inactif', isActive: false },
      });

      // Visiteur anonyme
      const resAnon = await apiRequest().get(`/clubs/${club.id}`);
      expect(resAnon.status).toBe(404);

      // Membre standard
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: otherUser.id, role: 'READER' },
      });
      authenticateAs(otherUser);
      const resMember = await apiRequest().get(`/clubs/${club.id}`);
      expect(resMember.status).toBe(404);
    });

    it('should return the inactive club if the user is ADMIN or club OWNER', async () => {
      const admin = await prisma.user.create({
        data: { email: 'admin@test.com', name: 'Admin', role: 'ADMIN' },
      });
      const owner = await prisma.user.create({
        data: { email: 'owner@test.com', name: 'Owner', role: 'USER' },
      });
      const club = await prisma.club.create({
        data: { name: 'Club Inactif', slug: 'club-inactif', isActive: false },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: owner.id, role: 'OWNER' },
      });

      // Admin
      authenticateAs(admin);
      const resAdmin = await apiRequest().get(`/clubs/${club.id}`);
      expect(resAdmin.status).toBe(200);

      // Owner
      authenticateAs(owner);
      const resOwner = await apiRequest().get(`/clubs/${club.id}`);
      expect(resOwner.status).toBe(200);
    });
  });

  describe('PATCH /clubs/:id', () => {
    it('should update the name and auto-slugify the new slug if provided', async () => {
      const created = await prisma.club.create({
        data: { name: 'Ancien Nom', slug: 'ancien-slug' },
      });

      const payload = {
        name: 'Nouveau Nom',
        slug: 'Nouveau Slug!',
      };

      const response = await request(app.getHttpServer())
        .patch(`/clubs/${created.id}`)
        .send(payload);

      expect(response.status).toBe(200);
      expect(response.body.name).toBe('Nouveau Nom');
      expect(response.body.slug).toBe('nouveau-slug');

      const updated = await prisma.club.findUnique({
        where: { id: created.id },
      });
      expect(updated?.name).toBe('Nouveau Nom');
      expect(updated?.slug).toBe('nouveau-slug');
    });

    it('should return 404 if the club to modify does not exist', async () => {
      const response = await request(app.getHttpServer())
        .patch('/clubs/non-existent-uuid-1234')
        .send({ name: 'Inconnu' });

      expect(response.status).toBe(404);
    });

    it('should return 409 if modifying the slug causes a conflict', async () => {
      const club1 = await prisma.club.create({
        data: { name: 'Club 1', slug: 'club-un' },
      });
      const club2 = await prisma.club.create({
        data: { name: 'Club 2', slug: 'club-deux' },
      });

      const response = await request(app.getHttpServer())
        .patch(`/clubs/${club2.id}`)
        .send({ slug: 'club-un' });

      expect(response.status).toBe(409);
    });

    it('should forbid modifying isActive without authentication or for an unauthorized role (403)', async () => {
      const user = await prisma.user.create({
        data: { email: 'user@test.com', name: 'User', role: 'USER' },
      });
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test' },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: user.id, role: 'EDITOR' },
      });

      // Sans authentification
      const resAnon = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ isActive: false });
      expect(resAnon.status).toBe(403);

      // Membre EDITOR
      authenticateAs(user);
      const resEditor = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ isActive: false });
      expect(resEditor.status).toBe(403);
    });

    it('should allow modifying isActive for OWNER or ADMIN', async () => {
      const admin = await prisma.user.create({
        data: { email: 'admin@test.com', name: 'Admin', role: 'ADMIN' },
      });
      const owner = await prisma.user.create({
        data: { email: 'owner@test.com', name: 'Owner', role: 'USER' },
      });
      const club = await prisma.club.create({
        data: { name: 'Club Test', slug: 'club-test', isActive: true },
      });
      await prisma.clubMember.create({
        data: { clubId: club.id, userId: owner.id, role: 'OWNER' },
      });

      // Par le propriétaire (devenir inactif)
      authenticateAs(owner);
      const resOwner = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ isActive: false });
      expect(resOwner.status).toBe(200);
      expect(resOwner.body.isActive).toBe(false);

      // Par l'administrateur (devenir actif)
      authenticateAs(admin);
      const resAdmin = await apiRequest()
        .patch(`/clubs/${club.id}`)
        .send({ isActive: true });
      expect(resAdmin.status).toBe(200);
      expect(resAdmin.body.isActive).toBe(true);
    });
  });

  describe('DELETE /clubs/:id', () => {
    it('should delete an existing club', async () => {
      const created = await prisma.club.create({
        data: { name: 'A Supprimer', slug: 'a-supprimer' },
      });

      const response = await request(app.getHttpServer()).delete(
        `/clubs/${created.id}`,
      );

      expect(response.status).toBe(200);

      const deleted = await prisma.club.findUnique({
        where: { id: created.id },
      });
      expect(deleted).toBeNull();
    });

    it('should return 404 if the club to delete does not exist', async () => {
      const response = await request(app.getHttpServer()).delete(
        '/clubs/non-existent-uuid-1234',
      );

      expect(response.status).toBe(404);
    });
  });
});
