export type SettingsItem = {
  title: string;
  description: string;
  keywords?: string;
  available?: boolean;
};

export type SettingsSection = {
  id: string;
  title: string;
  description: string;
  items: SettingsItem[];
};

export const settingsSections: SettingsSection[] = [
  {
    id: 'account',
    title: 'Account',
    description: 'Your profile and account information.',
    items: [
      {
        title: 'Edit profile',
        description: 'Update your name, username, bio, and photo.',
        keywords: 'identity avatar picture',
        available: true,
      },
      {
        title: 'Account information',
        description: 'View your email, verification, and account creation date.',
        available: true,
      },
    ],
  },
  {
    id: 'security',
    title: 'Security & login',
    description: 'Manage your sign-in details and active session.',
    items: [
      {
        title: 'Change password',
        description: 'Set a new password for your Lumo account.',
        available: true,
      },
      {
        title: 'Change email',
        description: 'Update your email address with verification.',
        available: true,
      },
      {
        title: 'Email verification',
        description: 'Check whether your current email is verified.',
        available: true,
      },
      {
        title: 'Devices and login activity',
        description: 'Device history and remote session management are not available.',
        available: false,
      },
      {
        title: 'Two-factor authentication',
        description: 'This authentication flow is not configured for Lumo.',
        available: false,
      },
    ],
  },
  {
    id: 'privacy',
    title: 'Privacy',
    description: 'Control profile discovery and who can interact with you.',
    items: [
      {
        title: 'Private account and follow requests',
        description: 'Requires persistent privacy settings and follow-request enforcement.',
      },
      {
        title: 'Direct messages and read receipts',
        description: 'Per-user message permissions and receipt controls are not configured.',
      },
      {
        title: 'Mentions, tags, and story replies',
        description: 'These permissions are not currently enforced by the app.',
      },
      {
        title: 'Comments and engagement visibility',
        description: 'Comment permissions and engagement hiding are not configured.',
      },
      {
        title: 'Blocked, muted, and restricted accounts',
        description: 'Lumo does not have these account relationship controls yet.',
      },
      {
        title: 'Hidden words and content filters',
        description: 'Comment filtering and hidden-word rules are not implemented.',
      },
    ],
  },
  {
    id: 'notifications',
    title: 'Notifications',
    description: 'Notification controls require a configured delivery system.',
    items: [
      {
        title: 'Push and in-app notifications',
        description: 'Push and in-app notification delivery is not configured.',
      },
      {
        title: 'Likes, comments, follows, and mentions',
        description: 'Per-category preferences are unavailable until notifications exist.',
      },
      {
        title: 'Messages and story activity',
        description: 'Message and story notification preferences are not available.',
      },
      {
        title: 'Email notifications and quiet hours',
        description: 'Email notifications and scheduled quiet hours are not configured.',
      },
    ],
  },
  {
    id: 'appearance',
    title: 'Appearance',
    description: 'Lumo currently uses its OLED-dark visual design.',
    items: [
      {
        title: 'OLED dark theme',
        description: 'The current app appearance uses a dark theme.',
        available: true,
      },
      {
        title: 'Theme, accent, and text size',
        description: 'Other themes and text scaling are not applied consistently across the app.',
      },
      {
        title: 'Reduced motion and layout density',
        description: 'These accessibility preferences are not yet wired into app components.',
      },
      {
        title: 'Language and date formatting',
        description: 'Localization settings are unavailable until translations are implemented.',
      },
    ],
  },
  {
    id: 'messaging',
    title: 'Messaging',
    description: 'Messaging preference controls are not configured.',
    items: [
      {
        title: 'Message requests and who can message you',
        description: 'The current messaging system has no request or per-user permission model.',
      },
      {
        title: 'Typing indicators and read receipts',
        description: 'These messaging features are not implemented.',
      },
      {
        title: 'Media downloads and link previews',
        description: 'Automatic media download and link preview preferences are not implemented.',
      },
      {
        title: 'Muted and archived conversations',
        description: 'Conversation mute and archive controls are not implemented.',
      },
    ],
  },
  {
    id: 'stories',
    title: 'Stories & content',
    description: 'Stories continue to expire automatically after 24 hours.',
    items: [
      {
        title: 'Story audience and hidden viewers',
        description: 'Custom story audiences and hide-from lists are not configured.',
      },
      {
        title: 'Story replies and reactions',
        description: 'Per-user story reply and reaction permissions are not configured.',
      },
      {
        title: 'Story archive',
        description: 'Stories are not archived after their 24-hour visibility period.',
      },
      {
        title: 'Feed recommendations and sensitive content',
        description: 'Recommendation and content sensitivity preferences are not implemented.',
      },
    ],
  },
  {
    id: 'data',
    title: 'Data & storage',
    description: 'Manage data requests and local storage where supported.',
    items: [
      {
        title: 'Data export',
        description: 'A secure export request workflow is not configured.',
      },
      {
        title: 'Cache and storage usage',
        description: 'The app does not currently measure or manage a local media cache.',
      },
      {
        title: 'Media quality and data saver',
        description: 'Upload quality and network-saving preferences are not implemented.',
      },
      {
        title: 'Deactivate or delete account',
        description: 'Permanent deletion requires a secure server-side workflow and verification.',
      },
    ],
  },
  {
    id: 'help',
    title: 'Help & legal',
    description: 'Support and legal destinations are not configured in this app.',
    items: [
      {
        title: 'Help center and contact support',
        description: 'No support URL or contact destination is configured.',
      },
      {
        title: 'Report a problem and send feedback',
        description: 'There is no configured submission service, so reports cannot be sent.',
      },
      {
        title: 'Privacy policy and terms',
        description: 'Legal document destinations have not been configured.',
      },
    ],
  },
];
