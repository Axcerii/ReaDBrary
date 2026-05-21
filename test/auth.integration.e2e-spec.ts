import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import * as dotenv from 'dotenv';

dotenv.config();

jest.mock('../src/auth/auth', () => ({
    auth: {
        handler: jest.fn().mockResolvedValue({}),

        api: {
            getSession: jest.fn().mockResolvedValue(null),
        }
    },
}));

describe('Authentification (e2e)', () => {
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
        jest.clearAllMocks();
    });

    afterAll(async () => {
        if (prisma) {
            await prisma.$disconnect();
        }
        await app.close();
    });

    it('devrait démarrer le serveur avec Better Auth mocké', () => {
        expect(app).toBeDefined();
    });
});