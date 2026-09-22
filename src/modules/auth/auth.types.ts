import type { Role } from '../../generated/prisma/client.js';

export interface TokenSubject {
  id: string;
  role: Role;
}
