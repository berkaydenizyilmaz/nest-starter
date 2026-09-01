import { z } from 'zod';
import { tokenPairSchema } from './token-pair.response.js';

export const loginResponseSchema = tokenPairSchema
  .extend({ reactivated: z.boolean().optional() })
  .meta({ id: 'LoginResponse' });

export type LoginResponseInput = z.input<typeof loginResponseSchema>;
export type LoginResponse = z.infer<typeof loginResponseSchema>;
