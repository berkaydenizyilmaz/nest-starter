import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z.string().default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  CRON_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  SESSION_CLEANUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),

  USER_ANONYMIZATION_AFTER_DAYS: z.coerce.number().int().min(1).default(30),

  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(730),
});

export type Env = z.infer<typeof envSchema>;
