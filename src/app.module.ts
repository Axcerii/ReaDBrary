import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { auth } from "./auth/auth"; // Your Better Auth instance
import { AuthModule } from '@thallesp/nestjs-better-auth';
import { ClubsModule } from './clubs/clubs.module';
import { PrismaModule } from './prisma/prisma.module';


@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule.forRoot({ auth }),
    ClubsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
