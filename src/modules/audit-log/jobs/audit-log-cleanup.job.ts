import { z } from 'zod';
import { APP_TIMEZONE } from '../../../common/constants/time.constants.js';
import { defineJob } from '../../../core/queue/job.definition.js';
import { AUDIT_LOG_JOB } from '../audit-log.constants.js';

export const auditLogCleanupJob = defineJob({
  name: AUDIT_LOG_JOB.AUDIT_LOG_CLEANUP,
  payload: z.object({}).strict(),
  schedule: { cron: '0 4 * * *', timeZone: APP_TIMEZONE },
});
