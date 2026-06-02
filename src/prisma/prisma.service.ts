// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit {
  constructor(private configService: ConfigService) {
    const adapter = new PrismaPg({
      connectionString: configService.get<string>('DATABASE_URL'),
    });

    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();

    if (process.env.NODE_ENV !== 'production' && process.env.NODE_ENV !== 'test') {
      try {
        const userCount = await this.user.count();
        if (userCount === 0) {
          console.log('📡 No users found in database. Auto-seeding initial development data...');
          const { seed } = await import('./seed');
          await seed(this);
        }
      } catch (error) {
        console.error('⚠️ Failed to run auto-seeding:', error);
      }
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  async cleanDatabase() {
    await this.progression.deleteMany();
    await this.review.deleteMany();
    await this.chapter.deleteMany();
    await this.book.deleteMany();
    await this.clubMember.deleteMany();
    await this.user.deleteMany();
    await this.club.deleteMany();
  }
}
