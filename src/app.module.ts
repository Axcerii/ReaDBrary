import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { auth } from "./auth/auth"; // Your Better Auth instance
import { AuthModule } from '@thallesp/nestjs-better-auth';


@Module({
  imports: [
    AuthModule.forRoot({ auth }),
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
