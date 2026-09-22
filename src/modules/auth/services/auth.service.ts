import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import {
  ConflictError,
  TooManyRequestsError,
  UnauthorizedError,
} from '../../../common/domain.error.js';
import { MS_PER_SECOND } from '../../../common/constants/time.constants.js';
import { unusablePasswordHash } from '../../../common/utils/password.util.js';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import {
  AuditOutcome,
  Prisma,
  type User,
} from '../../../generated/prisma/client.js';
import {
  AUTH_AUDIT,
  AUTH_ERROR,
  LOGIN_BACKOFF_BASE_MS,
  LOGIN_BACKOFF_MAX_MS,
  LOGIN_FAILURE_DECAY_MS,
  LOGIN_FAILURE_THRESHOLD,
} from '../auth.constants.js';
import type { TokenSubject } from '../auth.types.js';
import type { LoginRequest } from '../dto/request/login.request.js';
import type { RegisterRequest } from '../dto/request/register.request.js';
import type { LoginResponseInput } from '../dto/response/login.response.js';
import type { TokenPairResponseInput } from '../dto/response/token-pair.response.js';
import { SessionService } from './session.service.js';

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyPasswordHash: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await unusablePasswordHash();
  }

  async register(input: RegisterRequest): Promise<TokenPairResponseInput> {
    const passwordHash = await argon2.hash(input.password);

    const { user, issued } = await this.prisma.$transaction(async (tx) => {
      let created: User;
      try {
        created = await tx.user.create({
          data: { email: input.email, passwordHash },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          throw new ConflictError(
            AUTH_ERROR.EMAIL_TAKEN,
            'Email is already registered',
          );
        }
        throw error;
      }

      await this.audit.record(
        {
          event: AUTH_AUDIT.USER_CREATED,
          actorId: created.id,
          subjectId: created.id,
          targetType: AUDIT_TARGET.USER,
          targetId: created.id,
        },
        tx,
      );

      return {
        user: created,
        issued: await this.sessions.issue(created.id, tx),
      };
    });

    return {
      accessToken: await this.signAccessToken(user, issued.sessionId),
      refreshToken: issued.token,
    };
  }

  async login(input: LoginRequest): Promise<LoginResponseInput> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? this.dummyPasswordHash,
      input.password,
    );

    const lockedFor = user ? remainingLockSeconds(user.lockedUntil) : 0;
    if (lockedFor > 0) {
      throw accountLockedError(lockedFor);
    }

    if (!user || !passwordMatches) {
      if (user) {
        await this.recordLoginFailure(user.id);
      }

      await this.audit.record({
        event: AUTH_AUDIT.AUTHN_LOGIN,
        outcome: AuditOutcome.FAILURE,
        actorId: user?.id,
        subjectId: user?.id,
        targetType: user ? AUDIT_TARGET.USER : undefined,
        targetId: user?.id,
      });

      throw invalidCredentialsError();
    }

    const reactivated = user.deletedAt !== null;
    const now = new Date();

    const signedIn = await this.prisma.user.updateMany({
      where: {
        id: user.id,
        anonymizedAt: null,
        OR: [{ lockedUntil: null }, { lockedUntil: { lte: now } }],
      },
      data: {
        lastLoginAt: now,
        deletedAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    });

    if (signedIn.count === 0) {
      const current = await this.prisma.user.findUnique({
        where: { id: user.id },
        select: { lockedUntil: true },
      });
      const nowLockedFor = remainingLockSeconds(current?.lockedUntil ?? null);
      throw nowLockedFor > 0
        ? accountLockedError(nowLockedFor)
        : invalidCredentialsError();
    }

    const tokens = await this.issueTokens(user);

    await this.audit.record({
      event: AUTH_AUDIT.AUTHN_LOGIN,
      actorId: user.id,
      subjectId: user.id,
      targetType: AUDIT_TARGET.USER,
      targetId: user.id,
    });

    if (reactivated) {
      await this.audit.record({
        event: AUTH_AUDIT.USER_REACTIVATED,
        actorId: user.id,
        subjectId: user.id,
        targetType: AUDIT_TARGET.USER,
        targetId: user.id,
      });
    }

    return reactivated ? { ...tokens, reactivated: true } : tokens;
  }

  async refresh(refreshToken: string): Promise<TokenPairResponseInput> {
    const rotated = await this.sessions.rotate(refreshToken);

    return {
      accessToken: await this.signAccessToken(rotated.user, rotated.sessionId),
      refreshToken: rotated.token,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    const revoked = await this.sessions.revokeByToken(refreshToken);
    if (!revoked) return;

    await this.audit.record({
      event: AUTH_AUDIT.AUTHN_LOGOUT,
      actorId: revoked.userId,
      subjectId: revoked.userId,
      targetType: AUDIT_TARGET.SESSION,
      targetId: revoked.id,
    });
  }

  private async recordLoginFailure(userId: string): Promise<void> {
    const now = new Date();

    await this.prisma.$transaction(async (tx) => {
      const previous = await tx.user.update({
        where: { id: userId },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true, lastFailedLoginAt: true },
      });

      const forgotten = failureHistoryForgotten(
        previous.lastFailedLoginAt,
        now,
      );
      const failedLoginCount = forgotten ? 1 : previous.failedLoginCount;

      const excess = failedLoginCount - LOGIN_FAILURE_THRESHOLD;
      const backoffMs =
        excess > 0
          ? Math.min(
              LOGIN_BACKOFF_BASE_MS * 2 ** (excess - 1),
              LOGIN_BACKOFF_MAX_MS,
            )
          : 0;

      await tx.user.update({
        where: { id: userId },
        data: {
          failedLoginCount,
          lastFailedLoginAt: now,
          ...(backoffMs > 0
            ? { lockedUntil: new Date(now.getTime() + backoffMs) }
            : {}),
        },
      });

      if (backoffMs === 0) return;

      await this.audit.record(
        {
          event: AUTH_AUDIT.AUTHN_LOGIN_LOCK,
          outcome: AuditOutcome.FAILURE,
          actorId: userId,
          subjectId: userId,
          targetType: AUDIT_TARGET.USER,
          targetId: userId,
          metadata: { reason: 'maxretries', backoffMs },
        },
        tx,
      );
    });
  }

  private async issueTokens(
    user: TokenSubject,
  ): Promise<TokenPairResponseInput> {
    const issued = await this.sessions.issue(user.id);

    return {
      accessToken: await this.signAccessToken(user, issued.sessionId),
      refreshToken: issued.token,
    };
  }

  private signAccessToken(
    user: TokenSubject,
    sessionId: string,
  ): Promise<string> {
    return this.jwt.signAsync(
      { sub: user.id, role: user.role, sid: sessionId },
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        expiresIn: this.config.get('JWT_ACCESS_TTL', { infer: true }),
      },
    );
  }
}

function failureHistoryForgotten(
  lastFailedLoginAt: Date | null,
  now: Date,
): boolean {
  if (!lastFailedLoginAt) return true;
  return now.getTime() - lastFailedLoginAt.getTime() > LOGIN_FAILURE_DECAY_MS;
}

function remainingLockSeconds(lockedUntil: Date | null): number {
  if (!lockedUntil) return 0;

  const remainingMs = lockedUntil.getTime() - Date.now();
  return remainingMs > 0 ? Math.ceil(remainingMs / MS_PER_SECOND) : 0;
}

function accountLockedError(retryAfterSeconds: number): TooManyRequestsError {
  return new TooManyRequestsError(
    AUTH_ERROR.ACCOUNT_TEMPORARILY_LOCKED,
    'Too many failed login attempts',
    retryAfterSeconds,
  );
}

function invalidCredentialsError(): UnauthorizedError {
  return new UnauthorizedError(
    AUTH_ERROR.INVALID_CREDENTIALS,
    'Invalid email or password',
  );
}
