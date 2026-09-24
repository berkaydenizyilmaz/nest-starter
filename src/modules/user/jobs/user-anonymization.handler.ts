import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { UserAnonymizationService } from '../services/user-anonymization.service.js';
import { userAnonymizationJob } from './user-anonymization.job.js';

@HandlesJob(userAnonymizationJob)
@Injectable()
export class UserAnonymizationHandler implements JobHandler<
  JobPayload<typeof userAnonymizationJob>
> {
  constructor(
    private readonly userAnonymization: UserAnonymizationService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(UserAnonymizationHandler.name);
  }

  async handle(): Promise<void> {
    const { processed, total } = await this.userAnonymization.anonymizeDue();
    this.logger.info({ processed, total }, 'Deleted users anonymized');
  }
}
