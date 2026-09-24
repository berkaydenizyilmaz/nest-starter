import type { Role } from '../../generated/prisma/client.js';

export interface FileActor {
  id: string;
  role: Role;
}

export interface CreateUploadInput {
  purpose: string;
  contentType: string;
  size: number;
  fileName?: string;
  actor: FileActor;
}

export interface UploadTicket {
  fileId: string;
  uploadUrl: string;
  method: 'PUT';
  headers: Record<string, string>;
  expiresAt: Date;
}

export interface ResolvedFile {
  id: string;
  contentType: string;
  size: number;
  width: number | null;
  height: number | null;
  url: string | null;
  variants: Record<string, string>;
}

export interface DownloadUrl {
  url: string;
  expiresAt: Date | null;
}
