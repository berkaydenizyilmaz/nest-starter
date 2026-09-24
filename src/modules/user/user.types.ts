import type { User } from '../../generated/prisma/client.js';
import type { ResolvedFile } from '../file/file.types.js';

export type UserProfile = User & { avatar: ResolvedFile | null };
