import {
  Controller,
  Post,
  Get,
  Body,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';
import { SignUpEmailDto } from './dto/sign-up.dto';
import { SignInEmailDto } from './dto/sign-in.dto';
import { SignInSocialDto } from './dto/sign-in-social.dto';

@ApiTags('Authentication')
@AllowAnonymous()
@Controller('api/auth')
export class AuthController {
  @Post('sign-up/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign up with email and password',
    description: 'Creates a new user account.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful sign up and session created.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid sign up data or email already in use.',
  })
  signUp(@Body() signUpDto: SignUpEmailDto) {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { token: 'string', user: {} };
  }

  @Post('sign-in/email')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with email and password',
    description: 'Authenticates an existing user and generates a session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful sign in and session created.',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid credentials.',
  })
  signIn(@Body() signInDto: SignInEmailDto) {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { token: 'string', user: {} };
  }

  @Post('sign-in/social')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign in with social OAuth provider',
    description: 'Authenticates a user via Google OAuth or another configured provider.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successful redirect url generated or session created.',
  })
  @ApiResponse({
    status: 400,
    description: 'OAuth provider or configuration error.',
  })
  signInSocial(@Body() signInSocialDto: SignInSocialDto) {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { url: 'string' };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Sign out user',
    description: 'Destroys the active user session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully signed out.',
  })
  signOut() {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { success: true };
  }

  @Get('get-session')
  @ApiOperation({
    summary: 'Get active session',
    description:
      'Returns information about the currently active session and user.',
  })
  @ApiResponse({
    status: 200,
    description: 'Active session details returned successfully.',
  })
  @ApiResponse({
    status: 401,
    description: 'No active session found.',
  })
  getSession() {
    // Cette route est interceptée et traitée par le middleware Better Auth.
    // Cette méthode sert uniquement à la génération de la documentation Swagger.
    return { session: {}, user: {} };
  }
}
