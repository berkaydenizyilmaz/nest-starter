import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../common/domain.error.js';
import { PrismaService } from '../../core/prisma/prisma.service.js';
import type { User } from '../../generated/prisma/client.js';
import { SessionService } from '../auth/services/session.service.js';
import { USER_ERROR } from './user.constants.js';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
  ) {}

  async findById(userId: string): Promise<User> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw new NotFoundError(USER_ERROR.NOT_FOUND, 'User not found');
    }

    return user;
  }

  async deleteAccount(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (deleted.count === 0) {
        throw new NotFoundError(USER_ERROR.NOT_FOUND, 'User not found');
      }

      await this.sessions.revokeAll(userId, tx);
    });
  }
}
