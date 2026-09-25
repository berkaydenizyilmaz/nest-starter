import { type INestApplication, VersioningType } from '@nestjs/common';
import {
  DocumentBuilder,
  type OpenAPIObject,
  type SwaggerDocumentOptions,
  SwaggerModule,
} from '@nestjs/swagger';
import { createSchema } from 'zod-openapi';

export function configureRouting(app: INestApplication): void {
  app.setGlobalPrefix('api');
  app.enableVersioning({ type: VersioningType.URI });
}

export function createOpenApiDocument(app: INestApplication): OpenAPIObject {
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

  return SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('API')
      .setVersion('1')
      .addBearerAuth()
      .build(),
    documentOptions,
  );
}
