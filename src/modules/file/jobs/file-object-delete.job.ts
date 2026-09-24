import { z } from 'zod';
import { defineJob } from '../../../core/queue/job.definition.js';
import { StoredFileVisibility } from '../../../generated/prisma/client.js';
import { FILE_JOB } from '../file.constants.js';

export const fileObjectDeleteJob = defineJob({
  name: FILE_JOB.FILE_OBJECT_DELETE,
  payload: z
    .object({
      fileId: z.uuid(),
      purpose: z.string().min(1),
      visibility: z.enum(StoredFileVisibility),
      scope: z.enum(['incoming', 'all']),
    })
    .strict(),
  options: { retryLimit: 5, retryDelay: 30, retryBackoff: true },
});
