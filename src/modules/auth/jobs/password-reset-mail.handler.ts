import { Injectable } from '@nestjs/common';
import { HandlesJob } from '../../../core/queue/handles-job.decorator.js';
import type {
  JobHandler,
  JobPayload,
} from '../../../core/queue/job.definition.js';
import { PasswordService } from '../services/password.service.js';
import { passwordResetMailJob } from './password-reset-mail.job.js';

@HandlesJob(passwordResetMailJob)
@Injectable()
export class PasswordResetMailHandler implements JobHandler<
  JobPayload<typeof passwordResetMailJob>
> {
  constructor(private readonly passwords: PasswordService) {}

  handle({ userId }: JobPayload<typeof passwordResetMailJob>): Promise<void> {
    return this.passwords.sendResetMail(userId);
  }
}
