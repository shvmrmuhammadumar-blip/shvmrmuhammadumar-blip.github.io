import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { supabase } from './supabase';
import type { MessageType, Post } from './types';

export type PickedPostMedia = {
  uri: string;
  type: "image" | "video";
  mimeType: string;
  fileName: string | null;
  fileSize: number | null;
};
export type PickedChatMedia = {
  uri: string;
  type: Exclude<MessageType, 'text'>;
  mimeType: string;
  fileName: string | null;
  fileSize: number | null;
};

export const CHAT_MEDIA_MAX_BYTES = 50 * 1024 * 1024;

function inferMimeType(fileName: string | null, type: PickedChatMedia['type']): string {
  const extension = (fileName?.split('.').pop() ?? '').toLowerCase();
  const known: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
    heic: 'image/heic', heif: 'image/heif', avif: 'image/avif',
    mp4: 'video/mp4', m4v: 'video/x-m4v', mov: 'video/quicktime', webm: 'video/webm',
    mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', wav: 'audio/wav',
    ogg: 'audio/ogg', opus: 'audio/ogg', flac: 'audio/flac',
    pdf: 'application/pdf', txt: 'text/plain', csv: 'text/csv',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  };
  return known[extension] ?? (
    type === 'video' ? 'video/mp4' :
      type === 'image' ? 'image/jpeg' :
        type === 'audio' ? 'audio/mpeg' : 'application/octet-stream'
  );
}

export async function pickChatMedia(): Promise<PickedChatMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is needed to attach a photo or video.');
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images', 'videos'],
    allowsEditing: false,
    quality: 0.85,
    videoMaxDuration: 180,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const isVideo = asset.type === 'video' || Boolean(asset.mimeType?.startsWith('video/'));
  if (asset.fileSize != null && asset.fileSize > CHAT_MEDIA_MAX_BYTES) {
    throw new Error('This file is over 50 MB. Select a smaller file.');
  }

  const fileName = asset.fileName ?? asset.uri.split('/').pop() ?? null;
  return {
    uri: asset.uri,
    type: isVideo ? 'video' : 'image',
    mimeType: asset.mimeType ?? inferMimeType(fileName, isVideo ? 'video' : 'image'),
    fileName,
    fileSize: asset.fileSize ?? null,
  };
}

export async function pickPostMedia(): Promise<PickedPostMedia | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error("Photo library permission is needed to choose a photo or video.");
  }

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ["images", "videos"],
    allowsEditing: false,
    quality: 0.85,
    videoMaxDuration: 180,
  });

  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  const isVideo =
    asset.type === "video" || Boolean(asset.mimeType?.startsWith("video/"));

  if (asset.fileSize != null && asset.fileSize > CHAT_MEDIA_MAX_BYTES) {
    throw new Error("Media is over 50 MB. Select a smaller file.");
  }

  const type: "image" | "video" = isVideo ? "video" : "image";
  const fileName = asset.fileName ?? asset.uri.split("/").pop() ?? null;

  return {
    uri: asset.uri,
    type,
    mimeType: asset.mimeType ?? inferMimeType(fileName, type),
    fileName,
    fileSize: asset.fileSize ?? null,
  };
}
export async function pickChatFile(): Promise<PickedChatMedia | null> {
  const result = await DocumentPicker.getDocumentAsync({
    type: '*/*',
    copyToCacheDirectory: true,
    multiple: false,
  });
  if (result.canceled || !result.assets[0]) return null;

  const asset = result.assets[0];
  if (asset.size != null && asset.size > CHAT_MEDIA_MAX_BYTES) {
    throw new Error('This file is over 50 MB. Select a smaller file.');
  }

  const mimeType = asset.mimeType ?? inferMimeType(asset.name, 'file');
  const type: PickedChatMedia['type'] = mimeType.startsWith('image/')
    ? 'image'
    : mimeType.startsWith('video/')
      ? 'video'
      : mimeType.startsWith('audio/')
        ? 'audio'
        : 'file';

  return {
    uri: asset.uri,
    type,
    mimeType,
    fileName: asset.name,
    fileSize: asset.size ?? null,
  };
}

/** Uploads to a private Supabase bucket. Returns the storage path, not a public URL. */
export async function uploadChatMedia(media: PickedChatMedia, userId: string): Promise<string> {
  const response = await fetch(media.uri);
  if (!response.ok) throw new Error('Could not read the selected media file.');
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength === 0) throw new Error('The selected file is empty.');
  if (buffer.byteLength > CHAT_MEDIA_MAX_BYTES) {
    throw new Error('This file is over 50 MB. Select a smaller photo or video.');
  }

  const sourceName = media.fileName ?? media.uri.split('?')[0];
  const candidateExtension = sourceName.lastIndexOf('.') > 0
    ? sourceName.split('.').pop()?.toLowerCase() ?? ''
    : '';
  const safeExtension = /^[a-z0-9]{1,8}$/.test(candidateExtension)
    ? candidateExtension
    : media.type === 'video' ? 'mp4' : media.type === 'audio' ? 'mp3' : media.type === 'file' ? 'bin' : 'jpg';
  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const path = `${userId}/chat-${uniquePart}.${safeExtension}`;

  const { error } = await supabase.storage.from('chat-media').upload(path, buffer, {
    contentType: media.mimeType || inferMimeType(media.fileName, media.type),
    upsert: false,
  });
  if (error) throw error;
  return path;
}

