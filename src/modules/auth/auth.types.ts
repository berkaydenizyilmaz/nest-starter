import type { Role } from '../../generated/prisma/client.js';

export interface TokenSubject {
  id: string;
  role: Role;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResult extends IssuedTokens {
  reactivated: boolean;
}
