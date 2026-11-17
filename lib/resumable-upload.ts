
import AsyncStorage from '@react-native-async-storage/async-storage';
import { File } from 'expo-file-system';
import { Platform } from 'react-native';

const TUS_VERSION = '1.0.0';
const CHUNK_SIZE = 6 * 1024 * 1024;
const RETRY_DELAYS = [0, 3000, 5000, 10000, 20000];

export type UploadStatus =
  | 'preparing'
  | 'uploading'
  | 'paused'
  | 'retrying'
  | 'completed';

export type UploadProgress = {
  status: UploadStatus;
  bytesUploaded: number;
  totalBytes: number;
  percent: number;
  bytesPerSecond: number;
  etaSeconds: number | null;
};

export type ResumableUploadOptions = {
  id: string;
  userId: string;

  fileUri: string;
  fileName: string;
  contentType: string;

  bucketName: string;
  objectName: string;
  endpoint: string;

  /**
   * Return fresh headers for each request.
   * These must come from the server-issued upload grant.
   */
  getHeaders: () => Promise<Record<string, string>>;

  onProgress?: (progress: UploadProgress) => void;
};

type StoredUploadSession = {
  version: 1;
  id: string;
  userId: string;
  fileUri: string;
  fileSize: number;
  bucketName: string;
  objectName: string;
  uploadUrl: string;
  createdAt: string;
};

class TusRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = 'TusRequestError';
  }
}

function getSessionKey(id: string, userId: string): string {
  return `lumo:resumable-upload:v1:${userId}:${id}`;
}

function encodeBase64Utf8(value: string): string {
  const encoded = encodeURIComponent(value);
  const bytes: number[] = [];

  for (let i = 0; i < encoded.length;) {
    if (encoded[i] === '%') {
      bytes.push(
        Number.parseInt(encoded.slice(i + 1, i + 3), 16),
      );
      i += 3;
    } else {
      bytes.push(encoded.charCodeAt(i));
      i += 1;
    }
  }

  const alphabet =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

  let output = '';

  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const hasB = i + 1 < bytes.length;
    const hasC = i + 2 < bytes.length;

    const b = hasB ? bytes[i + 1] : 0;
    const c = hasC ? bytes[i + 2] : 0;

    output += alphabet[a >> 2];
    output += alphabet[((a & 3) << 4) | (b >> 4)];
    output += hasB
      ? alphabet[((b & 15) << 2) | (c >> 6)]
      : '=';
    output += hasC ? alphabet[c & 63] : '=';
  }

  return output;
}

function createTusMetadata(
  values: Record<string, string>,
): string {
  return Object.entries(values)
    .map(([key, value]) => {
      if (!/^[a-zA-Z0-9_-]+$/.test(key)) {
        throw new Error(`Invalid TUS metadata key: ${key}`);
      }

      return `${key} ${encodeBase64Utf8(value)}`;
    })
    .join(',');
}

