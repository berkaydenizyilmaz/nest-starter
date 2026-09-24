import { StoredFileVisibility } from '../../generated/prisma/client.js';
import { defineFilePurpose } from '../file/file-purpose.definition.js';

export const USER_FILE_PURPOSE = {
  USER_AVATAR: defineFilePurpose({
    name: 'user.avatar',
    visibility: StoredFileVisibility.PUBLIC,
    ownership: 'personal',
    contentTypes: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    image: {
      fit: 'cover',
      variants: { medium: [256, 256], large: [512, 512] },
    },
  }),
} as const;

export const USER_AUDIT = {
  USER_DELETED: 'user_deleted',
  USER_ANONYMIZED: 'user_anonymized',
} as const;

export const USER_JOB = {
  USER_ANONYMIZATION: 'user.anonymization',
} as const;

export const USER_ERROR = {
  USER_NOT_FOUND: 'USER_NOT_FOUND',
} as const;
