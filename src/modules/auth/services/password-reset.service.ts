import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import argon2 from 'argon2';
import { PinoLogger } from 'nestjs-pino';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { MS_PER_MINUTE } from '../../../common/constants/time.constants.js';
import { ValidationError } from '../../../common/domain.error.js';
import type { Env } from '../../../config/env.schema.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { MailService } from '../../../core/mail/mail.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import {
  AUTH_AUDIT,
  AUTH_ERROR,
  PASSWORD_RESET_COOLDOWN_MS,
  PASSWORD_RESET_PATH,
  PASSWORD_RESET_TOKEN_BYTES,
  PASSWORD_RESET_TTL_MS,
} from '../auth.constants.js';
import type { ResetPasswordRequest } from '../dto/request/reset-password.request.js';
import { passwordResetMail } from '../mails/password-reset.mail.js';
import { createOpaqueToken, hashOpaqueToken } from '../opaque-token.util.js';
import { SessionService } from './session.service.js';

@Injectable()
export class PasswordResetService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PasswordResetService.name);
  }

  async request(email: string): Promise<void> {
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

  async complete(input: ResetPasswordRequest): Promise<void> {
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
