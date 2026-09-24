import { fileTypeFromBuffer, supportedMimeTypes } from 'file-type';

export async function detectContentType(
  bytes: Uint8Array,
): Promise<string | null> {
  return (await fileTypeFromBuffer(bytes))?.mime ?? null;
}

export function isDetectableContentType(contentType: string): boolean {
  return supportedMimeTypes.has(contentType);
}
