import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../../../common/auth-user.type.js';
import { NotFoundError } from '../../../common/domain.error.js';
import { unusablePasswordHash } from '../../../common/utils/password.util.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { AUDIT_TARGET } from '../../../common/constants/audit.constants.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { SessionService } from '../../auth/services/session.service.js';
import { FILE_ERROR } from '../../file/file.constants.js';
import { FileService } from '../../file/services/file.service.js';
import {
  USER_AUDIT,
  USER_ERROR,
  USER_FILE_PURPOSE,
} from '../user.constants.js';
import type { UserProfile } from '../user.types.js';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly files: FileService,
  ) {}

  async findById(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
    });

    if (!user) {
      throw userNotFoundError();
    }

    const avatar = user.avatarFileId
      ? ((await this.files.resolveMany([user.avatarFileId])).get(
          user.avatarFileId,
        ) ?? null)
      : null;

    return { ...user, avatar };
  }

  async updateAvatar({
    actor,
    fileId,
  }: {
    actor: AuthUser;
    fileId: string;
  }): Promise<void> {
    try {
      await this.prisma.$transaction(async (tx) => {
        await this.files.assertAttachable(
          { fileId, purpose: USER_FILE_PURPOSE.USER_AVATAR, actor },
          tx,
        );

        const updated = await tx.user.updateMany({
          where: { id: actor.id, deletedAt: null },
          data: { avatarFileId: fileId },
        });

        if (updated.count === 0) {
          throw userNotFoundError();
        }
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2003'
      ) {
        throw new NotFoundError(FILE_ERROR.FILE_NOT_FOUND, 'File not found');
      }
      throw error;
    }
  }

  async removeAvatar(userId: string): Promise<void> {
    const updated = await this.prisma.user.updateMany({
      where: { id: userId, deletedAt: null },
      data: { avatarFileId: null },
    });

    if (updated.count === 0) {
      throw userNotFoundError();
    }
  }

  async remove(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const deleted = await tx.user.updateMany({
        where: { id: userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });

      if (deleted.count === 0) {
        throw userNotFoundError();
      }

      await this.audit.record(
        {
          event: USER_AUDIT.USER_DELETED,
          subjectId: userId,
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
    deletedBefore: Date,
    client: Prisma.TransactionClient,
  ): Promise<boolean> {
    const anonymized = await client.user.updateMany({
      where: {
        id: userId,
        deletedAt: { lt: deletedBefore },
        anonymizedAt: null,
      },
      data: {
        email: `anonymized-${userId}@invalid`,
        passwordHash: await unusablePasswordHash(),
        avatarFileId: null,
        anonymizedAt: new Date(),
      },
    });

    return anonymized.count > 0;
  }
}

function userNotFoundError(): NotFoundError {
  return new NotFoundError(USER_ERROR.USER_NOT_FOUND, 'User not found');
}
