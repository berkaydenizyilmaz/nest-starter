import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import {
  ConflictError,
  UnauthorizedError,
} from '../../../common/domain.error.js';
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
import { AUTH_AUDIT, AUTH_ERROR } from '../auth.constants.js';
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

    if (!user || !passwordMatches) {
      await this.audit.record({
        event: AUTH_AUDIT.LOGIN,
        outcome: AuditOutcome.FAILURE,
        actorId: user?.id,
        targetType: user ? AUDIT_TARGET.USER : undefined,
        targetId: user?.id,
        // Without a matching user there is no id; the attempted address is the only trail.
        metadata: user ? undefined : { email: input.email },
      });

      throw new UnauthorizedError(
        AUTH_ERROR.INVALID_CREDENTIALS,
        'Invalid email or password',
      );
    }

    const reactivated = user.deletedAt !== null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), deletedAt: null },
    });

    const tokens = await this.issueTokens(user);

    await this.audit.record({
      event: AUTH_AUDIT.LOGIN,
      actorId: user.id,
      targetType: AUDIT_TARGET.USER,
      targetId: user.id,
    });

    if (reactivated) {
      await this.audit.record({
        event: AUTH_AUDIT.USER_REACTIVATED,
        actorId: user.id,
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
      event: AUTH_AUDIT.LOGOUT,
      actorId: revoked.userId,
      targetType: AUDIT_TARGET.SESSION,
      targetId: revoked.id,
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
