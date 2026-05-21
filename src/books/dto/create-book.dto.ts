import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBookDto {
  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: "L'auteur est obligatoire" })
  author: string;

  @IsString()
  @IsNotEmpty({ message: 'Le genre est obligatoire' })
  genre: string;

  @IsInt({ message: 'Le nombre de pages doit être un entier' })
  @Min(1, { message: 'Le nombre de pages doit être supérieur à 0' })
  @Type(() => Number)
  pages: number;
}
