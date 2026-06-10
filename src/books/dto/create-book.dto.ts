import { IsString, IsNotEmpty, IsInt, Min, IsOptional, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { DragonTheme } from '../../../generated/prisma/client';

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

  @IsOptional()
  @IsInt({ message: 'Le nombre de pages doit être un entier' })
  @Min(1, { message: 'Le nombre de pages doit être supérieur à 0' })
  @Type(() => Number)
  pages?: number;

  @IsOptional()
  @IsEnum(DragonTheme, { message: "Le thème doit être l'un des dragons suivants : Aqua, Artrish, Chronos, Drii, Goliath, Guizamark, Lada, Pestia, Pura, Shizari, Yinva" })
  theme?: DragonTheme;
}
