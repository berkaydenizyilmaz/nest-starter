import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { createOpaqueToken, hashOpaqueToken } from '../opaque-token.util.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type {
  ConsumeOneTimeTokenInput,
  ConsumeOneTimeTokenResult,
  IssueOneTimeTokenInput,
  IssueOneTimeTokenResult,
  OneTimeTokenRef,
} from './one-time-token.types.js';

const ONE_TIME_TOKEN_BYTES = 32;

@Injectable()
export class OneTimeTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(
    { userId, purpose, ttlMs, cooldownMs }: IssueOneTimeTokenInput,
    client: Prisma.TransactionClient = this.prisma,
  ): Promise<IssueOneTimeTokenResult> {
    const token = createOpaqueToken(ONE_TIME_TOKEN_BYTES);
    const now = Date.now();
    const issued = {
      tokenHash: hashOpaqueToken(token),
      expiresAt: new Date(now + ttlMs),
      usedAt: null,
      issuedAt: new Date(now),
    };

    const replaced = await client.oneTimeToken.updateMany({
      where: { userId, purpose, issuedAt: { lte: new Date(now - cooldownMs) } },
      data: issued,
    });

    if (replaced.count > 0) {
      return { status: 'issued', token };
    }

    const created = await client.oneTimeToken.createMany({
      data: { userId, purpose, ...issued },
      skipDuplicates: true,
    });

    return created.count > 0
      ? { status: 'issued', token }
      : { status: 'cooling_down' };
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
