import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
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
import { QueueService } from '../../../core/queue/queue.service.js';
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
import { passwordResetMailJob } from '../jobs/password-reset-mail.job.js';
import { passwordResetMail } from '../mails/password-reset.mail.js';
import {
  createOpaqueToken,
  hashOpaqueToken,
} from '../../../core/opaque-token.util.js';
import { SessionService } from './session.service.js';

@Injectable()
export class PasswordService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly queue: QueueService,
  ) {}

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
      select: { id: true },
    });

    if (!user || (await this.hasRecentResetToken(user.id))) return;

    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(
        {
          event: AUTH_AUDIT.AUTHN_PASSWORD_RESET_REQUEST,
          subjectId: user.id,
          targetType: AUDIT_TARGET.USER,
          targetId: user.id,
        },
        tx,
      );
      await this.queue.send(passwordResetMailJob, { userId: user.id }, tx);
    });
  }

  async sendResetMail(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, anonymizedAt: null },
      select: { email: true },
    });

    if (!user || (await this.hasRecentResetToken(userId))) return;

    const token = createOpaqueToken(PASSWORD_RESET_TOKEN_BYTES);

    const stored = await this.prisma.$transaction(async (tx) => {
      await tx.passwordResetToken.deleteMany({ where: { userId } });
      return tx.passwordResetToken.create({
        data: {
          userId,
          tokenHash: hashOpaqueToken(token),
          expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
        },
        select: { id: true },
      });
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
      await this.prisma.passwordResetToken.deleteMany({
        where: { id: stored.id },
      });
      throw error;
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

  private async hasRecentResetToken(userId: string): Promise<boolean> {
    const latest = await this.prisma.passwordResetToken.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    });

    return (
      latest !== null &&
      Date.now() - latest.createdAt.getTime() < PASSWORD_RESET_COOLDOWN_MS
    );
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
