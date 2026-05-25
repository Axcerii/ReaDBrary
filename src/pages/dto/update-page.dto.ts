import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdatePageDto {
  @IsInt({ message: "L'index de page doit être un entier" })
  @Min(1, { message: "L'index de page doit être supérieur à 0" })
  @Type(() => Number)
  @IsOptional()
  index?: number;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le texte est obligatoire' })
  @IsOptional()
  text?: string;

  @IsString()
  @IsOptional()
  image?: string;
}
