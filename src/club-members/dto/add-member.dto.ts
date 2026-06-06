import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ClubRole } from '../../../generated/prisma/client';

export class AddMemberDto {
  @IsString()
  @IsOptional()
  userId?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsEnum(ClubRole, { message: "Le rôle spécifié n'est pas valide" })
  @IsOptional()
  role?: ClubRole;
}
