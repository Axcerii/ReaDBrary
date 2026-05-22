import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class CreateClubDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du club est obligatoire' })
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;
}
