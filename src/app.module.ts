import { Module, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { auth } from './auth/auth'; // Your Better Auth instance
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ClubsModule } from './clubs/clubs.module';
import { PrismaModule } from './prisma/prisma.module';
import { ClubMembersModule } from './club-members/club-members.module';
import { BooksModule } from './books/books.module';
import { ReviewsModule } from './reviews/reviews.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule.forRoot({ auth }),
    ClubsModule,
    ClubMembersModule,
    BooksModule,
    ReviewsModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
  ],
})
export class AppModule {}
