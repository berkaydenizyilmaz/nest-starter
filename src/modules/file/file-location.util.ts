import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { StoredFileVisibility } from '../../generated/prisma/client.js';

export function incomingKey(fileId: string): string {
  return `incoming/${fileId}`;
}

export function objectPrefix(purpose: string, fileId: string): string {
  return `${purpose}/${fileId}/`;
}

export function bucketFor(
  config: ConfigService<Env, true>,
  visibility: StoredFileVisibility,
): string {
  return visibility === StoredFileVisibility.PUBLIC
    ? config.get('STORAGE_PUBLIC_BUCKET', { infer: true })
    : config.get('STORAGE_PRIVATE_BUCKET', { infer: true });
}
