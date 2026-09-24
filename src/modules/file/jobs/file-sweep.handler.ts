import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { FileCleanupService } from '../services/file-cleanup.service.js';
import { fileSweepJob } from './file-sweep.job.js';

@HandlesJob(fileSweepJob)
@Injectable()
export class FileSweepHandler implements JobHandler<
  JobPayload<typeof fileSweepJob>
> {
  constructor(
    private readonly fileCleanup: FileCleanupService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileSweepHandler.name);
  }

  async handle(): Promise<void> {
    const { removed, skipped } = await this.fileCleanup.removeUnused();
    this.logger.info({ removed, skipped }, 'Unused files removed');
  }
}
