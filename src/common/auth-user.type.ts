import type { Role } from '../generated/prisma/client.js';

export interface AuthUser {
  id: string;
  role: Role;
  sessionId: string;
}
