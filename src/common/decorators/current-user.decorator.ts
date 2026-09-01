import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthUser } from '../auth-user.type.js';

export const CurrentUser = createParamDecorator(
  (data: keyof AuthUser | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: AuthUser }>();
    const user = request.user;
    
    if (!user) {
      throw new Error(
        '@CurrentUser() requires an authenticated request. Is the route marked @Public()?',
      );
    }

    return data ? user[data] : user;
  },
);
