export interface OneTimeTokenRef {
  userId: string;
  purpose: string;
}

export interface IssueOneTimeTokenInput extends OneTimeTokenRef {
  ttlMs: number;
  cooldownMs: number;
}

export type IssueOneTimeTokenResult =
  { status: 'issued'; token: string } | { status: 'cooling_down' };

export interface ConsumeOneTimeTokenInput {
  token: string;
  purpose: string;
}

export type ConsumeOneTimeTokenResult =
  | { status: 'valid'; userId: string }
  | { status: 'invalid' }
  | { status: 'expired' };
