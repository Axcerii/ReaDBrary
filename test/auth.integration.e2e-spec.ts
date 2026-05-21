import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';

describe('Authentification (e2e)', () => {
    let app: INestApplication;
    let prisma: PrismaService;

    // 1. Démarrage de l'application virtuelle avant tous les tests
    beforeAll(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [AppModule], // On importe le module racine de ton API
        }).compile();

        app = moduleFixture.createNestApplication();

        // On récupère notre PrismaService pour pouvoir nettoyer la base
        prisma = app.get<PrismaService>(PrismaService);

        // On démarre l'application !
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

    // Un test "vide" juste pour vérifier que le serveur se lance bien
    it('devrait démarrer le serveur de test correctement', () => {
        expect(app).toBeDefined();
    });
});