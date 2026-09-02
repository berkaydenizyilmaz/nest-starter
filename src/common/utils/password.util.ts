import { randomBytes } from 'node:crypto';
import argon2 from 'argon2';

export function unusablePasswordHash(): Promise<string> {
  return argon2.hash(randomBytes(32).toString('base64url'));
}
