import { z } from 'zod';
import { offsetPageRequestSchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const listAuditLogsRequestSchema = offsetPageRequestSchema
  .extend({
    event: z.string().min(1).optional(),
    outcome: z.enum(AuditOutcome).optional(),
    actorId: z.uuid().optional(),
    targetType: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict();

export type ListAuditLogsRequest = z.infer<typeof listAuditLogsRequestSchema>;
