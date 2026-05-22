import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubMembersController } from './club-members.controller';
import { ClubMembersService } from './club-members.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClubMembersController],
  providers: [ClubMembersService],
})
export class ClubMembersModule {}
