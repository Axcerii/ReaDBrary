import { IsEnum, IsNotEmpty } from 'class-validator';
import { ClubRole } from '../../../generated/prisma/client';

export class UpdateMemberRoleDto {
  @IsEnum(ClubRole, { message: "Le rôle spécifié n'est pas valide" })
  @IsNotEmpty({ message: 'Le rôle est obligatoire' })
  role: ClubRole;
}
