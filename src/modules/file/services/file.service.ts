import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PinoLogger } from 'nestjs-pino';
import {
  AUDIT_TARGET,
  COMMON_AUDIT,
} from '../../../common/constants/audit.constants.js';
import { COMMON_ERROR } from '../../../common/constants/error-codes.constants.js';
import { MS_PER_SECOND } from '../../../common/constants/time.constants.js';
import {
  ForbiddenError,
  NotFoundError,
  UnavailableError,
  ValidationError,
} from '../../../common/domain.error.js';
import type { Env } from '../../../config/env.schema.js';
import { AuditService } from '../../../core/audit/audit.service.js';
import { PrismaService } from '../../../core/prisma/prisma.service.js';
import { QueueService } from '../../../core/queue/queue.service.js';
import { detectContentType } from '../../../core/storage/content-type.util.js';
import { ImageProcessor } from '../../../core/storage/image.processor.js';
import type {
  ObjectHead,
  ObjectLocation,
  ObjectStorage,
} from '../../../core/storage/object-storage.port.js';
import {
  CONTENT_SNIFF_BYTES,
  OBJECT_STORAGE,
} from '../../../core/storage/storage.constants.js';
import {
  ImageProcessorBusyError,
  InvalidImageError,
  ObjectChangedError,
  ObjectMissingError,
  ObjectStorageUnavailableError,
} from '../../../core/storage/storage.error.js';
import {
  AuditOutcome,
  type Prisma,
  StoredFileStatus,
  StoredFileVisibility,
  type StoredFile,
} from '../../../generated/prisma/client.js';
import type { FilePurpose } from '../file-purpose.definition.js';
import { FilePurposeRegistry } from '../file-purpose.registry.js';
import {
  FILE_COMPLETE_DEADLINE_MS,
  FILE_DOWNLOAD_URL_TTL_SECONDS,
  FILE_ERROR,
  FILE_IMAGE_MAX_EDGE,
  FILE_NAME_MAX_LENGTH,
  FILE_PRIVATE_CACHE_CONTROL,
  FILE_PUBLIC_CACHE_CONTROL,
  FILE_UPLOAD_URL_TTL_SECONDS,
} from '../file.constants.js';
import { bucketFor, incomingKey, objectPrefix } from '../file-location.util.js';
import type {
  CreateUploadInput,
  DownloadUrl,
  FileActor,
  ResolvedFile,
  UploadTicket,
} from '../file.types.js';
import { fileObjectDeleteJob } from '../jobs/file-object-delete.job.js';
import {
  type StoredFileVariants,
  storedFileVariantsSchema,
} from '../stored-file-variants.schema.js';

type StoredObject = Pick<
  StoredFile,
  'key' | 'contentType' | 'size' | 'width' | 'height'
> & { variants: StoredFileVariants };

type ResolvableFile = Pick<
  StoredFile,
  | 'id'
  | 'visibility'
  | 'key'
  | 'contentType'
  | 'size'
  | 'width'
  | 'height'
  | 'variants'
>;

