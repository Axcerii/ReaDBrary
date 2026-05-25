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

  // --- THE TEST ---
  it('should be able to create a club in the test database', async () => {
    // Arrange
    const newClubData = {
      name: 'Le Cercle des Lecteurs',
      slug: 'le-cercle-des-lecteurs',
    };

    // Act
    const createdClub = await prisma.club.create({
      data: newClubData,
    });

    // Assert
    expect(createdClub).toBeDefined();
    expect(createdClub.id).toBeDefined();
    expect(createdClub.name).toBe('Le Cercle des Lecteurs');
    expect(createdClub.slug).toBe('le-cercle-des-lecteurs');

    // Verify that it is stored by reading it back
    const clubInDb = await prisma.club.findUnique({
      where: { id: createdClub.id },
    });
    expect(clubInDb).not.toBeNull();
  });
});
