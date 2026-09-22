import { z } from 'zod';

const trustedProxy = z.union([
  z.enum(['loopback', 'linklocal', 'uniquelocal']),
  z.ipv4(),
  z.ipv6(),
  z.cidrv4(),
  z.cidrv6(),
]);

export const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.url(),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).default(10),

  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_ACCESS_TTL: z
    .string()
    .regex(/^[1-9]\d*[smhd]$/, 'Use a whole number with a unit: s, m, h or d')
    .default('15m'),
  REFRESH_TTL_DAYS: z.coerce.number().int().positive().default(7),

  TRUST_PROXY: z
    .union(
      [
        z.string().regex(/^\d+$/).transform(Number),
        z
          .string()
          .transform((val) => val.split(',').map((entry) => entry.trim()))
          .pipe(z.array(trustedProxy)),
      ],
      {
        error:
          'Use a hop count or a comma-separated list of IPs, CIDRs, loopback, linklocal or uniquelocal',
      },
    )
    .default(0),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  THROTTLE_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  THROTTLE_TTL: z.coerce.number().int().min(1).default(60),
  THROTTLE_LIMIT: z.coerce.number().int().min(1).default(100),

  CRON_ENABLED: z
    .enum(['true', 'false'])
    .default('true')
    .transform((val) => val === 'true'),
  SESSION_CLEANUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),

  USER_ANONYMIZATION_AFTER_DAYS: z.coerce.number().int().min(1).default(14),

  AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(730),
});

export type Env = z.infer<typeof envSchema>;
