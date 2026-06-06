import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ClubMembersController } from './club-members.controller';
import { ClubJoinRequestsController } from './club-join-requests.controller';
import { ClubMembersService } from './club-members.service';

@Module({
  imports: [PrismaModule],
  controllers: [ClubMembersController, ClubJoinRequestsController],
  providers: [ClubMembersService],
})
export class ClubMembersModule {}
