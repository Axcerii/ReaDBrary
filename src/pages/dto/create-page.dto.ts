import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class CreatePageDto {
  @IsInt({ message: "L'index de page doit être un entier" })
  @Min(1, { message: "L'index de page doit être supérieur à 0" })
  @Type(() => Number)
  index: number;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Le texte est obligatoire' })
  text: string;

  @IsString()
  @IsOptional()
  image?: string;
}
