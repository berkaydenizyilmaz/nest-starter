import { z } from 'zod';

export const tokenPairResponseSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .meta({ id: 'TokenPair' });

export type TokenPairResponseInput = z.input<typeof tokenPairResponseSchema>;
