import { z } from 'zod';

export const tokenPairResponseSchema = z
  .object({
    accessToken: z.string(),
    accessTokenExpiresIn: z.number().int(),
    refreshToken: z.string(),
    refreshTokenExpiresIn: z.number().int(),
  })
  .meta({ id: 'TokenPair' });

export type TokenPairResponseInput = z.input<typeof tokenPairResponseSchema>;
