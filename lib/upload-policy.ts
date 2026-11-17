export type DirectUploadRole = 'participant';

export type GroupUploadRole = 'owner' | 'admin' | 'member';

export type ChannelUploadRole = 'owner' | 'admin' | 'member';

export type UploadContext =
  | { type: 'direct'; role: DirectUploadRole }
  | { type: 'group'; role: GroupUploadRole }
  | { type: 'channel'; role: ChannelUploadRole };

export type UploadDenialCode =
  | 'EMPTY_FILE'
  | 'INVALID_FILE_SIZE'
  | 'CHANNEL_READ_ONLY'
  | 'FILE_TOO_LARGE';

export type UploadPolicy = {
  canUpload: boolean;
  maxFileSizeBytes: number | null;
  maxFileSizeLabel: string;
  unlimitedAtApplicationLevel: boolean;
};

export type UploadValidationResult =
  | { ok: true; policy: UploadPolicy }
  | {
      ok: false;
      policy: UploadPolicy;
      code: UploadDenialCode;
      message: string;
    };

/** Decimal GB for existing direct/group messaging policies. */
export const UPLOAD_LIMITS = {
  DIRECT_CHAT: 3_000_000_000,
  GROUP_MEMBER: 3_000_000_000,
  ADMIN: 10_000_000_000,
  CHANNEL_MEDIA: 50 * 1024 * 1024,
} as const;

const NO_APPLICATION_LIMIT: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: null,
  maxFileSizeLabel: 'No app-level limit',
  unlimitedAtApplicationLevel: true,
};

const DIRECT_CHAT_POLICY: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: UPLOAD_LIMITS.DIRECT_CHAT,
  maxFileSizeLabel: '3 GB',
  unlimitedAtApplicationLevel: false,
};

const GROUP_MEMBER_POLICY: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: UPLOAD_LIMITS.GROUP_MEMBER,
  maxFileSizeLabel: '3 GB',
  unlimitedAtApplicationLevel: false,
};

const ADMIN_POLICY: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: UPLOAD_LIMITS.ADMIN,
  maxFileSizeLabel: '10 GB',
  unlimitedAtApplicationLevel: false,
};

/** Free Supabase project + current community-media bucket: 50 MiB per file. */
const CHANNEL_OWNER_POLICY: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: UPLOAD_LIMITS.CHANNEL_MEDIA,
  maxFileSizeLabel: '50 MB',
  unlimitedAtApplicationLevel: false,
};

const CHANNEL_ADMIN_POLICY: UploadPolicy = {
  canUpload: true,
  maxFileSizeBytes: UPLOAD_LIMITS.CHANNEL_MEDIA,
  maxFileSizeLabel: '50 MB',
  unlimitedAtApplicationLevel: false,
};

const CHANNEL_READ_ONLY_POLICY: UploadPolicy = {
  canUpload: false,
  maxFileSizeBytes: 0,
  maxFileSizeLabel: 'Read only',
  unlimitedAtApplicationLevel: false,
};

export function getUploadPolicy(context: UploadContext): UploadPolicy {
  switch (context.type) {
    case 'direct':
      return DIRECT_CHAT_POLICY;

    case 'group':
      switch (context.role) {
        case 'owner': return NO_APPLICATION_LIMIT;
        case 'admin': return ADMIN_POLICY;
        case 'member': return GROUP_MEMBER_POLICY;
        default: return GROUP_MEMBER_POLICY;
      }

    case 'channel':
      switch (context.role) {
        case 'owner': return CHANNEL_OWNER_POLICY;
        case 'admin': return CHANNEL_ADMIN_POLICY;
        case 'member': return CHANNEL_READ_ONLY_POLICY;
        default: return CHANNEL_READ_ONLY_POLICY;
      }

    default:
      return {
        canUpload: false,
        maxFileSizeBytes: 0,
        maxFileSizeLabel: 'Unavailable',
        unlimitedAtApplicationLevel: false,
      };
  }
}

export function formatFileSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return 'Unknown size';
  if (bytes === 0) return '0 B';

  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const unitIndex = Math.min(
    Math.floor(Math.log10(bytes) / 3),
    units.length - 1,
  );
  const value = bytes / 1000 ** unitIndex;
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;

  return `${value.toFixed(digits)} ${units[unitIndex]}`;
}

export function validateUpload(
  context: UploadContext,
  fileSizeBytes: number,
): UploadValidationResult {
  const policy = getUploadPolicy(context);

  if (
    !Number.isFinite(fileSizeBytes) ||
    !Number.isSafeInteger(fileSizeBytes) ||
    fileSizeBytes < 0
  ) {
    return {
      ok: false,
      policy,
      code: 'INVALID_FILE_SIZE',
      message: 'The selected file has an invalid size.',
    };
  }

  if (fileSizeBytes === 0) {
    return {
      ok: false,
      policy,
      code: 'EMPTY_FILE',
      message: 'Empty files cannot be uploaded.',
    };
  }

  if (!policy.canUpload) {
    return {
      ok: false,
      policy,
      code: 'CHANNEL_READ_ONLY',
      message:
        'Members cannot publish files in this channel. Only the owner and admins can post.',
    };
  }

  if (
    policy.maxFileSizeBytes !== null &&
    fileSizeBytes > policy.maxFileSizeBytes
  ) {
    return {
      ok: false,
      policy,
      code: 'FILE_TOO_LARGE',
      message:
        `This file is ${formatFileSize(fileSizeBytes)}. ` +
        `Your limit for this conversation is ${policy.maxFileSizeLabel}.`,
    };
  }

  return { ok: true, policy };
}

export function getUploadLimitLabel(context: UploadContext): string {
  const policy = getUploadPolicy(context);

  if (!policy.canUpload) {
    return 'Posting is restricted to channel admins and owner.';
  }

  if (policy.unlimitedAtApplicationLevel) {
    return 'No app-level file size limit. Storage provider limits still apply.';
  }

  return `${policy.maxFileSizeLabel} per file`;
}
