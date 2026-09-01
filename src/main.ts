import { VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import {
  DocumentBuilder,
  SwaggerModule,
  type SwaggerDocumentOptions,
} from '@nestjs/swagger';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { createSchema } from 'zod-openapi';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config: ConfigService<Env, true> = app.get(ConfigService);

  app.set('trust proxy', config.get('TRUST_PROXY', { infer: true }));

  app.use(helmet());
  app.enableShutdownHooks([], { useProcessExit: true });
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });

  const origins = config
    .get('CORS_ORIGINS', { infer: true })
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  if (config.get('NODE_ENV', { infer: true }) !== 'production') {
    setupSwagger(app);
  }

  const port = config.get('PORT', { infer: true });
  const logger = app.get(Logger);

  try {
    await app.listen(port);
    logger.log(
      `Application ready | port=${port} env=${config.get('NODE_ENV', { infer: true })}`,
    );
  } catch (error) {
    logger.error(error, 'Application failed to start');
    process.exit(1);
  }
}

function setupSwagger(app: Parameters<typeof SwaggerModule.setup>[1]): void {
  const documentOptions: SwaggerDocumentOptions = {
    operationIdFactory: (_controllerKey, methodKey) => methodKey,
    standardSchemaConverter: (schema, { schemaType }) => {
      const converted = createSchema(schema as never, {
        io: schemaType,
        openapiVersion: '3.0.0',
      });
      return { schema: converted.schema, components: converted.components };
    },
  };

  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API')
      .setVersion('1')
      .addBearerAuth()
      .build(),
    documentOptions,
  );

  SwaggerModule.setup('api/docs', app, document);
}

await bootstrap();
