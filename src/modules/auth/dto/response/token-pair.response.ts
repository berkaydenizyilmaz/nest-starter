import { z } from 'zod';

export const tokenPairSchema = z
  .object({
    accessToken: z.string(),
    refreshToken: z.string(),
  })
  .meta({ id: 'TokenPair' });

export type TokenPairResponseInput = z.input<typeof tokenPairSchema>;
export type TokenPairResponse = z.infer<typeof tokenPairSchema>;
