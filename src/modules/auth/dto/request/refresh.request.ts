import { z } from 'zod';

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1),
  })
  .strict()
  .meta({ id: 'RefreshRequest' });

export type RefreshDto = z.infer<typeof refreshSchema>;
