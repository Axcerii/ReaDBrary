import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { auth } from '../auth';
import { Request } from 'express';

interface BetterAuthSession {
  user: {
    id: string;
    email: string;
    role: 'USER' | 'ADMIN';
    name: string | null;
  };
}

interface AuthenticatedRequest extends Request {
  userSession?: BetterAuthSession;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    const session = (await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    })) as BetterAuthSession | null;

    if (!session || !session.user) {
      throw new UnauthorizedException('Non authentifié');
    }

    // Verify user activity status in database
    const dbUser = await this.prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!dbUser) {
      throw new UnauthorizedException('Utilisateur non trouvé.');
    }

    if (!dbUser.isActive) {
      throw new ForbiddenException('Votre compte a été désactivé par un administrateur.');
    }

    if (dbUser.role !== 'ADMIN') {
      throw new ForbiddenException('Accès réservé aux administrateurs.');
    }

    request.userSession = session;
    return true;
  }
}
