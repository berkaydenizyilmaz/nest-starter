export interface OneTimeTokenRef {
  userId: string;
  purpose: string;
}

export interface IssueOneTimeTokenInput extends OneTimeTokenRef {
  ttlMs: number;
}

export interface ConsumeOneTimeTokenInput {
  token: string;
  purpose: string;
}

export type ConsumeOneTimeTokenResult =
  | { status: 'valid'; userId: string }
  | { status: 'invalid' }
  | { status: 'expired' };
