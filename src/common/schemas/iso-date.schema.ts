import { z } from 'zod';

export const isoDate = () =>
  z
    .date()
    .transform((value) => value.toISOString())
    .meta({ type: 'string', format: 'date-time' });

export const nullableIsoDate = () =>
  z
    .date()
    .nullable()
    .transform((value) => value?.toISOString() ?? null)
    .meta({ type: 'string', format: 'date-time', nullable: true });