function createRequestError(
  response: Response,
  operation: string,
): TusRequestError {
  return new TusRequestError(
    `${operation} failed (${response.status}).`,
    response.status,
  );
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

export class ResumableUpload {
  private paused = false;
  private cancelled = false;

  private activeController: AbortController | null = null;
  private resumeWaiters: Array<() => void> = [];

  private operation: Promise<string> | null = null;
  private completedPath: string | null = null;

  private currentProgress: UploadProgress | null = null;

  constructor(
    private readonly options: ResumableUploadOptions,
  ) {}

  start(): Promise<string> {
    if (this.completedPath) {
      return Promise.resolve(this.completedPath);
    }

    if (this.operation) {
      return this.operation;
    }

    this.cancelled = false;

    this.operation = this.run().finally(() => {
      this.operation = null;
    });

    return this.operation;
  }

  pause(): void {
    if (this.cancelled || this.completedPath) {
      return;
    }

    this.paused = true;
    this.activeController?.abort();

    if (this.currentProgress) {
      this.emit({
        ...this.currentProgress,
        status: 'paused',
      });
    }
  }

  resume(): void {
    if (this.cancelled || this.completedPath) {
      return;
    }

    this.paused = false;

    const waiters = [...this.resumeWaiters];
    this.resumeWaiters = [];

    waiters.forEach((resolve) => resolve());

    if (this.currentProgress) {
      this.emit({
        ...this.currentProgress,
        status: 'uploading',
      });
    }
  }

  async cancel(): Promise<void> {
    this.cancelled = true;
    this.paused = false;

    this.activeController?.abort();

    const waiters = [...this.resumeWaiters];
    this.resumeWaiters = [];

    waiters.forEach((resolve) => resolve());

    await AsyncStorage.removeItem(
      getSessionKey(this.options.id, this.options.userId),
    );
  }

  private emit(progress: UploadProgress): void {
    this.currentProgress = progress;

    try {
      this.options.onProgress?.(progress);
    } catch {
      // UI callback errors must not interrupt the upload.
    }
  }

  private throwIfCancelled(): void {
    if (this.cancelled) {
      throw new Error('Upload cancelled.');
    }
  }

  private async waitUntilResumed(): Promise<void> {
    while (this.paused && !this.cancelled) {
      await new Promise<void>((resolve) => {
        this.resumeWaiters.push(resolve);
      });
    }

    this.throwIfCancelled();
  }

  private async getHeaders(): Promise<Record<string, string>> {
    const headers = await this.options.getHeaders();

    return {
      ...headers,
      'Tus-Resumable': TUS_VERSION,
    };
  }

  private async loadSession(
    fileSize: number,
  ): Promise<StoredUploadSession | null> {
    const key = getSessionKey(
      this.options.id,
      this.options.userId,
    );

    const stored = await AsyncStorage.getItem(key);

    if (!stored) {
      return null;
    }

    let session: StoredUploadSession;

    try {
      session = JSON.parse(stored) as StoredUploadSession;
    } catch {
      await AsyncStorage.removeItem(key);
      return null;
    }

    const matches =
      session.version === 1 &&
      session.id === this.options.id &&
      session.userId === this.options.userId &&
      session.fileUri === this.options.fileUri &&
      session.fileSize === fileSize &&
      session.bucketName === this.options.bucketName &&
      session.objectName === this.options.objectName &&
      typeof session.uploadUrl === 'string';

    if (!matches) {
      throw new Error(
        'This upload ID is already associated with a different file.',
      );
    }

    return session;
  }

  private async saveSession(
    uploadUrl: string,
    fileSize: number,
  ): Promise<void> {
    const session: StoredUploadSession = {
      version: 1,
      id: this.options.id,
      userId: this.options.userId,
      fileUri: this.options.fileUri,
      fileSize,
      bucketName: this.options.bucketName,
      objectName: this.options.objectName,
      uploadUrl,
      createdAt: new Date().toISOString(),
    };

    await AsyncStorage.setItem(
      getSessionKey(this.options.id, this.options.userId),
      JSON.stringify(session),
    );
  }

  private async createUpload(
    fileSize: number,
  ): Promise<string> {
    const metadata = createTusMetadata({
      bucketName: this.options.bucketName,
      objectName: this.options.objectName,
      contentType: this.options.contentType,
      cacheControl: '3600',
      filename: this.options.fileName,
    });

    const headers = await this.getHeaders();

    const response = await fetch(this.options.endpoint, {
      method: 'POST',
      headers: {
        ...headers,
        'Upload-Length': String(fileSize),
        'Upload-Metadata': metadata,
      },
    });

    if (response.status !== 201) {
      throw createRequestError(response, 'Creating upload');
    }

    const location = response.headers.get('Location');

    if (!location) {
      throw new Error(
        'Storage did not return a resumable upload URL.',
      );
    }

    const uploadUrl = new URL(
      location,
      this.options.endpoint,
    ).toString();

    await this.saveSession(uploadUrl, fileSize);

    return uploadUrl;
  }

  private async getServerOffset(
    uploadUrl: string,
  ): Promise<number> {
    const headers = await this.getHeaders();

    const response = await fetch(uploadUrl, {
      method: 'HEAD',
      headers: {
        ...headers,
        'Cache-Control': 'no-store',
      },
    });

    if (!response.ok) {
      if (response.status === 404 || response.status === 410) {
        throw new Error(
          'The resumable upload session has expired. Start a new upload.',
        );
      }

      throw createRequestError(response, 'Checking upload progress');
    }

    const value = response.headers.get('Upload-Offset');

    if (value === null) {
      throw new Error(
        'Storage did not return the current upload offset.',
      );
    }

    const offset = Number(value);

    if (!Number.isSafeInteger(offset) || offset < 0) {
      throw new Error('Storage returned an invalid upload offset.');
    }

    return offset;
  }

  private async uploadChunk(
    uploadUrl: string,
    offset: number,
    chunk: Uint8Array,
  ): Promise<number> {
    const headers = await this.getHeaders();

    const chunkBuffer = chunk.buffer.slice(
      chunk.byteOffset,
      chunk.byteOffset + chunk.byteLength,
    ) as ArrayBuffer;

    const body = new Blob([chunkBuffer], {
      type: 'application/offset+octet-stream',
    });

    const controller = new AbortController();
    this.activeController = controller;

    try {
      const response = await fetch(uploadUrl, {
        method: 'PATCH',
        headers: {
          ...headers,
          'Upload-Offset': String(offset),
          'Content-Type': 'application/offset+octet-stream',
        },
        body,
        signal: controller.signal,
      });

      if (!response.ok) {
        throw createRequestError(response, 'Uploading file chunk');
      }

      const value = response.headers.get('Upload-Offset');

      if (value === null) {
        throw new Error(
          'Storage did not confirm the uploaded chunk.',
        );
      }

      const nextOffset = Number(value);

      if (
        !Number.isSafeInteger(nextOffset) ||
        nextOffset !== offset + chunk.byteLength
      ) {
        throw new Error(
          'Storage returned an unexpected upload offset.',
        );
      }

      return nextOffset;
    } finally {
      if (this.activeController === controller) {
        this.activeController = null;
      }
    }
  }

  private async run(): Promise<string> {
    const isWeb = Platform.OS === 'web';

    let browserBlob: Blob | null = null;
    let nativeHandle: ReturnType<File['open']> | null = null;
    let totalBytes = 0;

    if (isWeb) {
      const response = await fetch(this.options.fileUri);

      if (!response.ok) {
        throw new Error(
          `Selected browser file could not be read (${response.status}).`,
        );
      }

      browserBlob = await response.blob();
      totalBytes = browserBlob.size;
    } else {
      const file = new File(this.options.fileUri);

      if (!file.exists) {
        throw new Error('The selected file is no longer available.');
      }

      totalBytes = file.size;

      if (Number.isSafeInteger(totalBytes) && totalBytes > 0) {
        nativeHandle = file.open();
      }
    }

    if (
      !Number.isSafeInteger(totalBytes) ||
      totalBytes <= 0
    ) {
      throw new Error(
        'The selected file is empty or has an invalid size.',
      );
    }

    try {
      this.emit({
        status: 'preparing',
        bytesUploaded: 0,
        totalBytes,
        percent: 0,
        bytesPerSecond: 0,
        etaSeconds: null,
      });

      const savedSession = await this.loadSession(totalBytes);

      const uploadUrl = savedSession
        ? savedSession.uploadUrl
        : await this.createUpload(totalBytes);

      let bytesUploaded = 0;
      let conflictAttempts = 0;

      let lastProgressBytes = 0;
      let lastProgressTime = Date.now();

      while (bytesUploaded < totalBytes) {
        await this.waitUntilResumed();

        let retryAttempt = 0;

        while (true) {
          await this.waitUntilResumed();

          try {
            const serverOffset = await this.getServerOffset(uploadUrl);

            if (serverOffset > totalBytes) {
              throw new Error(
                'Storage offset exceeds the selected file size.',
              );
            }

            bytesUploaded = serverOffset;

            if (bytesUploaded === totalBytes) {
              break;
            }

            const chunkLength = Math.min(
              CHUNK_SIZE,
              totalBytes - bytesUploaded,
            );

            let chunk: Uint8Array;

            if (isWeb) {
              if (!browserBlob) {
                throw new Error('Browser file is unavailable.');
              }

              const buffer = await browserBlob
                .slice(bytesUploaded, bytesUploaded + chunkLength)
                .arrayBuffer();

              chunk = new Uint8Array(buffer);
            } else {
              if (!nativeHandle) {
                throw new Error('Native file reader is unavailable.');
              }

              nativeHandle.offset = bytesUploaded;
              chunk = await nativeHandle.readBytes(chunkLength);
            }

            if (chunk.byteLength !== chunkLength) {
              throw new Error(
                'Could not read the next file chunk completely.',
              );
            }

            const nextOffset = await this.uploadChunk(
              uploadUrl,
              bytesUploaded,
              chunk,
            );

            conflictAttempts = 0;

            const now = Date.now();

            const elapsedSeconds = Math.max(
              (now - lastProgressTime) / 1000,
              0.001,
            );

            const bytesPerSecond =
              (nextOffset - lastProgressBytes) / elapsedSeconds;

            const remainingBytes = totalBytes - nextOffset;

            const etaSeconds =
              bytesPerSecond > 0
                ? Math.ceil(remainingBytes / bytesPerSecond)
                : null;

            bytesUploaded = nextOffset;
            lastProgressBytes = nextOffset;
            lastProgressTime = now;

            this.emit({
              status: 'uploading',
              bytesUploaded,
              totalBytes,
              percent: Math.min(
                100,
                (bytesUploaded / totalBytes) * 100,
              ),
              bytesPerSecond,
              etaSeconds,
            });

            break;
          } catch (error) {
            this.throwIfCancelled();

            if (this.paused) {
              continue;
            }

            if (
              error instanceof TusRequestError &&
              error.status === 409 &&
              conflictAttempts < 3
            ) {
              conflictAttempts += 1;
              await delay(750);
              continue;
            }

            if (
              error instanceof TusRequestError &&
              error.status >= 400 &&
              error.status < 500 &&
              error.status !== 408 &&
              error.status !== 429
            ) {
              throw error;
            }

            if (retryAttempt >= RETRY_DELAYS.length - 1) {
              throw error;
            }

            const wait = RETRY_DELAYS[retryAttempt];
            retryAttempt += 1;

            this.emit({
              status: 'retrying',
              bytesUploaded,
              totalBytes,
              percent: (bytesUploaded / totalBytes) * 100,
              bytesPerSecond: 0,
              etaSeconds: null,
            });

            await delay(wait);
          }
        }
      }

      this.throwIfCancelled();

      await AsyncStorage.removeItem(
        getSessionKey(this.options.id, this.options.userId),
      );

      this.completedPath = this.options.objectName;

      this.emit({
        status: 'completed',
        bytesUploaded: totalBytes,
        totalBytes,
        percent: 100,
        bytesPerSecond: 0,
        etaSeconds: 0,
      });

      return this.options.objectName;
    } finally {
      nativeHandle?.close();
    }
  }
}
