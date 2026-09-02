export interface AccessTokenPayload {
  sub: string;
  role: string;
  sid: string;
}

export interface TokenSubject {
  id: string;
  role: string;
}
