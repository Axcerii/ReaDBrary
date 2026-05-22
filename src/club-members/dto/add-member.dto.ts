import { IsString, IsNotEmpty, IsOptional, IsEnum } from 'class-validator';
import { ClubRole } from '../../../generated/prisma/client';

export class AddMemberDto {
  @IsString()
  @IsNotEmpty({ message: "L'ID de l'utilisateur est obligatoire" })
  userId: string;

  @IsEnum(ClubRole, { message: "Le rôle spécifié n'est pas valide" })
  @IsOptional()
  role?: ClubRole;
}
