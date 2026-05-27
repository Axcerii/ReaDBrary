import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SignInSocialDto {
  @ApiProperty({
    description: 'Nom du fournisseur OAuth',
    example: 'google',
  })
  @IsString()
  @IsNotEmpty({ message: 'Le fournisseur OAuth est obligatoire' })
  provider: string;

  @ApiProperty({
    description: 'URL de redirection après une connexion réussie',
    required: false,
    example: 'http://localhost:3000',
  })
  @IsString()
  @IsOptional()
  callbackURL?: string;

  @ApiProperty({
    description: 'URL de redirection en cas d\'erreur',
    required: false,
    example: 'http://localhost:3000/error',
  })
  @IsString()
  @IsOptional()
  errorCallbackURL?: string;

  @ApiProperty({
    description: 'URL de redirection si l\'utilisateur est nouveau',
    required: false,
    example: 'http://localhost:3000/welcome',
  })
  @IsString()
  @IsOptional()
  newUserCallbackURL?: string;

  @ApiProperty({
    description: 'Désactiver la redirection automatique vers le fournisseur',
    required: false,
    example: false,
  })
  @IsBoolean()
  @IsOptional()
  disableRedirect?: boolean;

  @ApiProperty({
    description: 'Portées (scopes) OAuth supplémentaires à demander',
    required: false,
    type: [String],
    example: ['profile', 'email'],
  })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  scope?: string[];
}
