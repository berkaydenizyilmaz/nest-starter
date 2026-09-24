export interface ObjectLocation {
  bucket: string;
  key: string;
}

export interface ObjectHead {
  size: number;
  etag: string;
}

export interface PresignPutInput extends ObjectLocation {
  contentType: string;
  contentLength: number;
  expiresInSeconds: number;
}

export interface PresignedUpload {
  url: string;
  headers: Record<string, string>;
}

export interface PresignGetInput extends ObjectLocation {
  expiresInSeconds: number;
  responseContentType?: string;
  responseContentDisposition?: string;
}

export interface GetBytesInput extends ObjectLocation {
  etag: string;
  range: { start: number; end: number };
}

export interface PutObjectInput extends ObjectLocation {
  body: Buffer;
  contentType: string;
  cacheControl: string;
}

export interface CopyObjectInput {
  from: ObjectLocation & { etag: string };
  to: ObjectLocation;
  contentType: string;
  cacheControl: string;
}

export interface ObjectStorage {
  presignPut(input: PresignPutInput): Promise<PresignedUpload>;
  presignGet(input: PresignGetInput): Promise<string>;
  head(
    location: ObjectLocation,
    signal: AbortSignal,
  ): Promise<ObjectHead | null>;
  getBytes(input: GetBytesInput, signal: AbortSignal): Promise<Buffer>;
  put(input: PutObjectInput, signal: AbortSignal): Promise<void>;
  copy(input: CopyObjectInput, signal: AbortSignal): Promise<void>;
  deleteMany(bucket: string, keys: string[]): Promise<void>;
  deletePrefix(bucket: string, prefix: string): Promise<void>;
}
