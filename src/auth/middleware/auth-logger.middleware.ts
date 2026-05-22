import { Injectable, NestMiddleware, Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { auth } from '../auth';

@Injectable()
export class AuthLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('AuthLogger');

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const session = await auth.api.getSession({
        headers: req.headers as Record<string, string>,
      });

      if (session && session.user) {
        this.logger.log(
          `[Auth Request] ${req.method} ${req.originalUrl} - User: ${session.user.email} (${session.user.id})`,
        );
      }
    } catch (err) {
      // Fail silently for logging middleware
    }

    next();
  }
}
