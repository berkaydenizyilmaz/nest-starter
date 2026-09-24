import type { QueueOptions } from 'pg-boss';
import type { z } from 'zod';

export type JobOptions = Pick<
  QueueOptions,
  | 'retryLimit'
  | 'retryDelay'
  | 'retryBackoff'
  | 'expireInSeconds'
  | 'deleteAfterSeconds'
>;

export interface JobSchedule {
  cron: string;
  timeZone: string;
}

export interface JobDefinition<TPayload> {
  name: string;
  payload: z.ZodType<TPayload>;
  options?: JobOptions;
  schedule?: JobSchedule;
}

export type JobPayload<TJob> =
  TJob extends JobDefinition<infer TPayload> ? TPayload : never;

export interface JobHandler<TPayload> {
  handle(payload: TPayload): Promise<void>;
}

export function defineJob<TPayload>(
  definition: JobDefinition<TPayload>,
): JobDefinition<TPayload> {
  return definition;
}