@Injectable()
export class FileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly imageProcessor: ImageProcessor,
    private readonly filePurposes: FilePurposeRegistry,
    private readonly queue: QueueService,
    private readonly audit: AuditService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FileService.name);
  }

  async createUpload(input: CreateUploadInput): Promise<UploadTicket> {
    const purpose = this.purposeOrReject(input.purpose);
    await this.assertRoleAllowed(purpose, input.actor);

    if (!purpose.contentTypes.includes(input.contentType)) {
      throw invalidInputError(
        FILE_ERROR.FILE_TYPE_NOT_ALLOWED,
        'contentType',
        'Content type is not allowed for this purpose',
      );
    }

    if (input.size > purpose.maxBytes) {
      throw fileTooLargeError('size');
    }

    const file = await this.prisma.storedFile.create({
      data: {
        purpose: purpose.name,
        visibility: purpose.visibility,
        ownerId: input.actor.id,
        contentType: input.contentType,
        size: input.size,
        originalName: sanitizeFileName(input.fileName),
      },
      select: { id: true },
    });

    const upload = await this.storage.presignPut({
      bucket: this.privateBucket(),
      key: incomingKey(file.id),
      contentType: input.contentType,
      contentLength: input.size,
      expiresInSeconds: FILE_UPLOAD_URL_TTL_SECONDS,
    });

    return {
      fileId: file.id,
      uploadUrl: upload.url,
      method: 'PUT',
      headers: upload.headers,
      expiresAt: new Date(
        Date.now() + FILE_UPLOAD_URL_TTL_SECONDS * MS_PER_SECOND,
      ),
    };
  }

  async complete({
    fileId,
    actorId,
  }: {
    fileId: string;
    actorId: string;
  }): Promise<ResolvedFile> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, ownerId: actorId },
    });

    if (!file) {
      throw fileNotFoundError();
    }

    if (file.status === StoredFileStatus.READY) {
      return this.resolve(file);
    }

    const purpose = this.purposeOrReject(file.purpose);
    const signal = AbortSignal.timeout(FILE_COMPLETE_DEADLINE_MS);

    let stored: StoredObject;
    try {
      stored = await this.store(file, purpose, signal);
    } catch (error) {
      const finished = await this.resolveIfReady(file.id);
      if (finished) return finished;

      throw await this.translateStoreError(error, file);
    }

    return this.markReady(file, stored);
  }

  async createDownloadUrl({
    fileId,
    disposition,
    variant,
  }: {
    fileId: string;
    disposition: 'inline' | 'attachment';
    variant?: string;
  }): Promise<DownloadUrl> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, status: StoredFileStatus.READY },
    });

    const key = variant
      ? file?.variants &&
        storedFileVariantsSchema
          .parse(file.variants)
          .find((entry) => entry.name === variant)?.key
      : file?.key;

    if (!file || !key) {
      throw fileNotFoundError();
    }

    if (file.visibility === StoredFileVisibility.PUBLIC) {
      return { url: this.publicUrl(key), expiresAt: null };
    }

    const url = await this.storage.presignGet({
      bucket: this.privateBucket(),
      key,
      expiresInSeconds: FILE_DOWNLOAD_URL_TTL_SECONDS,
      responseContentType: file.contentType,
      responseContentDisposition: contentDisposition(
        disposition,
        downloadName(file.originalName, key),
      ),
    });

    return {
      url,
      expiresAt: new Date(
        Date.now() + FILE_DOWNLOAD_URL_TTL_SECONDS * MS_PER_SECOND,
      ),
    };
  }

  async assertAttachable(
    {
      fileId,
      purpose,
      actor,
    }: { fileId: string; purpose: FilePurpose; actor: FileActor },
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    const file = await tx.storedFile.findFirst({
      where: { id: fileId, purpose: purpose.name },
      select: { status: true, ownerId: true },
    });

    if (
      !file ||
      (purpose.ownership === 'personal' && file.ownerId !== actor.id)
    ) {
      throw fileNotFoundError();
    }

    if (purpose.ownership === 'shared') {
      await this.assertRoleAllowed(purpose, actor);
    }

    if (file.status !== StoredFileStatus.READY) {
      throw invalidInputError(
        FILE_ERROR.FILE_NOT_READY,
        'fileId',
        'File upload has not been completed',
      );
    }
  }

  async resolveMany(fileIds: string[]): Promise<Map<string, ResolvedFile>> {
    if (fileIds.length === 0) return new Map();

    const files = await this.prisma.storedFile.findMany({
      where: { id: { in: fileIds }, status: StoredFileStatus.READY },
    });

    return new Map(files.map((file) => [file.id, this.resolve(file)]));
  }

  async anonymizeOwner(
    userId: string,
    client: Prisma.TransactionClient,
  ): Promise<void> {
    await client.storedFile.updateMany({
      where: { ownerId: userId, originalName: { not: null } },
      data: { originalName: null },
    });
  }

  private async assertRoleAllowed(
    purpose: FilePurpose,
    actor: FileActor,
  ): Promise<void> {
    if (!purpose.roles || purpose.roles.includes(actor.role)) return;

    await this.audit.record({
      event: COMMON_AUDIT.AUTHZ_FAIL,
      outcome: AuditOutcome.FAILURE,
      subjectId: actor.id,
      targetType: AUDIT_TARGET.USER,
      targetId: actor.id,
      metadata: {
        required: [...purpose.roles],
        actual: actor.role,
        purpose: purpose.name,
      },
    });

    throw new ForbiddenError(
      COMMON_ERROR.INSUFFICIENT_ROLE,
      'Insufficient permissions',
    );
  }

  private async store(
    file: StoredFile,
    purpose: FilePurpose,
    signal: AbortSignal,
  ): Promise<StoredObject> {
    const incoming: ObjectLocation = {
      bucket: this.privateBucket(),
      key: incomingKey(file.id),
    };

    const head = await this.storage.head(incoming, signal);

    if (!head) {
      throw fileNotUploadedError();
    }

    if (head.size > purpose.maxBytes) {
      throw fileTooLargeError('fileId');
    }

    if (head.size === 0) {
      throw invalidContentError();
    }

    return purpose.image
      ? this.storeImage({ file, purpose, incoming, head }, signal)
      : this.storeDocument({ file, purpose, incoming, head }, signal);
  }

  private async storeImage(
    { file, purpose, incoming, head }: StoreInput,
    signal: AbortSignal,
  ): Promise<StoredObject> {
    const image = await this.imageProcessor.process(
      {
        contentTypes: purpose.contentTypes,
        fit: purpose.image?.fit ?? 'inside',
        maxEdge: purpose.image?.maxEdge ?? FILE_IMAGE_MAX_EDGE,
        variants: purpose.image?.variants ?? {},
      },
      () =>
        this.storage.getBytes(
          {
            ...incoming,
            etag: head.etag,
            range: { start: 0, end: purpose.maxBytes - 1 },
          },
          signal,
        ),
    );

    const bucket = bucketFor(this.config, file.visibility);
    const cacheControl = cacheControlFor(file.visibility);
    const prefix = objectPrefix(file.purpose, file.id);
    const key = `${prefix}master.webp`;
    const variants = image.variants.map((variant) => ({
      name: variant.name,
      key: `${prefix}${variant.name}.webp`,
      width: variant.width,
      height: variant.height,
      size: variant.size,
    }));

    await Promise.all([
      this.storage.put(
        {
          bucket,
          key,
          body: image.master.data,
          contentType: image.contentType,
          cacheControl,
        },
        signal,
      ),
      ...image.variants.map((variant, index) =>
        this.storage.put(
          {
            bucket,
            key: variants[index].key,
            body: variant.data,
            contentType: image.contentType,
            cacheControl,
          },
          signal,
        ),
      ),
    ]);

    return {
      key,
      contentType: image.contentType,
      size: image.master.size,
      width: image.master.width,
      height: image.master.height,
      variants,
    };
  }

  private async storeDocument(
    { file, purpose, incoming, head }: StoreInput,
    signal: AbortSignal,
  ): Promise<StoredObject> {
    const sample = await this.storage.getBytes(
      {
        ...incoming,
        etag: head.etag,
        range: { start: 0, end: Math.min(CONTENT_SNIFF_BYTES, head.size) - 1 },
      },
      signal,
    );

    const detected = await detectContentType(sample);
    if (!detected || !purpose.contentTypes.includes(detected)) {
      throw invalidContentError();
    }

    const key = `${objectPrefix(file.purpose, file.id)}original`;

    await this.storage.copy(
      {
        from: { ...incoming, etag: head.etag },
        to: { bucket: bucketFor(this.config, file.visibility), key },
        contentType: detected,
        cacheControl: cacheControlFor(file.visibility),
      },
      signal,
    );

    return {
      key,
      contentType: detected,
      size: head.size,
      width: null,
      height: null,
      variants: [],
    };
  }

  private async markReady(
    file: StoredFile,
    stored: StoredObject,
  ): Promise<ResolvedFile> {
    const marked = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.storedFile.updateMany({
        where: { id: file.id, status: StoredFileStatus.PENDING },
        data: {
          status: StoredFileStatus.READY,
          ...stored,
          readyAt: new Date(),
        },
      });

      if (updated.count === 0) return false;

      await this.queue.send(
        fileObjectDeleteJob,
        {
          fileId: file.id,
          purpose: file.purpose,
          visibility: file.visibility,
          scope: 'incoming',
        },
        tx,
      );
      return true;
    });

    if (marked) {
      return this.resolve({ ...file, ...stored });
    }

    const finished = await this.resolveIfReady(file.id);
    if (finished) return finished;

    await this.queue.send(fileObjectDeleteJob, {
      fileId: file.id,
      purpose: file.purpose,
      visibility: file.visibility,
      scope: 'all',
    });
    throw fileNotFoundError();
  }

  private async resolveIfReady(fileId: string): Promise<ResolvedFile | null> {
    const file = await this.prisma.storedFile.findFirst({
      where: { id: fileId, status: StoredFileStatus.READY },
    });

    return file ? this.resolve(file) : null;
  }

  private async translateStoreError(
    error: unknown,
    file: StoredFile,
  ): Promise<unknown> {
    if (
      error instanceof ObjectChangedError ||
      error instanceof InvalidImageError
    ) {
      return this.discard(file, invalidContentError());
    }

    if (
      error instanceof ValidationError &&
      error.code !== FILE_ERROR.FILE_NOT_UPLOADED
    ) {
      return this.discard(file, error);
    }

    if (error instanceof ObjectMissingError) {
      return fileNotUploadedError();
    }

    if (error instanceof ImageProcessorBusyError) {
      return new UnavailableError(
        FILE_ERROR.FILE_PROCESSING_BUSY,
        'Image processing is at capacity',
      );
    }

    if (error instanceof ObjectStorageUnavailableError) {
      this.logger.warn(
        { err: error, fileId: file.id },
        'Object storage is unreachable',
      );
      return new UnavailableError(
        FILE_ERROR.STORAGE_UNAVAILABLE,
        'File storage is unreachable',
      );
    }

    return error;
  }

  private async discard(
    file: StoredFile,
    reason: ValidationError,
  ): Promise<ValidationError> {
    await this.prisma.$transaction(async (tx) => {
      const removed = await tx.storedFile.deleteMany({
        where: { id: file.id, status: StoredFileStatus.PENDING },
      });

      if (removed.count === 0) return;

      await this.queue.send(
        fileObjectDeleteJob,
        {
          fileId: file.id,
          purpose: file.purpose,
          visibility: file.visibility,
          scope: 'all',
        },
        tx,
      );
    });

    return reason;
  }

  private resolve(file: ResolvableFile): ResolvedFile {
    const isPublic = file.visibility === StoredFileVisibility.PUBLIC;
    const variants =
      file.variants === null
        ? []
        : storedFileVariantsSchema.parse(file.variants);

    return {
      id: file.id,
      contentType: file.contentType,
      size: file.size,
      width: file.width,
      height: file.height,
      url: isPublic && file.key ? this.publicUrl(file.key) : null,
      variants: isPublic
        ? Object.fromEntries(
            variants.map((variant) => [
              variant.name,
              this.publicUrl(variant.key),
            ]),
          )
        : {},
    };
  }

  private purposeOrReject(name: string): FilePurpose {
    const purpose = this.filePurposes.findByNameOrNull(name);

    if (!purpose) {
      throw invalidInputError(
        FILE_ERROR.FILE_PURPOSE_UNKNOWN,
        'purpose',
        'File purpose is not registered',
      );
    }

    return purpose;
  }

  private privateBucket(): string {
    return this.config.get('STORAGE_PRIVATE_BUCKET', { infer: true });
  }

  private publicUrl(key: string): string {
    const base = this.config.get('STORAGE_PUBLIC_URL', { infer: true });
    return `${base.replace(/\/+$/, '')}/${key}`;
  }
}

