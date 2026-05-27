import { IsString, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateChapterDto {
  @IsInt({ message: "L'index de chapitre doit être un entier" })
  @Min(1, { message: "L'index de chapitre doit être supérieur à 0" })
  @Type(() => Number)
  index: number;

  @IsString()
  @IsNotEmpty({ message: 'Le titre est obligatoire' })
  title: string;

  @IsString()
  @IsNotEmpty({ message: 'Le contenu est obligatoire' })
  content: string;
}
