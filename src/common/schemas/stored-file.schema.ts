import { z } from 'zod';

export const storedFileResponseSchema = z
  .object({
    id: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    url: z.string().nullable(),
    variants: z.record(z.string(), z.string()),
  })
  .meta({ id: 'StoredFile' });

export type StoredFileResponseInput = z.input<typeof storedFileResponseSchema>;
