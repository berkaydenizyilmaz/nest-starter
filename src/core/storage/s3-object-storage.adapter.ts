import {
  CopyObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
  S3ServiceException,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type {
  CopyObjectInput,
  GetBytesInput,
  ObjectHead,
  ObjectLocation,
  ObjectStorage,
  PresignedUpload,
  PresignGetInput,
  PresignPutInput,
  PutObjectInput,
} from './object-storage.port.js';
import { S3_DELETE_BATCH_SIZE } from './storage.constants.js';
import {
  ObjectChangedError,
  ObjectMissingError,
  ObjectStorageUnavailableError,
} from './storage.error.js';

const HTTP_NOT_FOUND = 404;
const HTTP_PRECONDITION_FAILED = 412;
const NO_SUCH_KEY = 'NoSuchKey';
const HTTP_SERVER_ERROR = 500;
const TRANSIENT_ERROR_NAMES = new Set(['AbortError', 'TimeoutError']);

export class S3ObjectStorage implements ObjectStorage {
  constructor(private readonly client: S3Client) {}

  async presignPut({
    bucket,
    key,
    contentType,
    contentLength,
    expiresInSeconds,
  }: PresignPutInput): Promise<PresignedUpload> {
    const url = await getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket: bucket,
        Key: key,
        ContentType: contentType,
        ContentLength: contentLength,
        IfNoneMatch: '*',
      }),
      {
        expiresIn: expiresInSeconds,
        signableHeaders: new Set([
          'content-type',
          'content-length',
          'if-none-match',
        ]),
      },
    );

    return {
      url,
      headers: { 'Content-Type': contentType, 'If-None-Match': '*' },
    };
  }

  presignGet({
    bucket,
    key,
    expiresInSeconds,
    responseContentType,
    responseContentDisposition,
  }: PresignGetInput): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: bucket,
        Key: key,
        ResponseContentType: responseContentType,
        ResponseContentDisposition: responseContentDisposition,
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  async head(
    { bucket, key }: ObjectLocation,
    signal: AbortSignal,
  ): Promise<ObjectHead | null> {
    try {
      const head = await this.client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: key }),
        { abortSignal: signal },
      );
      if (head.ContentLength === undefined || !head.ETag) {
        throw new Error(`Object ${key} has no size or ETag`);
      }
      return { size: head.ContentLength, etag: head.ETag };
    } catch (error) {
      if (statusOf(error) === HTTP_NOT_FOUND) return null;
      throw translate(error, key);
    }
  }

  async getBytes(
    { bucket, key, etag, range }: GetBytesInput,
    signal: AbortSignal,
  ): Promise<Buffer> {
    try {
      const object = await this.client.send(
        new GetObjectCommand({
          Bucket: bucket,
          Key: key,
          IfMatch: etag,
          Range: `bytes=${range.start}-${range.end}`,
        }),
        { abortSignal: signal },
      );
      if (!object.Body) {
        throw new Error(`Object ${key} has no body`);
      }
      return Buffer.from(await object.Body.transformToByteArray());
    } catch (error) {
      throw translate(error, key);
    }
  }

  async put(
    { bucket, key, body, contentType, cacheControl }: PutObjectInput,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: body,
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      throw translate(error, key);
    }
  }

  async copy(
    { from, to, contentType, cacheControl }: CopyObjectInput,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      await this.client.send(
        new CopyObjectCommand({
          Bucket: to.bucket,
          Key: to.key,
          CopySource: `${from.bucket}/${encodeKey(from.key)}`,
          CopySourceIfMatch: from.etag,
          MetadataDirective: 'REPLACE',
          ContentType: contentType,
          CacheControl: cacheControl,
        }),
        { abortSignal: signal },
      );
    } catch (error) {
      throw translate(error, from.key);
    }
  }

  async deleteMany(bucket: string, keys: string[]): Promise<void> {
    for (let start = 0; start < keys.length; start += S3_DELETE_BATCH_SIZE) {
      const batch = keys.slice(start, start + S3_DELETE_BATCH_SIZE);
      const result = await this.client.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((key) => ({ Key: key })), Quiet: true },
        }),
      );
      const failed = result.Errors ?? [];
      if (failed.length > 0) {
        throw new Error(
          `Failed to delete ${failed.length} objects: ${failed
            .map((entry) => `${entry.Key ?? '?'} (${entry.Code ?? 'unknown'})`)
            .join(', ')}`,
        );
      }
    }
  }

  async deletePrefix(bucket: string, prefix: string): Promise<void> {
    let continuationToken: string | undefined;

    do {
      const page = await this.client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        }),
      );
      const keys = (page.Contents ?? []).flatMap((object) =>
        object.Key ? [object.Key] : [],
      );
      await this.deleteMany(bucket, keys);
      continuationToken = page.IsTruncated
        ? page.NextContinuationToken
        : undefined;
    } while (continuationToken);
  }
}

function statusOf(error: unknown): number | undefined {
  return error instanceof S3ServiceException
    ? error.$metadata.httpStatusCode
    : undefined;
}

function translate(error: unknown, key: string): unknown {
  const status = statusOf(error);

  if (status === HTTP_PRECONDITION_FAILED) {
    return new ObjectChangedError(key, { cause: error });
  }

  if (error instanceof S3ServiceException && error.name === NO_SUCH_KEY) {
    return new ObjectMissingError(key, { cause: error });
  }

  const transient =
    status !== undefined
      ? status >= HTTP_SERVER_ERROR
      : error instanceof Error &&
        (TRANSIENT_ERROR_NAMES.has(error.name) ||
          ('code' in error && typeof error.code === 'string'));

  return transient
    ? new ObjectStorageUnavailableError({ cause: error })
    : error;
}

function encodeKey(key: string): string {
  return key.split('/').map(encodeURIComponent).join('/');
}
