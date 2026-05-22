import { Controller, Post, Get, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SignUpEmailDto } from './dto/sign-up.dto';
import { SignInEmailDto } from './dto/sign-in.dto';

@ApiTags('Authentification')
@AllowAnonymous()
@Controller('api/auth')
export class AuthController {
  @Post('sign-up/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Inscription avec email et mot de passe',
    description: 'Crée un nouveau compte utilisateur.',
  })
  @ApiResponse({
    status: 200,
    description: 'Inscription réussie et session créée.',
  })
  @ApiResponse({
    status: 400,
    description: 'Données d\'inscription invalides ou email déjà utilisé.',
  })
  signUp(@Body() signUpDto: SignUpEmailDto) {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { token: 'string', user: {} };
  }

  @Post('sign-in/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Connexion avec email et mot de passe',
    description: 'Connecte un utilisateur existant et génère une session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Connexion réussie et session créée.',
  })
  @ApiResponse({
    status: 400,
    description: 'Identifiants de connexion invalides.',
  })
  signIn(@Body() signInDto: SignInEmailDto) {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { token: 'string', user: {} };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Déconnexion de l\'utilisateur',
    description: 'Détruit la session de l\'utilisateur connecté.',
  })
  @ApiResponse({
    status: 200,
    description: 'Déconnexion réussie.',
  })
  signOut() {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { success: true };
  }

  @Get('get-session')
  @ApiOperation({
    summary: 'Récupérer la session active',
    description: 'Renvoie les informations sur la session et l\'utilisateur actuellement connectés.',
  })
  @ApiResponse({
    status: 200,
    description: 'Détails de la session active retournés.',
  })
  @ApiResponse({
    status: 401,
    description: 'Aucune session active trouvée.',
  })
  getSession() {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { session: {}, user: {} };
  }
}
