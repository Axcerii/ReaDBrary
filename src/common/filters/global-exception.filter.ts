import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Prisma } from '../../../generated/prisma/client';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('GlobalExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | object = 'Internal server error';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      message = exception.getResponse();
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      // Prisma database errors mapping
      switch (exception.code) {
        case 'P2002': {
          status = HttpStatus.CONFLICT;
          const target =
            (exception.meta?.target as string[])?.join(', ') || 'fields';
          message = `Un enregistrement avec cette valeur existe déjà (conflit sur : ${target}).`;
          break;
        }
        case 'P2025': {
          status = HttpStatus.NOT_FOUND;
          message = "L'enregistrement demandé est introuvable.";
          break;
        }
        case 'P2003': {
          status = HttpStatus.BAD_REQUEST;
          message =
            'Erreur de clé étrangère (une relation requise est manquante ou invalide).';
          break;
        }
        default: {
          // Keep internal Prisma error codes obscured but log it
          this.logger.error(
            `Prisma error ${exception.code}: ${exception.message}`,
            exception.stack,
          );
          message = 'Une erreur de base de données est survenue.';
          break;
        }
      }
    } else {
      // Any other unexpected errors (e.g. Node error, TypeError, etc.)
      const errorMsg =
        exception instanceof Error ? exception.message : String(exception);
      const errorStack =
        exception instanceof Error ? exception.stack : undefined;

      this.logger.error(`Unhandled Exception: ${errorMsg}`, errorStack);

      status = HttpStatus.INTERNAL_SERVER_ERROR;
      message = 'Internal server error';
    }

    // Format the response body uniformly
    const responseBody =
      typeof message === 'string'
        ? {
            statusCode: status,
            message: message,
            timestamp: new Date().toISOString(),
            path: request.url,
          }
        : {
            statusCode: status,
            timestamp: new Date().toISOString(),
            path: request.url,
            ...message, // If it's the default Nest validation error object (which includes validation messages)
          };

    response.status(status).json(responseBody);
  }
}
