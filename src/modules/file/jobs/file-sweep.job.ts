import { z } from 'zod';
import { APP_TIMEZONE } from '../../../common/constants/time.constants.js';
import { defineJob } from '../../../core/queue/job.definition.js';
import { FILE_JOB } from '../file.constants.js';

export const fileSweepJob = defineJob({
  name: FILE_JOB.FILE_SWEEP,
  payload: z.object({}).strict(),
  schedule: { cron: '0 2 * * *', timeZone: APP_TIMEZONE },
});
