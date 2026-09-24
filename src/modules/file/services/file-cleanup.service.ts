import {
  Inject,
  Injectable,
  type OnApplicationBootstrap,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../../config/env.schema.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import type { JobPayload } from '../../../core/queue/job.definition.js';
import { QueueService } from '../../../core/queue/queue.service.js';
import type { ObjectStorage } from '../../../core/storage/object-storage.port.js';
import { OBJECT_STORAGE } from '../../../core/storage/storage.constants.js';
import {
  StoredFileStatus,
  type StoredFileVisibility,
} from '../../../generated/prisma/client.js';
import {
  FILE_PENDING_TTL_MS,
  FILE_SWEEP_BATCH_SIZE,
  FILE_UNUSED_GRACE_MS,
} from '../file.constants.js';
import { bucketFor, incomingKey, objectPrefix } from '../file-location.util.js';
import { fileObjectDeleteJob } from '../jobs/file-object-delete.job.js';

interface FileReference {
  clause: string;
  reference: string;
  onDelete: string;
}

interface SweepCandidate {
  id: string;
  purpose: string;
  visibility: StoredFileVisibility;
}

const SAFE_ON_DELETE_ACTIONS = new Set(['r', 'a']);

const FILE_REFERENCES_SQL = `
  SELECT
    format('NOT EXISTS (SELECT 1 FROM %I.%I r WHERE r.%I = f.id)', ns.nspname, cl.relname, att.attname) AS "clause",
    format('%I.%I.%I', ns.nspname, cl.relname, att.attname) AS "reference",
    con.confdeltype::text AS "onDelete"
  FROM pg_constraint con
  JOIN pg_class cl ON cl.oid = con.conrelid
  JOIN pg_namespace ns ON ns.oid = cl.relnamespace
  JOIN pg_attribute att ON att.attrelid = con.conrelid AND att.attnum = con.conkey[1]
  WHERE con.contype = 'f'
    AND con.confrelid = to_regclass('"StoredFile"')
    AND cardinality(con.conkey) = 1`;

@Injectable()
export class FileCleanupService implements OnApplicationBootstrap {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly queue: QueueService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileCleanupService.name);
  }

  async onApplicationBootstrap(): Promise<void> {
    await this.fileReferences();
  }

  async removeUnused(): Promise<{ removed: number; skipped: number }> {
    const removable = await this.removableCondition();
    const now = Date.now();
    const pendingBefore = new Date(now - FILE_PENDING_TTL_MS).toISOString();
    const unusedBefore = new Date(now - FILE_UNUSED_GRACE_MS).toISOString();

    const candidates = await this.prisma.$queryRawUnsafe<SweepCandidate[]>(
      `SELECT f.id, f.purpose, f.visibility::text AS "visibility"
       FROM "StoredFile" f
       WHERE ${removable}
       ORDER BY f."createdAt"
       LIMIT $3`,
      pendingBefore,
      unusedBefore,
      FILE_SWEEP_BATCH_SIZE,
    );

    let removed = 0;
    let skipped = 0;

    for (const file of candidates) {
      try {
        const deleted = await this.prisma.$transaction(async (tx) => {
          const count = await tx.$executeRawUnsafe(
            `DELETE FROM "StoredFile" f WHERE f.id = $3 AND (${removable})`,
            pendingBefore,
            unusedBefore,
            file.id,
          );

          if (count === 0) return false;

          await this.queue.send(
            fileObjectDeleteJob,
            {
              fileId: file.id,
              purpose: file.purpose,
              visibility: file.visibility,
              scope: 'all',
            },
            tx,
          );
          return true;
        });

        if (deleted) {
          removed++;
        } else {
          skipped++;
        }
      } catch (error) {
        skipped++;
        this.logger.warn(
          { err: error, fileId: file.id },
          'Unused file could not be removed',
        );
      }
    }

    return { removed, skipped };
  }

  async deleteObjects({
    fileId,
    purpose,
    visibility,
    scope,
  }: JobPayload<typeof fileObjectDeleteJob>): Promise<void> {
    await this.storage.deleteMany(
      this.config.get('STORAGE_PRIVATE_BUCKET', { infer: true }),
      [incomingKey(fileId)],
    );

    if (scope === 'all') {
      await this.storage.deletePrefix(
        bucketFor(this.config, visibility),
        objectPrefix(purpose, fileId),
      );
    }
  }

  private async removableCondition(): Promise<string> {
    const references = await this.fileReferences();
    const unreferenced =
      references.map(({ clause }) => clause).join(' AND ') || 'TRUE';

    return `(f.status = '${StoredFileStatus.PENDING}' AND f."createdAt" < $1::timestamp(3))
      OR (f.status = '${StoredFileStatus.READY}' AND f."readyAt" < $2::timestamp(3) AND ${unreferenced})`;
  }

  private async fileReferences(): Promise<FileReference[]> {
    const references =
      await this.prisma.$queryRawUnsafe<FileReference[]>(FILE_REFERENCES_SQL);

    const unsafe = references.filter(
      ({ onDelete }) => !SAFE_ON_DELETE_ACTIONS.has(onDelete),
    );
    if (unsafe.length > 0) {
      throw new Error(
        `Foreign keys to StoredFile must use onDelete: Restrict: ${unsafe
          .map(({ reference }) => reference)
          .join(', ')}`,
      );
    }

    return references;
  }
}
