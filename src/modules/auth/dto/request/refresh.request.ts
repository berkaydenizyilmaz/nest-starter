import { z } from 'zod';

export const refreshRequestSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict()
  .meta({ id: 'RefreshRequest' });

export type RefreshRequest = z.infer<typeof refreshRequestSchema>;
