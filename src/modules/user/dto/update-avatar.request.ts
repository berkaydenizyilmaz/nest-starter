import { z } from 'zod';

export const updateAvatarRequestSchema = z
  .object({
    fileId: z.uuid(),
  })
  .strict()
  .meta({ id: 'UpdateAvatarRequest' });

export type UpdateAvatarRequest = z.infer<typeof updateAvatarRequestSchema>;
