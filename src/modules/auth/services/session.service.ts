import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundError,
  UnauthorizedError,
} from '../../../common/domain.error.js';
import { MS_PER_DAY } from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { Session, User } from '../../../generated/prisma/client.js';
import {
  AUTH_ERROR,
  MAX_ACTIVE_SESSIONS,
  MAX_ROTATE_ATTEMPTS,
  REFRESH_TOKEN_BYTES,
  ROTATION_GRACE_MS,
} from '../auth.constants.js';
import type { SessionContext } from '../auth.types.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  async issue(
    userId: string,
    context: SessionContext,
  ): Promise<{ token: string; sessionId: string }> {
    const token = this.createToken();

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: this.expiryDate(),
        ip: context.ip,
        userAgent: context.userAgent,
        device: context.device,
      },
    });

    await this.revokeSessionsBeyondLimit(userId);

    return { token, sessionId: session.id };
  }

  async rotate(
    refreshToken: string,
    context: SessionContext,
  ): Promise<{ token: string; user: User; sessionId: string }> {
    for (let attempt = 0; attempt < MAX_ROTATE_ATTEMPTS; attempt += 1) {
      const rotated = await this.tryRotate(refreshToken, context);
      if (rotated) return rotated;
    }

    throw new UnauthorizedError(
      AUTH_ERROR.INVALID_REFRESH_TOKEN,
      'Refresh token is invalid',
    );
  }

  async revokeByToken(refreshToken: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { tokenHash: hashToken(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeById(sessionId: string, userId: string): Promise<void> {
    const revoked = await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    if (revoked.count === 0) {
      throw new NotFoundError(
        AUTH_ERROR.SESSION_NOT_FOUND,
        'Session not found',
      );
    }
  }

  async revokeAll(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  private async revokeSessionsBeyondLimit(userId: string): Promise<void> {
    const excess = await this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true },
      skip: MAX_ACTIVE_SESSIONS,
    });

    if (excess.length === 0) return;

    await this.prisma.session.updateMany({
      where: { id: { in: excess.map((session) => session.id) } },
      data: { revokedAt: new Date() },
    });
  }

  private async tryRotate(
    refreshToken: string,
    context: SessionContext,
  ): Promise<{ token: string; user: User; sessionId: string } | null> {
    const hash = hashToken(refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { OR: [{ tokenHash: hash }, { previousHash: hash }] },
      include: { user: true },
    });

    if (!session) {
      throw new UnauthorizedError(
        AUTH_ERROR.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid',
      );
    }

    if (session.revokedAt) {
      throw new UnauthorizedError(
        AUTH_ERROR.SESSION_REVOKED,
        'Session has been revoked',
      );
    }

    if (session.previousHash === hash && !this.withinGraceWindow(session)) {
      await this.reuseDetected(session.userId);
    }

    if (session.expiresAt <= new Date()) {
      throw new UnauthorizedError(
        AUTH_ERROR.REFRESH_TOKEN_EXPIRED,
        'Refresh token has expired',
      );
    }

    if (session.user.deletedAt) {
      throw new UnauthorizedError(
        AUTH_ERROR.ACCOUNT_DELETED,
        'Account is no longer active',
      );
    }

    const token = this.createToken();
    const now = new Date();

    const updated = await this.prisma.session.updateMany({
      where: { id: session.id, tokenHash: session.tokenHash, revokedAt: null },
      data: {
        tokenHash: hashToken(token),
        previousHash: session.tokenHash,
        rotatedAt: now,
        lastUsedAt: now,
        ip: context.ip ?? session.ip,
        userAgent: context.userAgent ?? session.userAgent,
        device: context.device ?? session.device,
      },
    });

    return updated.count === 0
      ? null
      : { token, user: session.user, sessionId: session.id };
  }

  private async reuseDetected(userId: string): Promise<never> {
    await this.revokeAll(userId);
    throw new UnauthorizedError(
      AUTH_ERROR.REFRESH_TOKEN_REUSED,
      'Refresh token was already used',
    );
  }

  private withinGraceWindow(session: Session): boolean {
    if (!session.rotatedAt) return false;
    return Date.now() - session.rotatedAt.getTime() <= ROTATION_GRACE_MS;
  }

  private createToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private expiryDate(): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * MS_PER_DAY);
  }
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
