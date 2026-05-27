import { IsString, IsNotEmpty, IsEmail } from 'class-validator';

export class SignInEmailDto {
  @IsEmail({}, { message: "L'adresse email doit être valide" })
  @IsNotEmpty({ message: "L'email est obligatoire" })
  email: string;

  @IsString()
  @IsNotEmpty({ message: 'Le mot de passe est obligatoire' })
  password: string;
}
