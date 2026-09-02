import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsModule, type ClsService } from 'nestjs-cls';

declare module 'nestjs-cls' {
  interface ClsStore {
    ip?: string;
    userAgent?: string;
    device?: string;
    userId?: string;
  }
}

const REQUEST_ID_HEADER = 'x-request-id';
const DEVICE_HEADER = 'x-device-name';
const DEVICE_MAX_LENGTH = 100;
const USER_AGENT_MAX_LENGTH = 256;

function incomingRequestId(request: Request): string | undefined {
  const header = request.headers[REQUEST_ID_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
}

function clamp(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

@Module({
  imports: [
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (request: Request) =>
          incomingRequestId(request) ?? randomUUID(),
        setup: (cls: ClsService, request: Request, response: Response) => {
          response.setHeader(REQUEST_ID_HEADER, cls.getId());

          const device = request.headers[DEVICE_HEADER];
          cls.set('ip', request.ip);
          cls.set(
            'userAgent',
            clamp(request.headers['user-agent'], USER_AGENT_MAX_LENGTH),
          );
          cls.set(
            'device',
            clamp(
              typeof device === 'string' ? device : undefined,
              DEVICE_MAX_LENGTH,
            ),
          );
        },
      },
    }),
  ],
})
export class RequestContextModule {}
