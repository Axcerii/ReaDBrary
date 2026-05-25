import { IsString, IsNotEmpty, IsInt, Min, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';

export class UpdateChapterDto {
  @IsInt({ message: "L'index de chapitre doit être un entier" })
  @Min(1, { message: "L'index de chapitre doit être supérieur à 0" })
  @Type(() => Number)
  @IsOptional()
  index?: number;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  @IsOptional()
  title?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le contenu est obligatoire' })
  @IsOptional()
  content?: string;
}
