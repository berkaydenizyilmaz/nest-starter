import { z } from 'zod';
import { APP_TIMEZONE } from '../../../common/constants/time.constants.js';
import { defineJob } from '../../../core/queue/job.definition.js';
import { USER_JOB } from '../user.constants.js';

export const userAnonymizationJob = defineJob({
  name: USER_JOB.USER_ANONYMIZATION,
  payload: z.object({}).strict(),
  schedule: { cron: '0 5 * * *', timeZone: APP_TIMEZONE },
});
