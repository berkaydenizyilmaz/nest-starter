import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from './decorators/roles.decorator.js';
import { COMMON_ERROR } from './constants/error-codes.constants.js';
import { ForbiddenError } from './domain.error.js';
import type { AuthUser } from './auth-user.type.js';
import type { Role } from '../generated/prisma/client.js';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const request = context.switchToHttp().getRequest<{ user?: AuthUser }>();

    if (!request.user || !required.includes(request.user.role)) {
      throw new ForbiddenError(
        COMMON_ERROR.INSUFFICIENT_ROLE,
        'Insufficient permissions',
      );
    }

    return true;
  }
}
