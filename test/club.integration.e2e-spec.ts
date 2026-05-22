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

describe('Module Clubs (e2e)', () => {
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
    it('devrait créer un club avec un slug spécifié', async () => {
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

    it("devrait créer un club et auto-générer le slug s'il n'est pas fourni", async () => {
      const payload = {
        name: 'Le Cercle des Développeurs Forts',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('le-cercle-des-developpeurs-forts');
    });

    it('devrait nettoyer et slugifier correctement un nom contenant des accents et caractères spéciaux', async () => {
      const payload = {
        name: 'Café Littéraire & Débats (2026)!',
      };

      const response = await request(app.getHttpServer())
        .post('/clubs')
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.slug).toBe('cafe-litteraire-debats-2026');
    });

    it('devrait échouer avec 409 Conflict si le slug existe déjà', async () => {
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
    it('devrait retourner la liste de tous les clubs', async () => {
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

    it('devrait filtrer les clubs inactifs pour les visiteurs anonymes', async () => {
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

    it('devrait afficher les clubs inactifs pour les administrateurs globaux', async () => {
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

    it('devrait afficher les clubs inactifs pour leur propriétaire', async () => {
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

      // Pour l'owner
      authenticateAs(owner);
      const resOwner = await apiRequest().get('/clubs');
      expect(resOwner.status).toBe(200);
      expect(resOwner.body).toHaveLength(1);
      expect(resOwner.body[0].slug).toBe('club-inactif');

      // Pour un autre utilisateur
      authenticateAs(otherUser);
      const resOther = await apiRequest().get('/clubs');
      expect(resOther.status).toBe(200);
      expect(resOther.body).toHaveLength(0);
    });
  });

  describe('GET /clubs/:id', () => {
    it('devrait retourner un club par son ID', async () => {
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

    it("devrait retourner 404 Not Found si l'ID n'existe pas", async () => {
      const response = await request(app.getHttpServer()).get(
        '/clubs/non-existent-uuid-1234',
      );

      expect(response.status).toBe(404);
    });

    it('devrait retourner 404 si le club est inactif et que l’utilisateur est un visiteur ou membre non propriétaire', async () => {
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

    it('devrait retourner le club inactif si l’utilisateur est ADMIN ou OWNER du club', async () => {
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
    it("devrait mettre à jour le nom et auto-slugifier le nouveau slug s'il est passé", async () => {
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

    it("devrait retourner 404 si le club à modifier n'existe pas", async () => {
      const response = await request(app.getHttpServer())
        .patch('/clubs/non-existent-uuid-1234')
        .send({ name: 'Inconnu' });

      expect(response.status).toBe(404);
    });

    it('devrait retourner 409 si la modification de slug cause un conflit', async () => {
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

    it('devrait interdire de modifier isActive sans authentification ou pour un rôle non autorisé (403)', async () => {
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

    it('devrait autoriser de modifier isActive pour OWNER ou ADMIN', async () => {
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
    it('devrait supprimer un club existant', async () => {
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

    it("devrait retourner 404 si le club à supprimer n'existe pas", async () => {
      const response = await request(app.getHttpServer()).delete(
        '/clubs/non-existent-uuid-1234',
      );

      expect(response.status).toBe(404);
    });
  });
});
