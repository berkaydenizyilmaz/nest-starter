import { type DynamicModule, Module } from '@nestjs/common';
import type { FilePurpose } from './file-purpose.definition.js';
import { FilePurposeRegistry } from './file-purpose.registry.js';
import { FileController } from './file.controller.js';
import { FileObjectDeleteHandler } from './jobs/file-object-delete.handler.js';
import { FileCleanupService } from './services/file-cleanup.service.js';
import { FileService } from './services/file.service.js';

@Module({})
export class FileModule {
  static forRoot(): DynamicModule {
    return {
      module: FileModule,
      global: true,
      controllers: [FileController],
      providers: [
        FilePurposeRegistry,
        FileService,
        FileCleanupService,
        FileObjectDeleteHandler,
      ],
      exports: [FilePurposeRegistry, FileService],
    };
  }

  static forFeature(purposes: readonly FilePurpose[]): DynamicModule {
    return {
      module: FileModule,
      providers: [
        {
          provide: Symbol('FILE_PURPOSES'),
          inject: [FilePurposeRegistry],
          useFactory: (
            registry: FilePurposeRegistry,
          ): readonly FilePurpose[] => {
            registry.register(purposes);
            return purposes;
          },
        },
      ],
    };
  }
}
