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
        }
    },
}));

describe('Module Clubs (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                ConfigModule.forRoot({ isGlobal: true }),
                AppModule,
            ],
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

        it('devrait créer un club et auto-générer le slug s\'il n\'est pas fourni', async () => {
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

            const response = await request(app.getHttpServer())
                .get('/clubs');

            expect(response.status).toBe(200);
            expect(Array.isArray(response.body)).toBe(true);
            expect(response.body).toHaveLength(2);
            expect(response.body[0].slug).toBe('club-alpha');
            expect(response.body[1].slug).toBe('club-beta');
        });
    });

    describe('GET /clubs/:id', () => {
        it('devrait retourner un club par son ID', async () => {
            const created = await prisma.club.create({
                data: { name: 'Club Unique', slug: 'club-unique' },
            });

            const response = await request(app.getHttpServer())
                .get(`/clubs/${created.id}`);

            expect(response.status).toBe(200);
            expect(response.body.name).toBe('Club Unique');
            expect(response.body.slug).toBe('club-unique');
        });

        it('devrait retourner 404 Not Found si l\'ID n\'existe pas', async () => {
            const response = await request(app.getHttpServer())
                .get('/clubs/non-existent-uuid-1234');

            expect(response.status).toBe(404);
        });
    });

    describe('PATCH /clubs/:id', () => {
        it('devrait mettre à jour le nom et auto-slugifier le nouveau slug s\'il est passé', async () => {
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

            const updated = await prisma.club.findUnique({ where: { id: created.id } });
            expect(updated?.name).toBe('Nouveau Nom');
            expect(updated?.slug).toBe('nouveau-slug');
        });

        it('devrait retourner 404 si le club à modifier n\'existe pas', async () => {
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
    });

    describe('DELETE /clubs/:id', () => {
        it('devrait supprimer un club existant', async () => {
            const created = await prisma.club.create({
                data: { name: 'A Supprimer', slug: 'a-supprimer' },
            });

            const response = await request(app.getHttpServer())
                .delete(`/clubs/${created.id}`);

            expect(response.status).toBe(200);

            const deleted = await prisma.club.findUnique({ where: { id: created.id } });
            expect(deleted).toBeNull();
        });

        it('devrait retourner 404 si le club à supprimer n\'existe pas', async () => {
            const response = await request(app.getHttpServer())
                .delete('/clubs/non-existent-uuid-1234');

            expect(response.status).toBe(404);
        });
    });
});