import type { Role } from '../../generated/prisma/client.js';

export interface TokenSubject {
  id: string;
  role: Role;
}

export interface IssuedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface IssuedTokens {
  accessToken: string;
  accessTokenExpiresIn: number;
  refreshToken: string;
  refreshTokenExpiresIn: number;
}

export interface LoginResult extends IssuedTokens {
  reactivated: boolean;
}
