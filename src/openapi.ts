import { writeFile } from 'node:fs/promises';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';
import { configureRouting, createOpenApiDocument } from './app.setup.js';

const OUTPUT_FILE = 'openapi.json';

async function exportOpenApi(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });
  configureRouting(app);

  const document = createOpenApiDocument(app);
  await writeFile(OUTPUT_FILE, `${JSON.stringify(document, null, 2)}\n`);

  await app.close();
}

await exportOpenApi();
