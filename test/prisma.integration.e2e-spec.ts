import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PrismaService } from '../src/prisma/prisma.service';
import * as dotenv from 'dotenv';

dotenv.config();

describe('Prisma Integration & Database Connection', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
        }),
      ],
      providers: [PrismaService],
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

    prisma = moduleFixture.get<PrismaService>(PrismaService);
  });

  beforeEach(async () => {
    if (prisma) {
      await prisma.cleanDatabase();
    }
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  // --- LE TEST ---
  it('devrait pouvoir créer un club dans la base de données de test', async () => {
    // Arrange (Préparation)
    const newClubData = {
      name: 'Le Cercle des Lecteurs',
      slug: 'le-cercle-des-lecteurs',
    };

    // Act (Action)
    const createdClub = await prisma.club.create({
      data: newClubData,
    });

    // Assert (Vérification)
    expect(createdClub).toBeDefined();
    expect(createdClub.id).toBeDefined();
    expect(createdClub.name).toBe('Le Cercle des Lecteurs');
    expect(createdClub.slug).toBe('le-cercle-des-lecteurs');

    // On vérifie que c'est bien stocké en allant le relire
    const clubInDb = await prisma.club.findUnique({
      where: { id: createdClub.id },
    });
    expect(clubInDb).not.toBeNull();
  });
});
