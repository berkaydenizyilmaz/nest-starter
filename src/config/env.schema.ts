import { z } from 'zod';

const SECONDS_PER_UNIT = { s: 1, m: 60, h: 60 * 60, d: 24 * 60 * 60 } as const;

function durationInSeconds(value: string): number {
  const unit = value.slice(-1) as keyof typeof SECONDS_PER_UNIT;
  return Number(value.slice(0, -1)) * SECONDS_PER_UNIT[unit];
}

const trustedProxy = z.union([
  z.enum(['loopback', 'linklocal', 'uniquelocal']),
  z.ipv4(),
  z.ipv6(),
  z.cidrv4(),
  z.cidrv6(),
]);

export const envSchema = z
  .object({
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
      .default('15m')
      .transform(durationInSeconds),
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

    QUEUE_WORKERS_ENABLED: z
      .enum(['true', 'false'])
      .default('true')
      .transform((val) => val === 'true'),
    SESSION_CLEANUP_RETENTION_DAYS: z.coerce.number().int().min(1).default(7),

    USER_ANONYMIZATION_AFTER_DAYS: z.coerce.number().int().min(1).default(14),

    AUDIT_RETENTION_DAYS: z.coerce.number().int().min(1).default(730),

    APP_URL: z.url(),
    MAIL_DRIVER: z.enum(['console', 'resend']).default('console'),
    MAIL_FROM: z.string().min(1),
    RESEND_API_KEY: z.string().min(1).optional(),

    STORAGE_ENDPOINT: z.url(),
    STORAGE_ACCESS_KEY_ID: z.string().min(1),
    STORAGE_SECRET_ACCESS_KEY: z.string().min(1),
    STORAGE_PUBLIC_BUCKET: z.string().min(1),
    STORAGE_PRIVATE_BUCKET: z.string().min(1),
    STORAGE_PUBLIC_URL: z.url(),
  })
  .superRefine((env, ctx) => {
    if (env.NODE_ENV === 'production' && env.MAIL_DRIVER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['MAIL_DRIVER'],
        message: 'The console driver writes mail to the log; use a real driver',
      });
    }

    if (env.MAIL_DRIVER === 'resend' && !env.RESEND_API_KEY) {
      ctx.addIssue({
        code: 'custom',
        path: ['RESEND_API_KEY'],
        message: 'Required when MAIL_DRIVER is resend',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;
