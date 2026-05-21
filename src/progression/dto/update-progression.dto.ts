import { IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateProgressionDto {
  @IsInt({ message: 'La page courante doit être un nombre entier' })
  @Min(0, { message: 'La page courante doit être supérieure ou égale à 0' })
  @Type(() => Number)
  currentPage: number;
}