export async function getChatMediaUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from('chat-media').createSignedUrl(path, 60 * 60);
  if (error || !data?.signedUrl) throw error ?? new Error('Could not open this attachment.');
  return data.signedUrl;
}

export async function getChatMediaDownloadUrl(path: string, fileName: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('chat-media')
    .createSignedUrl(path, 60 * 60, { download: fileName });
  if (error || !data?.signedUrl) throw error ?? new Error('Could not download this attachment.');
  return data.signedUrl;
}

// Columns + related rows needed to draw a post card.
export const POST_SELECT =
  'id, user_id, image_url, video_url, media_type, media_path, media_mime_type, media_file_name, caption, created_at, profiles!posts_user_id_fkey(username, avatar_url), likes(user_id), comments(count)';

export async function pickImage(aspect: [number, number] = [1, 1]): Promise<string | null> {
  const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Photo library permission is needed to choose a photo.');
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    allowsEditing: true,
    aspect,
    quality: 0.7,
  });
  if (result.canceled || !result.assets[0]) return null;
  return result.assets[0].uri;
}

// Uploads a local image to the public "images" bucket under the user's own folder.
export async function uploadImage(uri: string, userId: string, kind: string): Promise<string> {
  const response = await fetch(uri);
  if (!response.ok) throw new Error('Could not read the selected image.');
  const buffer = await response.arrayBuffer();
  const fileName = uri.split('?')[0].split('/').pop() ?? '';
  const ext = (fileName.split('.').pop() || 'jpg').toLowerCase();
  const contentTypeByExt: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', heic: 'image/heic', heif: 'image/heif',
  };
  const contentType = contentTypeByExt[ext] ?? 'image/jpeg';
  const path = `${userId}/${kind}-${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from('images').upload(path, buffer, {
    contentType,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from('images').getPublicUrl(path).data.publicUrl;
}

export async function uploadPostMedia(
  media: PickedPostMedia,
  userId: string,
): Promise<{ path: string; publicUrl: string }> {
  const response = await fetch(media.uri);
  if (!response.ok) {
    throw new Error("Could not read the selected media file.");
  }

  const buffer = await response.arrayBuffer();

  if (buffer.byteLength === 0) {
    throw new Error("The selected media file is empty.");
  }

  if (buffer.byteLength > CHAT_MEDIA_MAX_BYTES) {
    throw new Error("Media is over 50 MB. Select a smaller file.");
  }

  const sourceName = media.fileName ?? media.uri.split("?")[0];
  const candidateExtension =
    sourceName.lastIndexOf(".") > 0
      ? sourceName.split(".").pop()?.toLowerCase() ?? ""
      : "";

  const extensionByMime: Record<string, string> = {
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/webp": "webp",
    "image/heic": "heic",
    "image/heif": "heif",
    "image/avif": "avif",
    "video/mp4": "mp4",
    "video/quicktime": "mov",
    "video/x-m4v": "m4v",
    "video/webm": "webm",
  };

  const extension = /^[a-z0-9]{1,8}$/.test(candidateExtension)
    ? candidateExtension
    : extensionByMime[media.mimeType] ??
      (media.type === "video" ? "mp4" : "jpg");

  const uniquePart = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const path = `${userId}/post-${uniquePart}.${extension}`;

  const { error } = await supabase.storage.from("images").upload(path, buffer, {
    contentType: media.mimeType || inferMimeType(media.fileName, media.type),
    upsert: false,
  });

  if (error) throw error;

  const publicUrl = supabase.storage.from("images").getPublicUrl(path).data.publicUrl;

  return { path, publicUrl };
}
export async function setLike(postId: string, userId: string, like: boolean) {
  if (like) {
    const { error } = await supabase.from('likes').insert({ post_id: postId, user_id: userId });
    if (error) throw error;
  } else {
    const { error } = await supabase.from('likes').delete().eq('post_id', postId).eq('user_id', userId);
    if (error) throw error;
  }
}

// Returns a copy of the post with the like toggled (for instant UI feedback).
export function toggleLikeLocally(post: Post, userId: string): Post {
  const likes = post.likes ?? [];
  const liked = likes.some((l) => l.user_id === userId);
  return {
    ...post,
    likes: liked ? likes.filter((l) => l.user_id !== userId) : [...likes, { user_id: userId }],
  };
}

export function timeAgo(iso: string): string {
  const seconds = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function dayAgoIso(): string {
  return new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
}
