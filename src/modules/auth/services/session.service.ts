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
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import {
  AuditOutcome,
  Prisma,
  type Session,
  type User,
} from '../../../generated/prisma/client.js';
import {
  AUTH_AUDIT,
  AUTH_ERROR,
  MAX_ACTIVE_SESSIONS,
  REFRESH_TOKEN_BYTES,
  ROTATION_GRACE_MS,
} from '../auth.constants.js';
import { createOpaqueToken, hashOpaqueToken } from '../opaque-token.util.js';

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly cls: ClsService,
    private readonly audit: AuditService,
  ) {}

  async issue(
    userId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ token: string; sessionId: string }> {
    const token = createOpaqueToken(REFRESH_TOKEN_BYTES);

    const session = await client.session.create({
      data: {
        userId,
        expiresAt: this.expiryDate(),
        ip: this.cls.get('ip'),
        userAgent: this.cls.get('userAgent'),
        device: this.cls.get('device'),
        refreshTokens: { create: { tokenHash: hashOpaqueToken(token) } },
      },
    });

    await this.revokeBeyondLimit(userId, client);

    return { token, sessionId: session.id };
  }

  async rotate(
    refreshToken: string,
  ): Promise<{ token: string; user: User; sessionId: string }> {
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: hashOpaqueToken(refreshToken) },
      include: { session: { include: { user: true } } },
    });

    if (!stored) {
      throw new UnauthorizedError(
        AUTH_ERROR.INVALID_REFRESH_TOKEN,
        'Refresh token is invalid',
      );
    }

    const { session } = stored;

    if (session.revokedAt) {
      throw sessionRevokedError();
    }

    if (stored.usedAt && !withinGraceWindow(stored.usedAt)) {
      await this.rejectReuse(session.userId);
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

    const token = createOpaqueToken(REFRESH_TOKEN_BYTES);
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.refreshToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: now },
      });

      if (claimed.count > 0) {
        await tx.refreshToken.deleteMany({
          where: { sessionId: session.id, usedAt: null },
        });
      }

      await tx.refreshToken.create({
        data: { sessionId: session.id, tokenHash: hashOpaqueToken(token) },
      });

      const touched = await tx.session.updateMany({
        where: { id: session.id, revokedAt: null },
        data: {
          lastUsedAt: now,
          ip: this.cls.get('ip') ?? session.ip,
          userAgent: this.cls.get('userAgent') ?? session.userAgent,
          device: this.cls.get('device') ?? session.device,
        },
      });

      if (touched.count === 0) {
        throw sessionRevokedError();
      }
    });

    return { token, user: session.user, sessionId: session.id };
  }

  async revokeByToken(
    refreshToken: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<{ id: string; userId: string } | null> {
    const [revoked] = await client.session.updateManyAndReturn({
      where: {
        revokedAt: null,
        refreshTokens: {
          some: { tokenHash: hashOpaqueToken(refreshToken), usedAt: null },
        },
      },
      data: { revokedAt: new Date() },
      select: { id: true, userId: true },
    });

    return revoked ?? null;
  }

  async revokeById({
    sessionId,
    userId,
  }: {
    sessionId: string;
    userId: string;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const revoked = await tx.session.updateMany({
        where: { id: sessionId, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      if (revoked.count === 0) {
        throw new NotFoundError(
          AUTH_ERROR.SESSION_NOT_FOUND,
          'Session not found',
        );
      }

      await this.audit.record(
        {
          event: AUTH_AUDIT.SESSION_REVOKED,
          subjectId: userId,
          targetType: AUDIT_TARGET.SESSION,
          targetId: sessionId,
        },
        tx,
      );
    });
  }

  async revokeAll(
    userId: string,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const revoked = await client.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await this.audit.record(
      {
        event: AUTH_AUDIT.SESSION_REVOKED,
        subjectId: userId,
        targetType: AUDIT_TARGET.USER,
        targetId: userId,
        metadata: { scope: 'all', count: revoked.count },
      },
      client,
    );
  }

  async revokeOthers(
    { userId, keepSessionId }: { userId: string; keepSessionId: string },
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    const revoked = await client.session.updateMany({
      where: { userId, revokedAt: null, id: { not: keepSessionId } },
      data: { revokedAt: new Date() },
    });

    await this.audit.record(
      {
        event: AUTH_AUDIT.SESSION_REVOKED,
        subjectId: userId,
        targetType: AUDIT_TARGET.USER,
        targetId: userId,
        metadata: { scope: 'others', count: revoked.count },
      },
      client,
    );
  }

  async anonymize(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.session.updateMany({
      where: { userId },
      data: { ip: null, userAgent: null, device: null },
    });
  }

  async removeExpired(): Promise<number> {
    const retentionDays = this.config.get('SESSION_CLEANUP_RETENTION_DAYS', {
      infer: true,
    });
    const threshold = new Date(Date.now() - retentionDays * MS_PER_DAY);

    const { count } = await this.prisma.session.deleteMany({
      where: {
        OR: [
          { expiresAt: { lt: threshold } },
          { revokedAt: { lt: threshold } },
        ],
      },
    });

    return count;
  }

  async findAllActive(userId: string): Promise<Session[]> {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { lastUsedAt: 'desc' },
    });
  }

  private async revokeBeyondLimit(
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

  private async rejectReuse(userId: string): Promise<never> {
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          event: AUTH_AUDIT.SESSION_TOKEN_REUSE,
          outcome: AuditOutcome.FAILURE,
          subjectId: userId,
          targetType: AUDIT_TARGET.USER,
          targetId: userId,
        },
        tx,
      );
      await this.revokeAll(userId, tx);
    });

    throw new UnauthorizedError(
      AUTH_ERROR.REFRESH_TOKEN_REUSED,
      'Refresh token was already used',
    );
  }

  private expiryDate(): Date {
    const days = this.config.get('REFRESH_TTL_DAYS', { infer: true });
    return new Date(Date.now() + days * MS_PER_DAY);
  }
}

function withinGraceWindow(usedAt: Date): boolean {
  return Date.now() - usedAt.getTime() <= ROTATION_GRACE_MS;
}

function sessionRevokedError(): UnauthorizedError {
  return new UnauthorizedError(
    AUTH_ERROR.SESSION_REVOKED,
    'Session has been revoked',
  );
}
