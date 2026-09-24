import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { createOpaqueToken, hashOpaqueToken } from '../opaque-token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ConsumeOneTimeTokenInput,
  ConsumeOneTimeTokenResult,
  IssueOneTimeTokenInput,
  OneTimeTokenRef,
} from './one-time-token.types.js';

const ONE_TIME_TOKEN_BYTES = 32;

@Injectable()
export class OneTimeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    { userId, purpose, ttlMs }: IssueOneTimeTokenInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<string> {
    const token = createOpaqueToken(ONE_TIME_TOKEN_BYTES);
    const issued = {
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(Date.now() + ttlMs),
      usedAt: null,
      issuedAt: new Date(),
    };

    await client.oneTimeToken.upsert({
      where: { userId_purpose: { userId, purpose } },
      create: { userId, purpose, ...issued },
      update: issued,
    });

    return token;
  }

  async consume(
    { token, purpose }: ConsumeOneTimeTokenInput,
    client: Prisma.TransactionClient,
  ): Promise<ConsumeOneTimeTokenResult> {
    const stored = await client.oneTimeToken.findUnique({
      where: { tokenHash: hashOpaqueToken(token) },
    });

    if (!stored || stored.purpose !== purpose || stored.usedAt) {
      return { status: 'invalid' };
    }

    if (stored.expiresAt <= new Date()) {
      return { status: 'expired' };
    }

    const claimed = await client.oneTimeToken.updateMany({
      where: { id: stored.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    return claimed.count === 0
      ? { status: 'invalid' }
      : { status: 'valid', userId: stored.userId };
  }

  async issuedWithin(ref: OneTimeTokenRef, windowMs: number): Promise<boolean> {
    const stored = await this.prisma.oneTimeToken.findUnique({
      where: { userId_purpose: ref },
      select: { issuedAt: true },
    });

    return stored !== null && Date.now() - stored.issuedAt.getTime() < windowMs;
  }

  async remove(
    ref: OneTimeTokenRef,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<void> {
    await client.oneTimeToken.deleteMany({ where: ref });
  }
}
