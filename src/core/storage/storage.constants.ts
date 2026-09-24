export const OBJECT_STORAGE = Symbol('OBJECT_STORAGE');

export const S3_MAX_ATTEMPTS = 2;
export const S3_CONNECTION_TIMEOUT_MS = 5_000;
export const S3_SOCKET_IDLE_TIMEOUT_MS = 10_000;
export const S3_DELETE_BATCH_SIZE = 1000;

export const CONTENT_SNIFF_BYTES = 4100;

export const IMAGE_INPUT_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
];
export const IMAGE_CONCURRENCY = 2;
export const IMAGE_MAX_INPUT_PIXELS = 50_000_000;
export const IMAGE_WEBP_QUALITY = 85;
export const IMAGE_CONTENT_TYPE = 'image/webp';
