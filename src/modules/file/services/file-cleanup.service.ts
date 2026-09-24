import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../../config/env.schema.js';
import type { ObjectStorage } from '../../../core/storage/object-storage.port.js';
import { OBJECT_STORAGE } from '../../../core/storage/storage.constants.js';
import type { JobPayload } from '../../../core/queue/job.definition.js';
import { bucketFor, incomingKey, objectPrefix } from '../file-location.util.js';
import type { fileObjectDeleteJob } from '../jobs/file-object-delete.job.js';

@Injectable()
export class FileCleanupService {
  constructor(
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly config: ConfigService<Env, true>,
  ) {}

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
}
