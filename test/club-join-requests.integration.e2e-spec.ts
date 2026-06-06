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

describe('Club Join Requests Module (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let publicClub: Club;
  let privateClub: Club;
  let ownerUser: User;
  let regularUser: User;
  let otherUser: User;

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
    regularUser = await prisma.user.create({
      data: { email: 'regular@example.com', name: 'Regular User', role: 'USER' },
    });
    otherUser = await prisma.user.create({
      data: { email: 'other@example.com', name: 'Other User', role: 'USER' },
    });

    // Create public and private clubs
    publicClub = await prisma.club.create({
      data: { name: 'Club Public', slug: 'club-public', isPublic: true },
    });

    privateClub = await prisma.club.create({
      data: { name: 'Club Prive', slug: 'club-prive', isPublic: false },
    });

    // Set owner on both clubs
    await prisma.clubMember.createMany({
      data: [
        { clubId: publicClub.id, userId: ownerUser.id, role: 'OWNER' },
        { clubId: privateClub.id, userId: ownerUser.id, role: 'OWNER' },
      ],
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

  describe('POST /clubs/:clubSlug/join', () => {
    it('should join a public club immediately as READER', async () => {
      authenticateAs(regularUser);

      const response = await apiRequest()
        .post(`/clubs/${publicClub.slug}/join`)
        .send();

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('JOINED');
      expect(response.body.membership.role).toBe('READER');

      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: publicClub.id } },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('READER');
    });

    it('should create a pending request for a private club', async () => {
      authenticateAs(regularUser);

      const response = await apiRequest()
        .post(`/clubs/${privateClub.slug}/join`)
        .send();

      expect(response.status).toBe(201);
      expect(response.body.status).toBe('PENDING');

      // Verify request in DB
      const requestRecord = await prisma.clubJoinRequest.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(requestRecord).not.toBeNull();

      // Verify user is not a member yet
      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(membership).toBeNull();
    });

    it('should return 401 if unauthenticated', async () => {
      authenticateAs(null);

      const response = await apiRequest()
        .post(`/clubs/${publicClub.slug}/join`)
        .send();

      expect(response.status).toBe(401);
    });

    it('should return 409 if already a member', async () => {
      authenticateAs(ownerUser); // Owner is already a member

      const response = await apiRequest()
        .post(`/clubs/${publicClub.slug}/join`)
        .send();

      expect(response.status).toBe(409);
    });
  });

  describe('GET /clubs/:clubSlug/join-status', () => {
    it('should return isMember: true for a member', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest()
        .get(`/clubs/${publicClub.slug}/join-status`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        isMember: true,
        role: 'OWNER',
        hasPendingRequest: false,
      });
    });

    it('should return hasPendingRequest: true for a user with pending request', async () => {
      await prisma.clubJoinRequest.create({
        data: { clubId: privateClub.id, userId: regularUser.id },
      });

      authenticateAs(regularUser);

      const response = await apiRequest()
        .get(`/clubs/${privateClub.slug}/join-status`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        isMember: false,
        role: null,
        hasPendingRequest: true,
      });
    });

    it('should return hasPendingRequest: false and isMember: false for a guest', async () => {
      authenticateAs(regularUser);

      const response = await apiRequest()
        .get(`/clubs/${privateClub.slug}/join-status`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        isMember: false,
        role: null,
        hasPendingRequest: false,
      });
    });
  });

  describe('GET /clubs/:clubSlug/join-requests', () => {
    it('should allow the owner to view requests', async () => {
      await prisma.clubJoinRequest.create({
        data: { clubId: privateClub.id, userId: regularUser.id },
      });

      authenticateAs(ownerUser);

      const response = await apiRequest()
        .get(`/clubs/${privateClub.slug}/join-requests`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
      expect(response.body[0].userId).toBe(regularUser.id);
      expect(response.body[0].user.name).toBe(regularUser.name);
    });

    it('should forbid non-owner users from viewing requests', async () => {
      authenticateAs(regularUser);

      const response = await apiRequest()
        .get(`/clubs/${privateClub.slug}/join-requests`);

      expect(response.status).toBe(403);
    });
  });

  describe('POST /clubs/:clubSlug/join-requests/:userId/approve', () => {
    beforeEach(async () => {
      await prisma.clubJoinRequest.create({
        data: { clubId: privateClub.id, userId: regularUser.id },
      });
    });

    it('should allow owner to approve request, adding user as READER and deleting request', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${privateClub.slug}/join-requests/${regularUser.id}/approve`)
        .send();

      expect(response.status).toBe(201); // default NestJS POST response status
      expect(response.body.role).toBe('READER');

      // Verify request is deleted
      const req = await prisma.clubJoinRequest.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(req).toBeNull();

      // Verify member is added
      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(membership).not.toBeNull();
      expect(membership?.role).toBe('READER');
    });

    it('should forbid non-owner from approving', async () => {
      authenticateAs(otherUser);

      const response = await apiRequest()
        .post(`/clubs/${privateClub.slug}/join-requests/${regularUser.id}/approve`)
        .send();

      expect(response.status).toBe(403);
    });
  });

  describe('POST /clubs/:clubSlug/join-requests/:userId/reject', () => {
    beforeEach(async () => {
      await prisma.clubJoinRequest.create({
        data: { clubId: privateClub.id, userId: regularUser.id },
      });
    });

    it('should allow owner to reject request, deleting the request', async () => {
      authenticateAs(ownerUser);

      const response = await apiRequest()
        .post(`/clubs/${privateClub.slug}/join-requests/${regularUser.id}/reject`)
        .send();

      expect(response.status).toBe(201);

      // Verify request is deleted
      const req = await prisma.clubJoinRequest.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(req).toBeNull();

      // Verify no membership was created
      const membership = await prisma.clubMember.findUnique({
        where: { userId_clubId: { userId: regularUser.id, clubId: privateClub.id } },
      });
      expect(membership).toBeNull();
    });

    it('should forbid non-owner from rejecting', async () => {
      authenticateAs(otherUser);

      const response = await apiRequest()
        .post(`/clubs/${privateClub.slug}/join-requests/${regularUser.id}/reject`)
        .send();

      expect(response.status).toBe(403);
    });
  });
});
