import { z } from 'zod';
import { defineJob } from '../../../core/queue/job.definition.js';
import { AUTH_JOB } from '../auth.constants.js';

export const passwordResetMailJob = defineJob({
  name: AUTH_JOB.AUTH_PASSWORD_RESET_MAIL,
  payload: z.object({ userId: z.uuid() }).strict(),
  options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
});
