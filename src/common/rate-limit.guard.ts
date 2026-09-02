import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { AuthUser } from './auth-user.type.js';

@Injectable()
export class RateLimitGuard extends ThrottlerGuard {
  protected getTracker(req: { user?: AuthUser; ip?: string }): Promise<string> {
    return Promise.resolve(req.user?.id ?? req.ip ?? 'unknown');
  }
}
