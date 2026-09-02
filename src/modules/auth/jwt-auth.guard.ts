import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { ClsService } from 'nestjs-cls';
import { PinoLogger } from 'nestjs-pino';
import type { Request } from 'express';
import type { Env } from '../../config/env.schema.js';
import { AUTH_ERROR } from './auth.constants.js';
import type { AuthUser } from '../../common/auth-user.type.js';
import type { AccessTokenPayload } from './auth.types.js';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import { UnauthorizedError } from '../../common/domain.error.js';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
    private readonly logger: PinoLogger,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const request = context
      .switchToHttp()
      .getRequest<Request & { user?: AuthUser }>();

    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedError(
        AUTH_ERROR.MISSING_TOKEN,
        'Authentication required',
      );
    }

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
      });
    } catch {
      throw new UnauthorizedError(
        AUTH_ERROR.INVALID_TOKEN,
        'Invalid or expired token',
      );
    }

    this.logger.assign({ userId: payload.sub });

    const user: AuthUser = {
      id: payload.sub,
      role: payload.role as AuthUser['role'],
      sessionId: payload.sid,
    };

    request.user = user;
    this.cls.set('user', user);

    return true;
  }
}

function extractBearerToken(request: Request): string | undefined {
  const [scheme, token] = request.headers.authorization?.split(' ') ?? [];
  return scheme === 'Bearer' && token ? token : undefined;
}
