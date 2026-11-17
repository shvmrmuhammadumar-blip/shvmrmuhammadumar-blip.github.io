export type ID = string;

export type MessageType = "text" | "image" | "video" | "audio" | "file";

export type MediaType = "image" | "video";

export type Profile = {
  id: ID;
  username: string | null;
  avatar_url: string | null;
  full_name?: string | null;
  bio?: string | null;
  website?: string | null;
  is_private?: boolean;
  created_at?: string;
  updated_at?: string;
  followers_count?: number;
  following_count?: number;
  posts_count?: number;
};

export type UserProfile = Profile;

export type MiniProfile = Partial<Pick<Profile, 'id'>> & Pick<Profile, 'username' | 'avatar_url'>;

export type Message = {
  id: string;
  sender_id: string;
  receiver_id: string;
  body: string | null;
  created_at: string;
  read_at?: string | null;
  edited_at?: string | null;
  reply_to?: string | null;
  forwarded_from?: string | null;
  forwarded_from_type?: "personal" | "group" | "channel" | "post" | null;
  forwarded_from_id?: string | null;
  forwarded_from_sender?: string | null;
  forwarded_from_chat?: string | null;
  reactions?: MessageReaction[];
  message_reactions?: MessageReaction[] | null;
  message_type?: MessageType | null;
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_url?: string | null;
};

export type MessageReaction = {
  user_id: string;
  reaction: string;
};

export type PostLike = {
  id?: ID;
  post_id?: ID;
  user_id: ID;
  created_at?: string;
};

export type PostCommentCount = {
  count: number;
};

export type Post = {
  id: ID;
  user_id: ID;
  caption?: string | null;
  body?: string | null;

  image_url?: string | null;
  video_url?: string | null;
  media_url?: string | null;
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  media_type?: MediaType | null;
  media_urls?: string[] | null;

  created_at: string;
  updated_at?: string | null;

  likes_count?: number;
  comments_count?: number;
  is_liked?: boolean;
  liked_by_me?: boolean;

  likes?: PostLike[] | null;
  comments?: PostCommentCount[] | null;

  profile?: Profile | null;
  profiles?: Profile | null;
  user?: Profile | null;
};

export type PostWithProfile = Post & {
  profile: Profile | null;
};

export type Comment = {
  id: ID;
  post_id: ID;
  user_id: ID;
  body: string | null;
  parent_id?: ID | null;
  comment_type?: "text" | "image" | "sticker";
  media_path?: string | null;
  media_mime_type?: string | null;
  media_file_name?: string | null;
  content?: string;
  created_at: string;
  updated_at?: string | null;
  profile?: Profile | null;
  profiles?: Profile | null;
  user?: Profile | null;
};

export type CommentWithProfile = Comment & {
  profile: Profile | null;
};

export type Like = PostLike;

export type Follow = {
  id?: ID;
  follower_id: ID;
  following_id: ID;
  created_at?: string;
};

export type FollowWithProfile = Follow & {
  profile?: Profile | null;
  user?: Profile | null;
};

export type Story = {
  id: ID;
  user_id: ID;
  image_url?: string | null;
  media_url?: string | null;
  media_path?: string | null;
  media_type?: MediaType | null;
  caption?: string | null;
  created_at: string;
  expires_at?: string | null;
  profile?: Profile | null;
  profiles?: Profile | null;
};

export type NotificationType =
  | "like"
  | "comment"
  | "follow"
  | "mention"
  | "message"
  | "story";

export type Notification = {
  id: ID;
  user_id: ID;
  actor_id?: ID | null;
  type: NotificationType;
  post_id?: ID | null;
  comment_id?: ID | null;
  is_read?: boolean;
  created_at: string;
  actor?: Profile | null;
};

export type Conversation = {
  id?: ID;
  user_id: ID;
  other_user_id: ID;
  last_message?: string | null;
  last_message_at?: string | null;
  profile?: Profile | null;
  unread_count?: number;
};

export type PickedMedia = {
  uri: string;
  type: MediaType;
  mimeType: string;
  fileName: string | null;
  fileSize: number | null;
};
