import { z } from 'zod';
import { isoDate } from '../../../common/schemas/iso-date.schema.js';
import { cursorPageResponseSchema } from '../../../common/schemas/pagination.schema.js';
import { AuditOutcome } from '../../../generated/prisma/client.js';

export const securityLogEntryResponseSchema = z
  .object({
    id: z.string(),
    event: z.string(),
    outcome: z.enum(AuditOutcome),
    targetType: z.string().nullable(),
    targetId: z.string().nullable(),
    ip: z.string().nullable(),
    userAgent: z.string().nullable(),
    createdAt: isoDate(),
  })
  .meta({ id: 'SecurityLogEntry' });

export const securityLogPageResponseSchema = cursorPageResponseSchema(
  securityLogEntryResponseSchema,
).meta({
  id: 'SecurityLogPage',
});

export type SecurityLogPageResponseInput = z.input<
  typeof securityLogPageResponseSchema
>;
