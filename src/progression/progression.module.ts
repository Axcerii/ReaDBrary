import { Module } from '@nestjs/common';
import { ProgressionService } from './progression.service';
import { ProgressionController } from './progression.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProgressionController],
  providers: [ProgressionService],
})
export class ProgressionModule {}
