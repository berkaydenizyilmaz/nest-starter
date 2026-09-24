import { Injectable } from '@nestjs/common';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { FileCleanupService } from '../services/file-cleanup.service.js';
import { fileObjectDeleteJob } from './file-object-delete.job.js';

@HandlesJob(fileObjectDeleteJob)
@Injectable()
export class FileObjectDeleteHandler implements JobHandler<
  JobPayload<typeof fileObjectDeleteJob>
> {
  constructor(private readonly fileCleanup: FileCleanupService) {}

  handle(payload: JobPayload<typeof fileObjectDeleteJob>): Promise<void> {
    return this.fileCleanup.deleteObjects(payload);
  }
}
