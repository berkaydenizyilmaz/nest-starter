import { z } from 'zod';

export const livenessResponseSchema = z
  .object({
    status: z.literal('ok'),
    uptime: z.number().int(),
  })
  .meta({ id: 'Liveness' });

export const readinessResponseSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z.object({
      database: z.enum(['up', 'down']),
    }),
  })
  .meta({ id: 'Readiness' });

export type LivenessResponseInput = z.input<typeof livenessResponseSchema>;
export type ReadinessResponseInput = z.input<typeof readinessResponseSchema>;
