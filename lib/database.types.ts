export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      user_locations: {
        Row: {
          user_id: string
          latitude: number
          longitude: number
          accuracy_meters: number | null
          heading_degrees: number | null
          speed_mps: number | null
          sharing_enabled: boolean
          updated_at: string
        }
        Insert: {
          user_id: string
          latitude: number
          longitude: number
          accuracy_meters?: number | null
          heading_degrees?: number | null
          speed_mps?: number | null
          sharing_enabled?: boolean
          updated_at?: string
        }
        Update: {
          user_id?: string
          latitude?: number
          longitude?: number
          accuracy_meters?: number | null
          heading_degrees?: number | null
          speed_mps?: number | null
          sharing_enabled?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_settings: {
        Row: {
          user_id: string
          account_type: string
          category: string | null
          contact_email: string | null
          website_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          user_id: string
          account_type?: string
          category?: string | null
          contact_email?: string | null
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          user_id?: string
          account_type?: string
          category?: string | null
          contact_email?: string | null
          website_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_settings_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_plans: {
        Row: {
          id: string
          user_id: string
          title: string
          notes: string
          content_type: string
          scheduled_at: string | null
          status: string
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          title: string
          notes?: string
          content_type?: string
          scheduled_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string
          title?: string
          notes?: string
          content_type?: string
          scheduled_at?: string | null
          status?: string
          created_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_content_events: {
        Row: {
          id: string
          owner_id: string
          viewer_id: string
          content_type: string
          content_id: string
          session_key: string
          watch_ms: number
          content_duration_ms: number
          event_type: string
          occurred_at: string
        }
        Insert: {
          id?: string
          owner_id: string
          viewer_id: string
          content_type: string
          content_id: string
          session_key: string
          watch_ms?: number
          content_duration_ms?: number
          event_type?: string
          occurred_at?: string
        }
        Update: {
          id?: string
          owner_id?: string
          viewer_id?: string
          content_type?: string
          content_id?: string
          session_key?: string
          watch_ms?: number
          content_duration_ms?: number
          event_type?: string
          occurred_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "creator_content_events_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "creator_content_events_viewer_id_fkey"
            columns: ["viewer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_members: {
        Row: {
          channel_id: string
          joined_at: string
          notifications_enabled: boolean
          role: string
          user_id: string
        }
        Insert: {
          channel_id: string
          joined_at?: string
          notifications_enabled?: boolean
          role?: string
          user_id: string
        }
        Update: {
          channel_id?: string
          joined_at?: string
          notifications_enabled?: boolean
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_members_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_hidden_for: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_hidden_for_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_post_hidden_for_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_post_reactions: {
        Row: {
          channel_post_id: string
          created_at: string
          reaction: string
          user_id: string
        }
        Insert: {
          channel_post_id: string
          created_at?: string
          reaction: string
          user_id: string
        }
        Update: {
          channel_post_id?: string
          created_at?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_post_reactions_channel_post_id_fkey"
            columns: ["channel_post_id"]
            isOneToOne: false
            referencedRelation: "channel_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_post_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channel_posts: {
        Row: {
          body: string | null
          channel_id: string
          created_at: string
          edited_at: string | null
          forwarded_from_chat: string | null
          forwarded_from_id: string | null
          forwarded_from_sender: string | null
          forwarded_from_type: string | null
          id: string
          is_pinned: boolean
          media_file_name: string | null
          media_mime_type: string | null
          media_path: string | null
          message_type: string
          pinned_at: string | null
          pinned_by: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          channel_id: string
          created_at?: string
          edited_at?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          channel_id?: string
          created_at?: string
          edited_at?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "channel_posts_channel_id_fkey"
            columns: ["channel_id"]
            isOneToOne: false
            referencedRelation: "channels"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "channel_posts_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      channels: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "channels_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_groups: {
        Row: {
          avatar_url: string | null
          created_at: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          owner_id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          owner_id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          body: string | null
          comment_type: string
          created_at: string
          id: string
          media_file_name: string | null
          media_mime_type: string | null
          media_path: string | null
          parent_id: string | null
          post_id: string
          user_id: string
        }
        Insert: {
          body?: string | null
          comment_type?: string
          created_at?: string
          id?: string
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          parent_id?: string | null
          post_id: string
          user_id: string
        }
        Update: {
          body?: string | null
          comment_type?: string
          created_at?: string
          id?: string
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          parent_id?: string | null
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_parent_same_post_fkey"
            columns: ["parent_id", "post_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id", "post_id"]
          },
        ]
      },
      follows: {
        Row: {
          created_at: string
          follower_id: string
          following_id: string
        }
        Insert: {
          created_at?: string
          follower_id: string
          following_id: string
        }
        Update: {
          created_at?: string
          follower_id?: string
          following_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_members: {
        Row: {
          added_by: string | null
          group_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          added_by?: string | null
          group_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          added_by?: string | null
          group_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_members_added_by_fkey"
            columns: ["added_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_message_hidden_for: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_message_hidden_for_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_message_hidden_for_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_message_reactions: {
        Row: {
          created_at: string
          group_message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          group_message_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          group_message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_message_reactions_group_message_id_fkey"
            columns: ["group_message_id"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      group_messages: {
        Row: {
          body: string | null
          created_at: string
          edited_at: string | null
          forwarded_from_chat: string | null
          forwarded_from_id: string | null
          forwarded_from_sender: string | null
          forwarded_from_type: string | null
          group_id: string
          id: string
          is_pinned: boolean
          media_file_name: string | null
          media_mime_type: string | null
          media_path: string | null
          message_type: string
          pinned_at: string | null
          pinned_by: string | null
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          group_id: string
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          group_id?: string
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "chat_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "group_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      likes: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_hidden_for: {
        Row: {
          created_at: string
          message_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_hidden_for_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_hidden_for_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_reactions: {
        Row: {
          created_at: string
          message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          message_id: string
          reaction: string
          user_id: string
        }
        Update: {
          created_at?: string
          message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          created_at: string
          edited_at: string | null
          forwarded_from: string | null
          forwarded_from_chat: string | null
          forwarded_from_id: string | null
          forwarded_from_sender: string | null
          forwarded_from_type: string | null
          id: string
          is_pinned: boolean
          media_file_name: string | null
          media_mime_type: string | null
          media_path: string | null
          message_type: string
          pinned_at: string | null
          pinned_by: string | null
          read_at: string | null
          receiver_id: string
          reply_to: string | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          forwarded_from?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          receiver_id: string
          reply_to?: string | null
          sender_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          edited_at?: string | null
          forwarded_from?: string | null
          forwarded_from_chat?: string | null
          forwarded_from_id?: string | null
          forwarded_from_sender?: string | null
          forwarded_from_type?: string | null
          id?: string
          is_pinned?: boolean
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          message_type?: string
          pinned_at?: string | null
          pinned_by?: string | null
          read_at?: string | null
          receiver_id?: string
          reply_to?: string | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_forwarded_from_fkey"
            columns: ["forwarded_from"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_pinned_by_fkey"
            columns: ["pinned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_reply_to_fkey"
            columns: ["reply_to"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          actor_id: string | null
          comment_id: string | null
          created_at: string
          id: string
          is_read: boolean
          post_id: string | null
          type: string
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          type: string
          user_id: string
        }
        Update: {
          actor_id?: string | null
          comment_id?: string | null
          created_at?: string
          id?: string
          is_read?: boolean
          post_id?: string | null
          type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_roles: {
        Row: {
          created_at: string
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          caption: string | null
          created_at: string
          id: string
          image_url: string | null
          media_file_name: string | null
          media_mime_type: string | null
          media_path: string | null
          media_type: string
          user_id: string
          video_url: string | null
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          media_type?: string
          user_id: string
          video_url?: string | null
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          image_url?: string | null
          media_file_name?: string | null
          media_mime_type?: string | null
          media_path?: string | null
          media_type?: string
          user_id?: string
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string
          full_name: string | null
          id: string
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          username?: string
        }
        Relationships: []
      }
      saved_post: {
        Row: {
          created_at: string
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_post_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          created_at: string
          id: string
          image_url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      add_channel_subscribers: {
        Args: { p_channel_id: string; p_user_ids: string[] }
        Returns: undefined
      }
      add_chat_group_members: {
        Args: { p_group_id: string; p_member_ids: string[] }
        Returns: undefined
      }
      can_publish_channel: { Args: { p_channel_id: string }; Returns: boolean }
      can_view_channel: { Args: { p_channel_id: string }; Returns: boolean }
      create_channel: {
        Args: {
          p_avatar_url?: string
          p_description?: string
          p_is_public?: boolean
          p_name: string
          p_slug: string
        }
        Returns: string
      }
      create_chat_group: {
        Args: {
          p_avatar_url?: string
          p_description?: string
          p_is_public?: boolean
          p_member_ids?: string[]
          p_name: string
        }
        Returns: string
      }
      delete_channel: { Args: { p_channel_id: string }; Returns: undefined }
      edit_own_message: {
        Args: { p_body: string; p_message_id: string }
        Returns: string
      }
      is_channel_admin: { Args: { p_channel_id: string }; Returns: boolean }
      is_channel_member: { Args: { p_channel_id: string }; Returns: boolean }
      is_channel_owner: { Args: { p_channel_id: string }; Returns: boolean }
      is_chat_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_chat_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_chat_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      is_platform_developer: { Args: never; Returns: boolean }
      grant_platform_role: { Args: { p_role: string; p_user_id: string }; Returns: undefined }
      revoke_platform_role: { Args: { p_role: string; p_user_id: string }; Returns: undefined }
      join_channel: { Args: { p_channel_id: string }; Returns: undefined }
      join_chat_group: { Args: { p_group_id: string }; Returns: undefined }
      leave_channel: { Args: { p_channel_id: string }; Returns: undefined }
      leave_chat_group: { Args: { p_group_id: string }; Returns: undefined }
      mark_messages_read: { Args: { p_other_user_id: string }; Returns: number }
      remove_chat_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      set_channel_member_role: {
        Args: { p_channel_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      set_channel_post_pinned: {
        Args: { p_is_pinned: boolean; p_post_id: string }
        Returns: undefined
      }
      set_chat_group_member_role: {
        Args: { p_group_id: string; p_role: string; p_user_id: string }
        Returns: undefined
      }
      set_direct_message_pinned: {
        Args: { p_is_pinned: boolean; p_message_id: string }
        Returns: undefined
      }
      set_group_message_pinned: {
        Args: { p_is_pinned: boolean; p_message_id: string }
        Returns: undefined
      }
      transfer_channel_ownership: {
        Args: { p_channel_id: string; p_new_owner_id: string }
        Returns: undefined
      }
      transfer_chat_group_ownership: {
        Args: { p_group_id: string; p_new_owner_id: string }
        Returns: undefined
      }
      update_channel_details: {
        Args: {
          p_avatar_url: string
          p_channel_id: string
          p_description: string
          p_is_public: boolean
          p_name: string
          p_slug: string
        }
        Returns: undefined
      }
      update_chat_group_details: {
        Args: {
          p_avatar_url: string
          p_description: string
          p_group_id: string
          p_is_public: boolean
          p_name: string
        }
        Returns: undefined
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