interface StoreInput {
  file: StoredFile;
  purpose: FilePurpose;
  incoming: ObjectLocation;
  head: ObjectHead;
}

function cacheControlFor(visibility: StoredFileVisibility): string {
  return visibility === StoredFileVisibility.PUBLIC
    ? FILE_PUBLIC_CACHE_CONTROL
    : FILE_PRIVATE_CACHE_CONTROL;
}

function sanitizeFileName(fileName: string | undefined): string | null {
  if (!fileName) return null;

  const baseName = fileName.split(/[\\/]/).at(-1) ?? '';
  const cleaned = baseName
    .replace(/[\p{Cc}"]/gu, '')
    .trim()
    .slice(0, FILE_NAME_MAX_LENGTH);

  return cleaned.length > 0 ? cleaned : null;
}

function downloadName(originalName: string | null, key: string): string | null {
  const storedExtension = /\.[a-z0-9]+$/.exec(key)?.[0];
  if (!originalName || !storedExtension) return originalName;

  return `${originalName.replace(/\.[^.]*$/, '')}${storedExtension}`;
}

function contentDisposition(
  type: 'inline' | 'attachment',
  fileName: string | null,
): string {
  if (!fileName) return type;

  const asciiFallback = fileName
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]/g, '_');
  const encoded = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

function invalidInputError(
  code: string,
  field: string,
  message: string,
): ValidationError {
  return new ValidationError(code, message, [{ field, code, message }]);
}

function fileNotUploadedError(): ValidationError {
  return invalidInputError(
    FILE_ERROR.FILE_NOT_UPLOADED,
    'fileId',
    'File has not been uploaded',
  );
}

function fileTooLargeError(field: string): ValidationError {
  return invalidInputError(
    FILE_ERROR.FILE_TOO_LARGE,
    field,
    'File exceeds the size limit for this purpose',
  );
}

function invalidContentError(): ValidationError {
  return invalidInputError(
    FILE_ERROR.FILE_INVALID_CONTENT,
    'fileId',
    'File content does not match an allowed type',
  );
}

function fileNotFoundError(): NotFoundError {
  return new NotFoundError(FILE_ERROR.FILE_NOT_FOUND, 'File not found');
}
