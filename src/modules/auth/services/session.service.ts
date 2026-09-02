import { createHash, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { ConfigService } from '@nestjs/config';
import {
  NotFoundError,
  UnauthorizedError,
} from '../../../common/domain.error.js';
import { MS_PER_DAY } from '../../../common/constants/time.constants.js';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  Prisma,
  type Session,
  type User,
} from '../../../generated/prisma/client.js';
import {
  AUTH_ERROR,
  MAX_ACTIVE_SESSIONS,
  MAX_ROTATE_ATTEMPTS,
  REFRESH_TOKEN_BYTES,
  ROTATION_GRACE_MS,
} from '../auth.constants.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
  ) {}

  async issue(
    userId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ token: string; sessionId: string }> {
    const token = this.createToken();

    const session = await client.session.create({
      data: {
        userId,
        tokenHash: hashToken(token),
        expiresAt: this.expiryDate(),
        ip: this.cls.get('ip'),
        userAgent: this.cls.get('userAgent'),
        device: this.cls.get('device'),
      },
    });

    await this.revokeSessionsBeyondLimit(userId, client);

    return { token, sessionId: session.id };
  }

  async rotate(
    refreshToken: string,
  ): Promise<{ token: string; user: User; sessionId: string }> {
    for (let attempt = 0; attempt < MAX_ROTATE_ATTEMPTS; attempt += 1) {
      const rotated = await this.tryRotate(refreshToken);
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

  async revokeAll(
    userId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.session.updateMany({
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

  private async revokeSessionsBeyondLimit(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    const excess = await client.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
      select: { id: true },
      skip: MAX_ACTIVE_SESSIONS,
    });

    if (excess.length === 0) return;

    await client.session.updateMany({
      where: { id: { in: excess.map((session) => session.id) } },
      data: { revokedAt: new Date() },
    });
  }

  private async tryRotate(
    refreshToken: string,
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
        ip: this.cls.get('ip') ?? session.ip,
        userAgent: this.cls.get('userAgent') ?? session.userAgent,
        device: this.cls.get('device') ?? session.device,
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
