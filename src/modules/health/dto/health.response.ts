import { z } from 'zod';

export const livenessSchema = z
  .object({
    status: z.literal('ok'),
    uptime: z.number().int(),
  })
  .meta({ id: 'Liveness' });

export const readinessSchema = z
  .object({
    status: z.enum(['ready', 'not_ready']),
    checks: z.object({
      database: z.enum(['up', 'down']),
    }),
  })
  .meta({ id: 'Readiness' });

export type LivenessInput = z.input<typeof livenessSchema>;
export type ReadinessInput = z.input<typeof readinessSchema>;
