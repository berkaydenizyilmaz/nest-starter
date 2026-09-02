import { randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import type { Request, Response } from 'express';
import { ClsModule, type ClsService } from 'nestjs-cls';

export const REQUEST_ID_HEADER = 'x-request-id';

function incomingRequestId(request: Request): string | undefined {
  const header = request.headers[REQUEST_ID_HEADER];
  return typeof header === 'string' && header.length > 0 ? header : undefined;
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
        setup: (cls: ClsService, _request: Request, response: Response) => {
          response.setHeader(REQUEST_ID_HEADER, cls.getId());
        },
      },
    }),
  ],
})
export class RequestContextModule {}
