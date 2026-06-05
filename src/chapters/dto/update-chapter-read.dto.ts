import { IsBoolean } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateChapterReadDto {
  @ApiProperty({ description: 'Read state of the chapter' })
  @IsBoolean()
  read: boolean;
}
