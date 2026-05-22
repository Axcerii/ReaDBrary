import { Module, ValidationPipe, NestModule, MiddlewareConsumer } from '@nestjs/common';
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
import { ProgressionModule } from './progression/progression.module';
import { AdminModule } from './admin/admin.module';
import { PagesModule } from './pages/pages.module';
import { AuthLoggerMiddleware } from './auth/middleware/auth-logger.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule.forRoot({ auth }),
    ClubsModule,
    ClubMembersModule,
    BooksModule,
    ReviewsModule,
    ProgressionModule,
    AdminModule,
    PagesModule,
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
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthLoggerMiddleware).forRoutes('*');
  }
}

