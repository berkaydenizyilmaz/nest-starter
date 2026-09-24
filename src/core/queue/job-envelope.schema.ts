import { z } from 'zod';

export const jobEnvelopeSchema = z.object({
  requestId: z.string().optional(),
  payload: z.unknown(),
});

export type JobEnvelope = z.infer<typeof jobEnvelopeSchema>;
