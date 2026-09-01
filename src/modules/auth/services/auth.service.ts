import { randomBytes } from 'node:crypto';
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import argon2 from 'argon2';
import {
  ConflictError,
  UnauthorizedError,
} from '../../../common/domain.error.js';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { Prisma, type User } from '../../../generated/prisma/client.js';
import { AUTH_ERROR } from '../auth.constants.js';
import type { SessionContext, TokenSubject } from '../auth.types.js';
import type { LoginDto } from '../dto/request/login.request.js';
import type { RegisterDto } from '../dto/request/register.request.js';
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
  ) {}

  async onModuleInit(): Promise<void> {
    this.dummyPasswordHash = await argon2.hash(
      randomBytes(32).toString('base64url'),
    );
  }

  async register(
    input: RegisterDto,
    context: SessionContext,
  ): Promise<TokenPairResponseInput> {
    const passwordHash = await argon2.hash(input.password);

    let user: User;
    try {
      user = await this.prisma.user.create({
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

    return this.issueTokens(user, context);
  }

  async login(
    input: LoginDto,
    context: SessionContext,
  ): Promise<LoginResponseInput> {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email },
    });

    const passwordMatches = await argon2.verify(
      user?.passwordHash ?? this.dummyPasswordHash,
      input.password,
    );

    if (!user || !passwordMatches) {
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

    const tokens = await this.issueTokens(user, context);

    return reactivated ? { ...tokens, reactivated: true } : tokens;
  }

  async refresh(
    refreshToken: string,
    context: SessionContext,
  ): Promise<TokenPairResponseInput> {
    const rotated = await this.sessions.rotate(refreshToken, context);

    return {
      accessToken: await this.signAccessToken(rotated.user, rotated.sessionId),
      refreshToken: rotated.token,
    };
  }

  logout(refreshToken: string): Promise<void> {
    return this.sessions.revokeByToken(refreshToken);
  }

  private async issueTokens(
    user: TokenSubject,
    context: SessionContext,
  ): Promise<TokenPairResponseInput> {
    const issued = await this.sessions.issue(user.id, context);

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
