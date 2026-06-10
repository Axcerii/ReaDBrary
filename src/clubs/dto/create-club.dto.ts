import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum } from 'class-validator';
import { DragonTheme } from '../../../generated/prisma/client';

export class CreateClubDto {
  @IsString()
  @IsNotEmpty({ message: 'Le nom du club est obligatoire' })
  name: string;

  @IsString()
  @IsOptional()
  slug?: string;

  @IsBoolean()
  @IsOptional()
  isPublic?: boolean;

  @IsOptional()
  @IsEnum(DragonTheme, { message: "Le thème doit être l'un des dragons suivants : Aqua, Artrish, Chronos, Drii, Goliath, Guizamark, Lada, Pestia, Pura, Shizari, Yinva" })
  theme?: DragonTheme;
}
