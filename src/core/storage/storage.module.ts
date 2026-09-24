import { S3Client } from '@aws-sdk/client-s3';
import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { ImageProcessor } from './image.processor.js';
import type { ObjectStorage } from './object-storage.port.js';
import { S3ObjectStorage } from './s3-object-storage.adapter.js';
import {
  OBJECT_STORAGE,
  S3_CONNECTION_TIMEOUT_MS,
  S3_MAX_ATTEMPTS,
  S3_SOCKET_IDLE_TIMEOUT_MS,
} from './storage.constants.js';

@Global()
@Module({
  providers: [
    {
      provide: OBJECT_STORAGE,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): ObjectStorage =>
        new S3ObjectStorage(
          new S3Client({
            region: 'auto',
            endpoint: config.get('STORAGE_ENDPOINT', { infer: true }),
            credentials: {
              accessKeyId: config.get('STORAGE_ACCESS_KEY_ID', { infer: true }),
              secretAccessKey: config.get('STORAGE_SECRET_ACCESS_KEY', {
                infer: true,
              }),
            },
            requestChecksumCalculation: 'WHEN_REQUIRED',
            responseChecksumValidation: 'WHEN_REQUIRED',
            maxAttempts: S3_MAX_ATTEMPTS,
            requestHandler: {
              connectionTimeout: S3_CONNECTION_TIMEOUT_MS,
              requestTimeout: S3_SOCKET_IDLE_TIMEOUT_MS,
            },
          }),
        ),
    },
    ImageProcessor,
  ],
  exports: [OBJECT_STORAGE, ImageProcessor],
})
export class StorageModule {}
