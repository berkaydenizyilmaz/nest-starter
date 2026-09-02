import { Injectable } from '@nestjs/common';
import { NotFoundError } from '../../../common/domain.error.js';
import { unusablePasswordHash } from '../../../common/utils/password.util.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { Prisma, User } from '../../../generated/prisma/client.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { USER_AUDIT, USER_ERROR } from '../user.constants.js';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
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

  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (deleted.count === 0) {
        throw new NotFoundError(USER_ERROR.NOT_FOUND, 'User not found');
      }

      await this.audit.record(
        {
          event: USER_AUDIT.USER_DELETED,
          targetType: AUDIT_TARGET.USER,
          targetId: userId,
        },
        tx,
      );

      await this.sessions.revokeAll(userId, tx);
    });
  }

  async anonymize(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.user.update({
      where: { id: userId },
      data: {
        email: `anonymized-${userId}@invalid`,
        passwordHash: await unusablePasswordHash(),
        anonymizedAt: new Date(),
      },
    });
  }
}
