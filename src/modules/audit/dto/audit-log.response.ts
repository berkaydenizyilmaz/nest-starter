import { z } from 'zod';
import { isoDate } from '../../../common/schemas/iso-date.schema.js';
import { offsetPageSchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const auditLogSchema = z
  .object({
    id: z.string(),
    event: z.string(),
    outcome: z.enum(AuditOutcome),
    actorId: z.string().nullable(),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    metadata: z.unknown().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    requestId: z.string().nullable(),
    createdAt: isoDate(),
  })
  .meta({ id: 'AuditLog' });

export const auditLogPageSchema = offsetPageSchema(auditLogSchema).meta({
  id: 'AuditLogPage',
});

export type AuditLogPageInput = z.input<typeof auditLogPageSchema>;
