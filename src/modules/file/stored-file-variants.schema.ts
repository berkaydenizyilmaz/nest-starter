import { z } from 'zod';

export const storedFileVariantsSchema = z.array(
  z.object({
    name: z.string(),
    key: z.string(),
    width: z.number().int(),
    height: z.number().int(),
    size: z.number().int(),
  }),
);

export type StoredFileVariants = z.infer<typeof storedFileVariantsSchema>;
