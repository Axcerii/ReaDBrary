import {
  Module,
  ValidationPipe,
  NestModule,
  MiddlewareConsumer,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_PIPE, APP_FILTER } from '@nestjs/core';
import { AppController } from './app.controller';
import { AuthController } from './auth/auth.controller';
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
import { ChaptersModule } from './chapters/chapters.module';
import { UserController } from './users/users.controller';
import { AuthLoggerMiddleware } from './auth/middleware/auth-logger.middleware';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

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
    ChaptersModule,
  ],
  controllers: [AppController, AuthController, UserController],
  providers: [
    AppService,
    {
      provide: APP_PIPE,
      useClass: ValidationPipe,
    },
    {
      provide: APP_FILTER,
      useClass: GlobalExceptionFilter,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(AuthLoggerMiddleware).forRoutes('*');
  }
}
