import { z } from 'zod';
import { offsetQuerySchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const auditLogQuerySchema = offsetQuerySchema
  .extend({
    event: z.string().min(1).optional(),
    outcome: z.enum(AuditOutcome).optional(),
    actorId: z.uuid().optional(),
    targetType: z.string().min(1).optional(),
    targetId: z.string().min(1).optional(),
    from: z.iso.datetime().optional(),
    to: z.iso.datetime().optional(),
  })
  .strict()
  .meta({ id: 'AuditLogQuery' });

export type AuditLogQueryDto = z.infer<typeof auditLogQuerySchema>;
