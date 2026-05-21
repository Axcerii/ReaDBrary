import { IsString, IsInt, Min, Max, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @IsInt({ message: 'La note doit être un nombre entier' })
  @Min(1, { message: 'La note doit être supérieure ou égale à 1' })
  @Max(5, { message: 'La note doit être inférieure ou égale à 5' })
  @Type(() => Number)
  rating: number;

  @IsString({ message: 'Le commentaire doit être une chaîne de caractères' })
  @IsOptional()
  comment?: string;
}
