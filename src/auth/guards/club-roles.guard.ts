import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service';
import { CLUB_ROLES_KEY } from '../decorators/club-roles.decorator';
import { ClubRole, ClubMember } from '../../../generated/prisma/client';
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
  clubMember?: ClubMember;
  userSession?: BetterAuthSession;
}

@Injectable()
export class ClubRolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredRoles = this.reflector.getAllAndOverride<ClubRole[]>(
      CLUB_ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Explicit type casting to avoid ESLint unsafe assignment warnings
    const session = (await auth.api.getSession({
      headers: request.headers as Record<string, string>,
    })) as BetterAuthSession | null;

    if (!session || !session.user) {
      throw new UnauthorizedException('Non authentifié');
    }

    const dbUser = await this.prisma.user.findUnique({
      where: { id: session.user.id },
    });

    if (!dbUser) {
      throw new UnauthorizedException('Utilisateur non trouvé.');
    }

    if (!dbUser.isActive) {
      throw new ForbiddenException(
        'Votre compte a été désactivé par un administrateur.',
      );
    }

    // Admin has global bypass
    if (dbUser.role === 'ADMIN') {
      request.userSession = session;
      return true;
    }

    const { clubSlug, clubId } = request.params;
    if (!clubSlug && !clubId) {
      throw new ForbiddenException(
        'Identifiant du club manquant (clubSlug ou clubId requis)',
      );
    }

    // Load the club to check if active
    const club = await this.prisma.club.findFirst({
      where: clubSlug ? { slug: clubSlug as string } : { id: clubId as string },
    });

    if (!club) {
      throw new NotFoundException("Le club n'existe pas.");
    }

    const membership = await this.prisma.clubMember.findFirst({
      where: {
        userId: session.user.id,
        clubId: club.id,
      },
    });

    if (!club.isActive) {
      const isOwner = membership?.role === 'OWNER';
      if (!isOwner) {
        throw new NotFoundException("Le club n'existe pas ou est désactivé.");
      }
    }

    if (!membership) {
      throw new ForbiddenException("Vous n'êtes pas membre de ce club.");
    }

    const hasRole = requiredRoles.includes(membership.role);
    if (!hasRole) {
      throw new ForbiddenException(
        "Vous n'avez pas les droits nécessaires pour effectuer cette action.",
      );
    }

    request.clubMember = membership;
    request.userSession = session;

    return true;
  }
}
