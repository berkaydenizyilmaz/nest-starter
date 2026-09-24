import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { PinoLogger } from 'nestjs-pino';
import type { AuthUser } from '../../../common/auth-user.type.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { MS_PER_MINUTE } from '../../../common/constants/time.constants.js';
import {
  UnauthorizedError,
  ValidationError,
} from '../../../common/domain.error.js';
import type { Env } from '../../../config/env.schema.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { MailService } from '../../../core/mail/mail.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';
import {
  AUTH_AUDIT,
  AUTH_ERROR,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_PATH,
  PASSWORD_RESET_TOKEN_BYTES,
  PASSWORD_RESET_TTL_MS,
} from '../auth.constants.js';
import type { ChangePasswordRequest } from '../dto/request/change-password.request.js';
import type { ResetPasswordRequest } from '../dto/request/reset-password.request.js';
import { passwordResetMail } from '../mails/password-reset.mail.js';
import { createOpaqueToken, hashOpaqueToken } from '../opaque-token.util.js';
import { SessionService } from './session.service.js';

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PasswordService.name);
  }

  async change(user: AuthUser, input: ChangePasswordRequest): Promise<void> {
    const account = await this.prisma.user.findFirst({
      where: { id: user.id, deletedAt: null },
      select: { passwordHash: true },
    });

    if (!account) {
      throw accountDeletedError();
    }

    const passwordMatches = await argon2.verify(
      account.passwordHash,
      input.currentPassword,
    );

    if (!passwordMatches) {
      await this.audit.record({
        event: AUTH_AUDIT.AUTHN_PASSWORD_CHANGE,
        outcome: AuditOutcome.FAILURE,
        subjectId: user.id,
        targetType: AUDIT_TARGET.USER,
        targetId: user.id,
      });

      throw new ValidationError(
        AUTH_ERROR.INVALID_CURRENT_PASSWORD,
        'Current password is incorrect',
        [
          {
            field: 'currentPassword',
            code: AUTH_ERROR.INVALID_CURRENT_PASSWORD,
            message: 'Current password is incorrect',
          },
        ],
      );
    }

    const passwordHash = await argon2.hash(input.newPassword);

    await this.prisma.$transaction(async (tx) => {
      const changed = await tx.user.updateMany({
        where: { id: user.id, deletedAt: null },
        data: { passwordHash },
      });

      if (changed.count === 0) {
        throw accountDeletedError();
      }

      await this.sessions.revokeOthers(
        { userId: user.id, keepSessionId: user.sessionId },
        tx,
      );

      await this.audit.record(
        {
          event: AUTH_AUDIT.AUTHN_PASSWORD_CHANGE,
          subjectId: user.id,
          targetType: AUDIT_TARGET.USER,
          targetId: user.id,
        },
        tx,
      );
    });
  }

  async requestReset(email: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { email, anonymizedAt: null },
      select: {
        id: true,
        email: true,
        passwordResetTokens: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { createdAt: true },
        },
      },
    });

    if (!user) return;

    const [latest] = user.passwordResetTokens;
    if (
      latest &&
      Date.now() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_MS
    ) {
      return;
    }

    const token = createOpaqueToken(PASSWORD_RESET_TOKEN_BYTES);

    await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId: user.id } });
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
      });

      await this.audit.record(
        {
          event: AUTH_AUDIT.AUTHN_PASSWORD_RESET_REQUEST,
          subjectId: user.id,
          targetType: AUDIT_TARGET.USER,
          targetId: user.id,
        },
        tx,
      );
    });

    const resetUrl = new URL(
      PASSWORD_RESET_PATH,
      this.config.get('APP_URL', { infer: true }),
    );
    resetUrl.searchParams.set('token', token);

    try {
      await this.mail.send({
        to: user.email,
        ...passwordResetMail({
          resetUrl: resetUrl.toString(),
          expiresInMinutes: PASSWORD_RESET_TTL_MS / MS_PER_MINUTE,
        }),
      });
    } catch (error) {
      this.logger.error({ err: error }, 'Password reset mail was not sent');
    }
  }

  async reset(input: ResetPasswordRequest): Promise<void> {
    const stored = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashOpaqueToken(input.token) },
      include: { user: { select: { anonymizedAt: true } } },
    });

    if (!stored || stored.usedAt || stored.user.anonymizedAt) {
      throw invalidResetTokenError();
    }

    if (stored.expiresAt <= new Date()) {
      throw new ValidationError(
        AUTH_ERROR.RESET_TOKEN_EXPIRED,
        'Reset token has expired',
        [
          {
            field: 'token',
            code: AUTH_ERROR.RESET_TOKEN_EXPIRED,
            message: 'Reset token has expired',
          },
        ],
      );
    }

    const passwordHash = await argon2.hash(input.newPassword);

    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({
        where: { id: stored.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      if (claimed.count === 0) {
        throw invalidResetTokenError();
      }

      const changed = await tx.user.updateMany({
        where: { id: stored.userId, anonymizedAt: null },
        data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
      });

      if (changed.count === 0) {
        throw invalidResetTokenError();
      }

      await tx.passwordResetToken.deleteMany({
        where: { userId: stored.userId, id: { not: stored.id } },
      });
      await this.sessions.revokeAll(stored.userId, tx);

      await this.audit.record(
        {
          event: AUTH_AUDIT.AUTHN_PASSWORD_RESET,
          actorId: stored.userId,
          subjectId: stored.userId,
          targetType: AUDIT_TARGET.USER,
          targetId: stored.userId,
        },
        tx,
      );
    });
  }
}

function invalidResetTokenError(): ValidationError {
  return new ValidationError(
    AUTH_ERROR.INVALID_RESET_TOKEN,
    'Reset token is invalid',
    [
      {
        field: 'token',
        code: AUTH_ERROR.INVALID_RESET_TOKEN,
        message: 'Reset token is invalid',
      },
    ],
  );
}

function accountDeletedError(): UnauthorizedError {
  return new UnauthorizedError(
    AUTH_ERROR.ACCOUNT_DELETED,
    'Account is no longer active',
  );
}
