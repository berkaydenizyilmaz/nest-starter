import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import { Prisma } from '../generated/prisma/client.js';
import {
  DomainError,
  type ErrorKind,
  ValidationError,
} from './domain.error.js';
import type { ErrorResponseBody } from './schemas/error-response.schema.js';
import { COMMON_ERROR } from './constants/error-codes.constants.js';

const KIND_TO_STATUS: Record<ErrorKind, HttpStatus> = {
  VALIDATION: HttpStatus.UNPROCESSABLE_ENTITY,
  UNAUTHORIZED: HttpStatus.UNAUTHORIZED,
  FORBIDDEN: HttpStatus.FORBIDDEN,
  NOT_FOUND: HttpStatus.NOT_FOUND,
  CONFLICT: HttpStatus.CONFLICT,
};

const PRISMA_STATUS: Record<
  string,
  { status: HttpStatus; code: string; message: string }
> = {
  P2002: {
    status: HttpStatus.CONFLICT,
    code: COMMON_ERROR.UNIQUE_CONSTRAINT,
    message: 'A record with these values already exists',
  },
  P2003: {
    status: HttpStatus.CONFLICT,
    code: COMMON_ERROR.FOREIGN_KEY_CONSTRAINT,
    message: 'A related record prevents this operation',
  },
  P2025: {
    status: HttpStatus.NOT_FOUND,
    code: COMMON_ERROR.NOT_FOUND,
    message: 'The requested record was not found',
  },
};

interface Described {
  statusCode: number;
  code: string;
  message: string;
  unexpected: boolean;
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(
    private readonly logger: PinoLogger,
    private readonly cls: ClsService,
  ) {
    this.logger.setContext(AllExceptionsFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();

    const described = this.describe(exception);

    if (described.unexpected) {
      this.logger.error({ err: exception }, described.message);
    } else {
      this.logger.warn(
        { statusCode: described.statusCode, code: described.code },
        described.message,
      );
    }

    const body: ErrorResponseBody = {
      statusCode: described.statusCode,
      code: described.code,
      message: described.message,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: this.cls.getId(),
      errors:
        exception instanceof ValidationError && exception.issues.length > 0
          ? exception.issues
          : undefined,
    };

    response.status(described.statusCode).json(body);
  }

  private describe(exception: unknown): Described {
    if (exception instanceof DomainError) {
      return {
        statusCode: KIND_TO_STATUS[exception.kind],
        code: exception.code,
        message: exception.message,
        unexpected: false,
      };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_STATUS[exception.code];
      if (mapped) {
        return {
          statusCode: mapped.status,
          code: mapped.code,
          message: mapped.message,
          unexpected: false,
        };
      }
    }

    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      return {
        statusCode,
        code: HttpStatus[statusCode] ?? `HTTP_${statusCode}`,
        message: extractMessage(exception),
        unexpected: statusCode >= HttpStatus.INTERNAL_SERVER_ERROR,
      };
    }

    return {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: COMMON_ERROR.INTERNAL_ERROR,
      message: 'Internal server error',
      unexpected: true,
    };
  }
}

function extractMessage(exception: HttpException): string {
  const payload = exception.getResponse();
  if (typeof payload === 'string') return payload;

  const message = (payload as { message?: unknown }).message;
  if (typeof message === 'string') return message;
  if (Array.isArray(message)) return message.join('; ');
  return exception.message;
}
