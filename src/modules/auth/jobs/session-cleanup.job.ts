import { z } from 'zod';
import { APP_TIMEZONE } from '../../../common/constants/time.constants.js';
import { defineJob } from '../../../core/queue/job.definition.js';
import { AUTH_JOB } from '../auth.constants.js';

export const sessionCleanupJob = defineJob({
  name: AUTH_JOB.AUTH_SESSION_CLEANUP,
  payload: z.object({}).strict(),
  schedule: { cron: '0 3 * * *', timeZone: APP_TIMEZONE },
});
