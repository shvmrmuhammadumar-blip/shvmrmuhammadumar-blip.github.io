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
      comment_reactions: {
        Row: {
          comment_id: string
          created_at: string
          reaction: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          reaction: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reactions_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reactions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      comment_reports: {
        Row: {
          comment_id: string
          created_at: string
          details: string | null
          id: string
          post_id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          details?: string | null
          id?: string
          post_id: string
          reason: string
          reported_user_id: string
          reporter_id: string
          status?: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_reports_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reported_user_id_fkey"
            columns: ["reported_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comment_reports_reporter_id_fkey"
            columns: ["reporter_id"]
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
          edited_at: string | null
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
          edited_at?: string | null
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
          edited_at?: string | null
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
            foreignKeyName: "comments_parent_same_post_fkey"
            columns: ["parent_id", "post_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id", "post_id"]
          },
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
        ]
      }
      creator_content_events: {
        Row: {
          content_duration_ms: number
          content_id: string
          content_type: string
          event_type: string
          id: string
          occurred_at: string
          owner_id: string
          session_key: string
          viewer_id: string
          watch_ms: number
        }
        Insert: {
          content_duration_ms?: number
          content_id: string
          content_type: string
          event_type?: string
          id?: string
          occurred_at?: string
          owner_id: string
          session_key: string
          viewer_id: string
          watch_ms?: number
        }
        Update: {
          content_duration_ms?: number
          content_id?: string
          content_type?: string
          event_type?: string
          id?: string
          occurred_at?: string
          owner_id?: string
          session_key?: string
          viewer_id?: string
          watch_ms?: number
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
      creator_plans: {
        Row: {
          content_type: string
          created_at: string
          id: string
          notes: string
          scheduled_at: string | null
          status: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          content_type?: string
          created_at?: string
          id?: string
          notes?: string
          scheduled_at?: string | null
          status?: string
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          content_type?: string
          created_at?: string
          id?: string
          notes?: string
          scheduled_at?: string | null
          status?: string
          title?: string
          updated_at?: string
          user_id?: string
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
      creator_settings: {
        Row: {
          account_type: string
          category: string | null
          contact_email: string | null
          created_at: string
          updated_at: string
          user_id: string
          website_url: string | null
        }
        Insert: {
          account_type?: string
          category?: string | null
          contact_email?: string | null
          created_at?: string
          updated_at?: string
          user_id: string
          website_url?: string | null
        }
        Update: {
          account_type?: string
          category?: string | null
          contact_email?: string | null
          created_at?: string
          updated_at?: string
          user_id?: string
          website_url?: string | null
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
      event_blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_blocks_blocked_id_fkey"
            columns: ["blocked_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_blocks_blocker_id_fkey"
            columns: ["blocker_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_personal_selections: {
        Row: {
          created_at: string
          followed_user_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          followed_user_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          followed_user_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_personal_selections_followed_user_id_fkey"
            columns: ["followed_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_personal_selections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          status: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          status?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_rsvps_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      events: {
        Row: {
          category: string
          cover_url: string | null
          created_at: string
          description: string
          expires_at: string
          host_id: string
          id: string
          location: string | null
          meeting_url: string | null
          starts_at: string
          title: string
          updated_at: string
        }
        Insert: {
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          expires_at?: string
          host_id: string
          id?: string
          location?: string | null
          meeting_url?: string | null
          starts_at: string
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          expires_at?: string
          host_id?: string
          id?: string
          location?: string | null
          meeting_url?: string | null
          starts_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
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
      lumo_official_collection_products: {
        Row: {
          collection_id: string
          created_at: string
          product_id: string
          sort_order: number
        }
        Insert: {
          collection_id: string
          created_at?: string
          product_id: string
          sort_order?: number
        }
        Update: {
          collection_id?: string
          created_at?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_collection_products_collection_id_fkey"
            columns: ["collection_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_collections"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_collection_products_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_products"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_collections: {
        Row: {
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string
          id: string
          name: string
          slug: string
          sort_order: number
          status: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name: string
          slug: string
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: string
          name?: string
          slug?: string
          sort_order?: number
          status?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_collections_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_collections_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_orders: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_address: string | null
          customer_name: string
          customer_note: string | null
          customer_phone: string
          id: number
          notification_error: string | null
          notification_status: string
          product_id: string | null
          product_name: string
          product_sku: string | null
          quantity: number
          status: string
          store_id: number
          subtotal: number
          telegram_message_id: number | null
          unit_price: number
          updated_at: string
          variant_id: string | null
          variant_name: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency: string
          customer_address?: string | null
          customer_name: string
          customer_note?: string | null
          customer_phone: string
          id?: number
          notification_error?: string | null
          notification_status?: string
          product_id?: string | null
          product_name: string
          product_sku?: string | null
          quantity: number
          status?: string
          store_id: number
          subtotal: number
          telegram_message_id?: number | null
          unit_price: number
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_address?: string | null
          customer_name?: string
          customer_note?: string | null
          customer_phone?: string
          id?: number
          notification_error?: string | null
          notification_status?: string
          product_id?: string | null
          product_name?: string
          product_sku?: string | null
          quantity?: number
          status?: string
          store_id?: number
          subtotal?: number
          telegram_message_id?: number | null
          unit_price?: number
          updated_at?: string
          variant_id?: string | null
          variant_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_orders_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_orders_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_orders_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_product_media: {
        Row: {
          alt_text: string
          created_at: string
          file_name: string | null
          id: string
          mime_type: string
          product_id: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          alt_text?: string
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type: string
          product_id: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          alt_text?: string
          created_at?: string
          file_name?: string | null
          id?: string
          mime_type?: string
          product_id?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_product_media_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_products"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_product_variants: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string
          price_override: number | null
          product_id: string
          size: string | null
          sku: string | null
          sort_order: number
          stock_quantity: number
          updated_at: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          price_override?: number | null
          product_id: string
          size?: string | null
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          price_override?: number | null
          product_id?: string
          size?: string | null
          sku?: string | null
          sort_order?: number
          stock_quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_products"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_products: {
        Row: {
          category: string
          compare_at_price: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string
          id: string
          is_featured: boolean
          name: string
          price: number
          short_description: string
          sku: string | null
          slug: string
          sort_order: number
          status: string
          store_id: number
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          category: string
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          id?: string
          is_featured?: boolean
          name: string
          price?: number
          short_description?: string
          sku?: string | null
          slug: string
          sort_order?: number
          status?: string
          store_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          category?: string
          compare_at_price?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string
          id?: string
          is_featured?: boolean
          name?: string
          price?: number
          short_description?: string
          sku?: string | null
          slug?: string
          sort_order?: number
          status?: string
          store_id?: number
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_products_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_products_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "lumo_official_store"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_products_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_official_store: {
        Row: {
          city: string | null
          contact_text: string
          country: string
          cover_url: string | null
          created_at: string
          created_by: string | null
          description: string
          id: number
          is_published: boolean
          logo_url: string | null
          name: string
          region: string | null
          slug: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          city?: string | null
          contact_text?: string
          country?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: number
          is_published?: boolean
          logo_url?: string | null
          name?: string
          region?: string | null
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          city?: string | null
          contact_text?: string
          country?: string
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string
          id?: number
          is_published?: boolean
          logo_url?: string | null
          name?: string
          region?: string | null
          slug?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lumo_official_store_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lumo_official_store_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      lumo_telegram_bot_config: {
        Row: {
          singleton: boolean
          updated_at: string
          webhook_secret: string
        }
        Insert: {
          singleton?: boolean
          updated_at?: string
          webhook_secret: string
        }
        Update: {
          singleton?: boolean
          updated_at?: string
          webhook_secret?: string
        }
        Relationships: []
      }
      lumo_telegram_bot_state: {
        Row: {
          awaiting_action: string | null
          chat_id: number
          updated_at: string
        }
        Insert: {
          awaiting_action?: string | null
          chat_id: number
          updated_at?: string
        }
        Update: {
          awaiting_action?: string | null
          chat_id?: number
          updated_at?: string
        }
        Relationships: []
      }
      lumo_telegram_processed_updates: {
        Row: {
          received_at: string
          update_id: number
        }
        Insert: {
          received_at?: string
          update_id: number
        }
        Update: {
          received_at?: string
          update_id?: number
        }
        Relationships: []
      }
      market_favorites: {
        Row: {
          created_at: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_favorites_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_favorites_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listing_media: {
        Row: {
          created_at: string
          file_name: string | null
          id: string
          listing_id: string
          mime_type: string
          sort_order: number
          storage_path: string
        }
        Insert: {
          created_at?: string
          file_name?: string | null
          id?: string
          listing_id: string
          mime_type: string
          sort_order?: number
          storage_path: string
        }
        Update: {
          created_at?: string
          file_name?: string | null
          id?: string
          listing_id?: string
          mime_type?: string
          sort_order?: number
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listing_media_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      market_listings: {
        Row: {
          category: string
          city: string | null
          condition: string
          country: string
          created_at: string
          currency: string
          description: string
          id: string
          is_negotiable: boolean
          kind: string
          price: number | null
          region: string | null
          seller_id: string
          status: string
          store_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          category: string
          city?: string | null
          condition?: string
          country?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_negotiable?: boolean
          kind: string
          price?: number | null
          region?: string | null
          seller_id: string
          status?: string
          store_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          category?: string
          city?: string | null
          condition?: string
          country?: string
          created_at?: string
          currency?: string
          description?: string
          id?: string
          is_negotiable?: boolean
          kind?: string
          price?: number | null
          region?: string | null
          seller_id?: string
          status?: string
          store_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_listings_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_listings_store_id_fkey"
            columns: ["store_id"]
            isOneToOne: false
            referencedRelation: "market_stores"
            referencedColumns: ["id"]
          },
        ]
      }
      market_reports: {
        Row: {
          created_at: string
          details: string
          id: string
          listing_id: string | null
          reason: string
          reporter_id: string
          status: string
        }
        Insert: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason: string
          reporter_id: string
          status?: string
        }
        Update: {
          created_at?: string
          details?: string
          id?: string
          listing_id?: string | null
          reason?: string
          reporter_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_reports_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "market_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "market_reports_reporter_id_fkey"
            columns: ["reporter_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      market_stores: {
        Row: {
          avatar_url: string | null
          city: string | null
          country: string
          cover_url: string | null
          created_at: string
          description: string
          id: string
          is_active: boolean
          name: string
          owner_id: string
          region: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          city?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name: string
          owner_id: string
          region?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          city?: string | null
          country?: string
          cover_url?: string | null
          created_at?: string
          description?: string
          id?: string
          is_active?: boolean
          name?: string
          owner_id?: string
          region?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "market_stores_owner_id_fkey"
            columns: ["owner_id"]
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
          granted_by: string | null
          role: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_by?: string | null
          role: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_by?: string | null
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_roles_granted_by_fkey"
            columns: ["granted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "platform_roles_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
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
      user_activity_events: {
        Row: {
          entity_id: string | null
          entity_type: string | null
          event_type: string
          id: string
          metadata: Json
          occurred_at: string
          related_entity_id: string | null
          related_entity_type: string | null
          session_key: string | null
          target_user_id: string | null
          user_id: string
        }
        Insert: {
          entity_id?: string | null
          entity_type?: string | null
          event_type: string
          id?: string
          metadata?: Json
          occurred_at?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          session_key?: string | null
          target_user_id?: string | null
          user_id: string
        }
        Update: {
          entity_id?: string | null
          entity_type?: string | null
          event_type?: string
          id?: string
          metadata?: Json
          occurred_at?: string
          related_entity_id?: string | null
          related_entity_type?: string | null
          session_key?: string | null
          target_user_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_events_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_activity_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_activity_sessions: {
        Row: {
          duration_ms: number
          ended_at: string | null
          id: string
          last_seen_at: string
          platform: string
          session_key: string
          started_at: string
          user_id: string
        }
        Insert: {
          duration_ms?: number
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          session_key: string
          started_at?: string
          user_id: string
        }
        Update: {
          duration_ms?: number
          ended_at?: string | null
          id?: string
          last_seen_at?: string
          platform?: string
          session_key?: string
          started_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_activity_sessions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_locations: {
        Row: {
          accuracy_meters: number | null
          heading_degrees: number | null
          latitude: number
          longitude: number
          sharing_enabled: boolean
          speed_mps: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accuracy_meters?: number | null
          heading_degrees?: number | null
          latitude: number
          longitude: number
          sharing_enabled?: boolean
          speed_mps?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accuracy_meters?: number | null
          heading_degrees?: number | null
          latitude?: number
          longitude?: number
          sharing_enabled?: boolean
          speed_mps?: number | null
          updated_at?: string
          user_id?: string
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
      grant_platform_role: {
        Args: { p_role: string; p_user_id: string }
        Returns: undefined
      }
      is_channel_admin: { Args: { p_channel_id: string }; Returns: boolean }
      is_channel_member: { Args: { p_channel_id: string }; Returns: boolean }
      is_channel_owner: { Args: { p_channel_id: string }; Returns: boolean }
      is_chat_group_admin: { Args: { p_group_id: string }; Returns: boolean }
      is_chat_group_member: { Args: { p_group_id: string }; Returns: boolean }
      is_chat_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      is_platform_developer: { Args: never; Returns: boolean }
      join_channel: { Args: { p_channel_id: string }; Returns: undefined }
      join_chat_group: { Args: { p_group_id: string }; Returns: undefined }
      leave_channel: { Args: { p_channel_id: string }; Returns: undefined }
      leave_chat_group: { Args: { p_group_id: string }; Returns: undefined }
      mark_messages_read: { Args: { p_other_user_id: string }; Returns: number }
      record_user_activity: {
        Args: {
          p_entity_id?: string
          p_entity_type?: string
          p_event_type: string
          p_metadata?: Json
          p_occurred_at?: string
          p_related_entity_id?: string
          p_related_entity_type?: string
          p_session_key?: string
          p_target_user_id?: string
          p_user_id: string
        }
        Returns: undefined
      }
      remove_chat_group_member: {
        Args: { p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      revoke_platform_role: {
        Args: { p_role: string; p_user_id: string }
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
