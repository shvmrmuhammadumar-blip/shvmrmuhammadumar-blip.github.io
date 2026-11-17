
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';
import { supabase } from './supabase';
import {
  ResumableUpload,
  type UploadProgress,
} from './resumable-upload';

export const CHANNEL_MEDIA_BUCKET = 'community-media';
export const CHANNEL_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

export type ChannelMediaType = 'image' | 'video' | 'audio' | 'file';
export type ChannelPickerMode = 'media' | 'file';

export type PickedChannelMedia = {
  uri: string;
  type: ChannelMediaType;
  mimeType: string;
  fileName: string;
  fileSize: number;
};

export type CreateChannelUploadOptions = {
  channelId: string;
  userId: string;
  media: PickedChannelMedia;
  onProgress?: (progress: UploadProgress) => void;
};

const MIME_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  heic: 'image/heic',
  heif: 'image/heif',
  avif: 'image/avif',
  bmp: 'image/bmp',

  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  m4v: 'video/x-m4v',

  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  flac: 'audio/flac',

  pdf: 'application/pdf',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
  '7z': 'application/x-7z-compressed',
  tar: 'application/x-tar',
  gz: 'application/gzip',

  txt: 'text/plain',
  csv: 'text/csv',
  json: 'application/json',
  xml: 'application/xml',

  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

function inferMimeType(
  fileName: string,
  fallback?: string | null,
): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  const detected = MIME_TYPES[extension];

  if (detected) return detected;

  const provided = fallback?.trim();

  return provided || 'application/octet-stream';
}

function getMediaType(mimeType: string): ChannelMediaType {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';

  return 'file';
}

export function formatChannelFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Noma’lum';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );

  const value = bytes / 1024 ** index;

  return `${value.toFixed(value >= 100 || index === 0 ? 0 : 1)} ${units[index]}`;
}

async function getFileSize(
  uri: string,
  reportedSize?: number | null,
): Promise<number> {
  let size =
    typeof reportedSize === 'number' && reportedSize > 0
      ? reportedSize
      : 0;

  if (size === 0 && Platform.OS === 'web') {
    const response = await fetch(uri);

    if (!response.ok) {
      throw new Error('Brauzer fayl hajmini o‘qiy olmadi.');
    }

    size = (await response.blob()).size;
  }

  if (size === 0 && Platform.OS !== 'web') {
    const file = new File(uri);

    if (!file.exists) {
      throw new Error('Tanlangan fayl topilmadi.');
    }

    size = file.size;
  }

  if (!Number.isSafeInteger(size) || size <= 0) {
    throw new Error('Fayl hajmini aniqlab bo‘lmadi yoki fayl bo‘sh.');
  }

  if (size > CHANNEL_MEDIA_MAX_BYTES) {
    throw new Error(
      `Fayl hajmi ${formatChannelFileSize(size)}. Maksimal limit 50 MB.`,
    );
  }

  return size;
}

export async function pickChannelMedia(
  mode: ChannelPickerMode,
): Promise<PickedChannelMedia | null> {
  if (mode === 'media') {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      throw new Error('Galereyaga ruxsat berish kerak.');
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      allowsEditing: false,
      allowsMultipleSelection: false,
      quality: 1,
    });

    if (result.canceled || !result.assets?.length) {
      return null;
    }

    const asset = result.assets[0];

    const fileName =
      asset.fileName || `lumo-media-${Date.now()}`;

    const mimeType = inferMimeType(fileName, asset.mimeType);

    return {
      uri: asset.uri,
      type: getMediaType(mimeType),
      mimeType,
      fileName,
      fileSize: await getFileSize(asset.uri, asset.fileSize),
    };
  }

  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });

  if (result.canceled || !result.assets?.length) {
    return null;
  }

  const asset = result.assets[0];

  const fileName =
    asset.name || `lumo-file-${Date.now()}`;

  const mimeType = inferMimeType(fileName, asset.mimeType);

  return {
    uri: asset.uri,
    type: getMediaType(mimeType),
    mimeType,
    fileName,
    fileSize: await getFileSize(asset.uri, asset.size),
  };
}

function getTusEndpoint(): string {
  const configuredUrl =
    process.env.EXPO_PUBLIC_SUPABASE_URL;

  if (!configuredUrl) {
    throw new Error('EXPO_PUBLIC_SUPABASE_URL sozlanmagan.');
  }

  let parsed: URL;

  try {
    parsed = new URL(configuredUrl);
  } catch {
    throw new Error('Supabase URL noto‘g‘ri sozlangan.');
  }

  const hostname = parsed.hostname;

  if (hostname.endsWith('.supabase.co')) {
    const projectRef = hostname.split('.')[0];

    return `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`;
  }

  return `${configuredUrl.replace(/\/+$/, '')}/storage/v1/upload/resumable`;
}

function createUploadId(): string {
  return `channel-${Date.now().toString(36)}-${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}

function safeFileName(value: string): string {
  return (
    value
      .normalize('NFKC')
      .replace(/[^a-zA-Z0-9._-]+/g, '_')
      .replace(/^\.+/, '')
      .slice(0, 120) || `attachment-${Date.now()}`
  );
}

export function createChannelResumableUpload(
  options: CreateChannelUploadOptions,
): ResumableUpload {
  const apiKey =
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

  if (!apiKey) {
    throw new Error('EXPO_PUBLIC_SUPABASE_ANON_KEY sozlanmagan.');
  }

  if (!options.channelId || !options.userId) {
    throw new Error('Channel yoki user ID mavjud emas.');
  }

  if (
    !Number.isSafeInteger(options.media.fileSize) ||
    options.media.fileSize <= 0 ||
    options.media.fileSize > CHANNEL_MEDIA_MAX_BYTES
  ) {
    throw new Error('Fayl hajmi noto‘g‘ri yoki 50 MB limitdan oshgan.');
  }

  const uploadId = createUploadId();

  const objectName = [
    'channels',
    options.channelId,
    options.userId,
    `${uploadId}-${safeFileName(options.media.fileName)}`,
  ].join('/');

  return new ResumableUpload({
    id: uploadId,
    userId: options.userId,
    fileUri: options.media.uri,
    fileName: options.media.fileName,
    contentType: options.media.mimeType,
    bucketName: CHANNEL_MEDIA_BUCKET,
    objectName,
    endpoint: getTusEndpoint(),

    getHeaders: async () => {
      const { data, error } = await supabase.auth.getSession();

      if (error) throw error;

      const accessToken = data.session?.access_token;

      if (!accessToken) {
        throw new Error(
          'Upload qilish uchun qayta tizimga kiring.',
        );
      }

      return {
        Authorization: `Bearer ${accessToken}`,
        apikey: apiKey,
      };
    },

    onProgress: options.onProgress,
  });
}
