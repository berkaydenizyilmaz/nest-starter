import type { ImageFit } from '../../core/storage/storage.types.js';
import type {
  Role,
  StoredFileVisibility,
} from '../../generated/prisma/client.js';

export type FileOwnership = 'personal' | 'shared';

export interface FilePurpose {
  name: string;
  visibility: StoredFileVisibility;
  ownership: FileOwnership;
  roles?: readonly Role[];
  contentTypes: readonly string[];
  maxBytes: number;
  image?: {
    fit: ImageFit;
    maxEdge?: number;
    variants?: Readonly<
      Record<string, readonly [width: number, height: number]>
    >;
  };
}

export function defineFilePurpose(purpose: FilePurpose): FilePurpose {
  return purpose;
}
