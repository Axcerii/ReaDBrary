import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentification (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    // 1. Démarrage de l'application virtuelle avant tous les tests
    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule], // Charge toute ton app (Controllers, Services, Better Auth)
        }).compile();

        app = moduleFixture.createNestApplication();

        // Si tu as un préfixe global pour ton API (ex: /api), décommente la ligne suivante :
        // app.setGlobalPrefix('api');

        prisma = app.get<PrismaService>(PrismaService);
        await app.init();
    });

    // 2. Base de données vierge avant chaque test
    beforeEach(async () => {
        await prisma.cleanDatabase();
    });

    // 3. Fermeture propre à la fin
    afterAll(async () => {
        await app.close();
    });

    // --- LES TESTS ---

    describe('Inscription (Sign Up)', () => {
        it('devrait créer un nouvel utilisateur et renvoyer un statut 200/201', async () => {
            // Arrange
            const signupData = {
                email: 'test@bookshelf.com',
                password: 'Password123!',
                name: 'Test User'
            };

            // Act : On simule une requête HTTP POST sur ton endpoint d'inscription
            const response = await request(app.getHttpServer())
                .post('/api/auth/sign-up') // ⚠️ À adapter selon tes routes Better Auth
                .send(signupData);

            // Assert : Vérification de la réponse HTTP
            expect(response.status).toBe(201); // ou 200 selon ta configuration
            expect(response.body).toHaveProperty('user');
            expect(response.body.user.email).toBe(signupData.email);

            // Assert : Vérification dans la base de données
            const userInDb = await prisma.user.findUnique({
                where: { email: signupData.email }
            });
            expect(userInDb).not.toBeNull();
            expect(userInDb?.name).toBe('Test User');
        });

        it('devrait rejeter une inscription si l\'email existe déjà', async () => {
            // ... (Ce sera ton prochain test à écrire pour gérer les erreurs !)
        });
    });
});