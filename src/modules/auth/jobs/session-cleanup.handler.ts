import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { SessionService } from '../services/session.service.js';
import { sessionCleanupJob } from './session-cleanup.job.js';

@HandlesJob(sessionCleanupJob)
@Injectable()
export class SessionCleanupHandler implements JobHandler<
  JobPayload<typeof sessionCleanupJob>
> {
  constructor(
    private readonly sessions: SessionService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SessionCleanupHandler.name);
  }

  async handle(): Promise<void> {
    const deleted = await this.sessions.removeExpired();
    this.logger.info({ deleted }, 'Expired sessions removed');
  }
}
