import { createHash, randomBytes } from 'node:crypto';

export function createOpaqueToken(bytes: number): string {
  return randomBytes(bytes).toString('base64url');
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
