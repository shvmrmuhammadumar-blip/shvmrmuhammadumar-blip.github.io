
import { supabase } from './supabase';

export type MediaKind = 'image' | 'video' | 'audio' | 'file';

export type MediaDescriptorInput = {
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number;
  expectedKind?: MediaKind;
};

export type ValidatedMediaDescriptor = {
  fileName: string;
  mimeType: string;
  kind: MediaKind;
  sizeBytes: number;
};

export type SignedMediaResources = {
  originalUrl: string;
  previewUrl: string | null;
  downloadUrl: string;
  streamUrl: string | null;
  expiresIn: number;
};

const MEDIA_BUCKET = 'chat-media';
const SIGNED_URL_TTL = 60 * 60;

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',

  mp4: 'video/mp4',
  m4v: 'video/x-m4v',
  mov: 'video/quicktime',
  webm: 'video/webm',

  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  wav: 'audio/wav',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',

  pdf: 'application/pdf',
  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  zip: 'application/zip',

  doc: 'application/msword',
  docx:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',

  xls: 'application/vnd.ms-excel',
  xlsx:
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',

  ppt: 'application/vnd.ms-powerpoint',
  pptx:
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

const BLOCKED_EXTENSIONS = new Set([
  'html',
  'htm',
  'js',
  'mjs',
  'cjs',
  'exe',
  'dll',
  'bat',
  'cmd',
  'ps1',
  'sh',
]);

const BLOCKED_MIME_TYPES = new Set([
  'text/html',
  'text/javascript',
  'application/javascript',
  'application/x-javascript',
  'application/x-msdownload',
  'application/x-executable',
  'application/x-sh',
]);

function getExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');

  if (lastDot <= 0 || lastDot === fileName.length - 1) {
    return '';
  }

  return fileName.slice(lastDot + 1).toLowerCase();
}

/**
 * Removes path components, control characters and unsafe filename symbols.
 * The resulting filename is only a display name, not a storage path.
 */
export function sanitizeMediaFileName(
  originalName: string | null,
): string {
  const source = originalName?.trim() || 'attachment';

  const basename = source
    .replace(/\\/g, '/')
    .split('/')
    .pop() || 'attachment';

  const normalized = basename.normalize('NFKC');

  const cleaned = normalized
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/[^a-zA-Z0-9._ -]/g, '_')
    .replace(/\.{2,}/g, '.')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .replace(/\s+/g, '_')
    .slice(0, 120);

  return cleaned || 'attachment';
}

function normalizeMimeType(value: string | null): string | null {
  if (!value) return null;

  const normalized = value
    .split(';')[0]
    .trim()
    .toLowerCase();

  if (!/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/.test(normalized)) {
    return null;
  }

  return normalized;
}

function inferMimeType(
  fileName: string,
  providedMimeType: string | null,
): string {
  const extension = getExtension(fileName);
  const knownMimeType = MIME_BY_EXTENSION[extension];

  if (
    !providedMimeType ||
    providedMimeType === 'application/octet-stream'
  ) {
    return knownMimeType ?? 'application/octet-stream';
  }

  return providedMimeType;
}

function getMediaKind(mimeType: string): MediaKind {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  return 'file';
}

/**
 * Client-side metadata validation.
 *
 * This does not replace server-side MIME signature inspection.
 */
export function validateMediaDescriptor(
  input: MediaDescriptorInput,
): ValidatedMediaDescriptor {
  if (
    !Number.isSafeInteger(input.sizeBytes) ||
    input.sizeBytes <= 0
  ) {
    throw new Error('The selected file is empty or has an invalid size.');
  }

  const fileName = sanitizeMediaFileName(input.fileName);
  const extension = getExtension(fileName);

  if (BLOCKED_EXTENSIONS.has(extension)) {
    throw new Error('This file type is not allowed.');
  }

  const normalizedMime = normalizeMimeType(input.mimeType);

  if (input.mimeType && !normalizedMime) {
    throw new Error('The file has an invalid MIME type.');
  }

  const mimeType = inferMimeType(fileName, normalizedMime);

  if (BLOCKED_MIME_TYPES.has(mimeType)) {
    throw new Error('This file type is not allowed.');
  }

  const kind = getMediaKind(mimeType);

  if (input.expectedKind && input.expectedKind !== kind) {
    throw new Error(
      'The selected file type does not match its media category.',
    );
  }

  return {
    fileName,
    mimeType,
    kind,
    sizeBytes: input.sizeBytes,
  };
}

/**
 * Prevents invalid or traversal-style paths from reaching Storage.
 */
function validateStoragePath(path: string): string {
  const normalized = path.trim().replace(/^\/+|\/+$/g, '');

  if (!normalized || normalized.includes('\\')) {
    throw new Error('Invalid media storage path.');
  }

  const segments = normalized.split('/');

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === '.' ||
        segment === '..' ||
        /[\u0000-\u001F\u007F]/.test(segment),
    )
  ) {
    throw new Error('Invalid media storage path.');
  }

  return normalized;
}

/**
 * Creates temporary URLs for private chat attachments.
 *
 * Images:
 * - Original signed URL.
 * - Optimized thumbnail URL, when transformations are enabled.
 *
 * Videos:
 * - Signed URL intended for native video playback.
 * - Do not download the whole video into JS memory.
 *
 * Files:
 * - Signed download URL with a sanitized download filename.
 */
export async function getSignedMediaResources(
  storagePath: string,
  mediaKind: MediaKind,
  fileName: string,
): Promise<SignedMediaResources> {
  const safePath = validateStoragePath(storagePath);
  const safeFileName = sanitizeMediaFileName(fileName);

  const storage = supabase.storage.from(MEDIA_BUCKET);

  const [originalResult, downloadResult] = await Promise.all([
    storage.createSignedUrl(
      safePath,
      SIGNED_URL_TTL,
    ),
    storage.createSignedUrl(
      safePath,
      SIGNED_URL_TTL,
      { download: safeFileName },
    ),
  ]);

  if (originalResult.error || !originalResult.data?.signedUrl) {
    throw originalResult.error ?? new Error(
      'Could not create the media URL.',
    );
  }

  if (downloadResult.error || !downloadResult.data?.signedUrl) {
    throw downloadResult.error ?? new Error(
      'Could not create the download URL.',
    );
  }

  const originalUrl = originalResult.data.signedUrl;

  let previewUrl: string | null = null;

  if (mediaKind === 'image') {
    const thumbnailResult = await storage.createSignedUrl(
      safePath,
      SIGNED_URL_TTL,
      {
        transform: {
          width: 640,
          height: 640,
          resize: 'contain',
          quality: 70,
        },
      },
    );

    previewUrl =
      !thumbnailResult.error && thumbnailResult.data?.signedUrl
        ? thumbnailResult.data.signedUrl
        : originalUrl;
  }

  return {
    originalUrl,
    previewUrl,
    downloadUrl: downloadResult.data.signedUrl,
    streamUrl: mediaKind === 'video' ? originalUrl : null,
    expiresIn: SIGNED_URL_TTL,
  };
}
