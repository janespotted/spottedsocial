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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string | null
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string | null
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string | null
          id?: string
        }
        Relationships: []
      }
      checkins: {
        Row: {
          created_at: string | null
          ended_at: string | null
          id: string
          is_demo: boolean | null
          is_promoted: boolean | null
          last_updated_at: string | null
          lat: number
          lng: number
          started_at: string | null
          user_id: string
          venue_id: string | null
          venue_name: string
        }
        Insert: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          last_updated_at?: string | null
          lat: number
          lng: number
          started_at?: string | null
          user_id: string
          venue_id?: string | null
          venue_name: string
        }
        Update: {
          created_at?: string | null
          ended_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          last_updated_at?: string | null
          lat?: number
          lng?: number
          started_at?: string | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "checkins_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      close_friends: {
        Row: {
          close_friend_id: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          close_friend_id: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          close_friend_id?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_nudges: {
        Row: {
          created_at: string | null
          first_nudge_response: string | null
          first_nudge_sent_at: string | null
          id: string
          nudge_date: string
          second_nudge_response: string | null
          second_nudge_sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          first_nudge_response?: string | null
          first_nudge_sent_at?: string | null
          id?: string
          nudge_date?: string
          second_nudge_response?: string | null
          second_nudge_sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          first_nudge_response?: string | null
          first_nudge_sent_at?: string | null
          id?: string
          nudge_date?: string
          second_nudge_response?: string | null
          second_nudge_sent_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dm_messages: {
        Row: {
          created_at: string | null
          id: string
          image_url: string | null
          sender_id: string
          text: string
          thread_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          sender_id: string
          text: string
          thread_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          image_url?: string | null
          sender_id?: string
          text?: string
          thread_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_thread_members: {
        Row: {
          id: string
          thread_id: string
          user_id: string
        }
        Insert: {
          id?: string
          thread_id: string
          user_id: string
        }
        Update: {
          id?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_thread_members_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_thread_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_threads: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          is_group: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_group?: boolean | null
          name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dm_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dm_threads_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      event_logs: {
        Row: {
          created_at: string
          event_data: Json | null
          event_type: string
          id: string
          metadata: Json | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_data?: Json | null
          event_type: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_data?: Json | null
          event_type?: string
          id?: string
          metadata?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      friendships: {
        Row: {
          created_at: string | null
          friend_id: string
          id: string
          status: Database["public"]["Enums"]["friendship_status_enum"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          friend_id: string
          id?: string
          status?: Database["public"]["Enums"]["friendship_status_enum"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          friend_id?: string
          id?: string
          status?: Database["public"]["Enums"]["friendship_status_enum"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_friend_id_fkey"
            columns: ["friend_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "friendships_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      invite_codes: {
        Row: {
          code: string
          created_at: string | null
          expires_at: string | null
          id: string
          max_uses: number | null
          user_id: string
          uses_count: number | null
        }
        Insert: {
          code: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          user_id: string
          uses_count?: number | null
        }
        Update: {
          code?: string
          created_at?: string | null
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          user_id?: string
          uses_count?: number | null
        }
        Relationships: []
      }
      invite_uses: {
        Row: {
          created_at: string | null
          id: string
          invite_code_id: string
          invited_user_id: string
          inviter_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invite_code_id: string
          invited_user_id: string
          inviter_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invite_code_id?: string
          invited_user_id?: string
          inviter_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invite_uses_invite_code_id_fkey"
            columns: ["invite_code_id"]
            isOneToOne: false
            referencedRelation: "invite_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      location_detection_logs: {
        Row: {
          confirmed_venue_id: string | null
          created_at: string | null
          detected_venue_id: string | null
          distance_to_venue: number | null
          error_message: string | null
          error_type: string | null
          event_type: string
          gps_accuracy: number | null
          id: string
          metadata: Json | null
          user_id: string | null
          user_lat: number | null
          user_lng: number | null
          was_correct: boolean | null
        }
        Insert: {
          confirmed_venue_id?: string | null
          created_at?: string | null
          detected_venue_id?: string | null
          distance_to_venue?: number | null
          error_message?: string | null
          error_type?: string | null
          event_type: string
          gps_accuracy?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_lat?: number | null
          user_lng?: number | null
          was_correct?: boolean | null
        }
        Update: {
          confirmed_venue_id?: string | null
          created_at?: string | null
          detected_venue_id?: string | null
          distance_to_venue?: number | null
          error_message?: string | null
          error_type?: string | null
          event_type?: string
          gps_accuracy?: number | null
          id?: string
          metadata?: Json | null
          user_id?: string | null
          user_lat?: number | null
          user_lng?: number | null
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "location_detection_logs_confirmed_venue_id_fkey"
            columns: ["confirmed_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_detection_logs_detected_venue_id_fkey"
            columns: ["detected_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_detection_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_detection_logs_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      night_statuses: {
        Row: {
          expires_at: string | null
          id: string
          is_demo: boolean | null
          is_private_party: boolean | null
          is_promoted: boolean | null
          lat: number | null
          lng: number | null
          party_address: string | null
          party_neighborhood: string | null
          planning_neighborhood: string | null
          planning_visibility: string | null
          status: Database["public"]["Enums"]["night_status_enum"]
          updated_at: string | null
          user_id: string
          venue_id: string | null
          venue_name: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_private_party?: boolean | null
          is_promoted?: boolean | null
          lat?: number | null
          lng?: number | null
          party_address?: string | null
          party_neighborhood?: string | null
          planning_neighborhood?: string | null
          planning_visibility?: string | null
          status?: Database["public"]["Enums"]["night_status_enum"]
          updated_at?: string | null
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_private_party?: boolean | null
          is_promoted?: boolean | null
          lat?: number | null
          lng?: number | null
          party_address?: string | null
          party_neighborhood?: string | null
          planning_neighborhood?: string | null
          planning_visibility?: string | null
          status?: Database["public"]["Enums"]["night_status_enum"]
          updated_at?: string | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "night_statuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_statuses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "night_statuses_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          receiver_id?: string
          sender_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_comments: {
        Row: {
          created_at: string | null
          id: string
          plan_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plan_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_comments_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_downs: {
        Row: {
          created_at: string | null
          id: string
          plan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_downs_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_participants: {
        Row: {
          created_at: string | null
          id: string
          plan_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plan_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_participants_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plan_votes: {
        Row: {
          created_at: string | null
          id: string
          plan_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          plan_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          plan_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_votes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          comments_count: number | null
          created_at: string | null
          description: string | null
          expires_at: string
          id: string
          is_demo: boolean | null
          plan_date: string
          plan_time: string
          score: number | null
          user_id: string
          venue_id: string | null
          venue_name: string
          visibility: string
        }
        Insert: {
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          expires_at: string
          id?: string
          is_demo?: boolean | null
          plan_date: string
          plan_time: string
          score?: number | null
          user_id: string
          venue_id?: string | null
          venue_name: string
          visibility?: string
        }
        Update: {
          comments_count?: number | null
          created_at?: string | null
          description?: string | null
          expires_at?: string
          id?: string
          is_demo?: boolean | null
          plan_date?: string
          plan_time?: string
          score?: number | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "plans_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comment_likes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          created_at: string | null
          id: string
          likes_count: number | null
          post_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          likes_count?: number | null
          post_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          likes_count?: number | null
          post_id?: string
          text?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number | null
          created_at: string | null
          expires_at: string
          id: string
          image_url: string | null
          is_demo: boolean | null
          is_promoted: boolean | null
          likes_count: number | null
          text: string
          user_id: string
          venue_id: string | null
          venue_name: string | null
          visibility: string
        }
        Insert: {
          comments_count?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          image_url?: string | null
          is_demo?: boolean | null
          is_promoted?: boolean | null
          likes_count?: number | null
          text: string
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
          visibility?: string
        }
        Update: {
          comments_count?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          image_url?: string | null
          is_demo?: boolean | null
          is_promoted?: boolean | null
          likes_count?: number | null
          text?: string
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
          visibility?: string
        }
        Relationships: [
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string
          has_onboarded: boolean | null
          home_city: string | null
          id: string
          is_demo: boolean | null
          is_out: boolean | null
          last_active_at: string | null
          last_known_lat: number | null
          last_known_lng: number | null
          last_location_at: string | null
          location_sharing_level: string | null
          push_enabled: boolean | null
          push_subscription: Json | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          has_onboarded?: boolean | null
          home_city?: string | null
          id: string
          is_demo?: boolean | null
          is_out?: boolean | null
          last_active_at?: string | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          has_onboarded?: boolean | null
          home_city?: string | null
          id?: string
          is_demo?: boolean | null
          is_out?: boolean | null
          last_active_at?: string | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          username?: string
        }
        Relationships: []
      }
      rate_limit_actions: {
        Row: {
          action_type: string
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      reports: {
        Row: {
          created_at: string | null
          details: string | null
          id: string
          reason: string
          reported_post_id: string | null
          reported_user_id: string | null
          reported_venue_id: string | null
          reported_yap_id: string | null
          reporter_id: string
          status: string | null
        }
        Insert: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason: string
          reported_post_id?: string | null
          reported_user_id?: string | null
          reported_venue_id?: string | null
          reported_yap_id?: string | null
          reporter_id: string
          status?: string | null
        }
        Update: {
          created_at?: string | null
          details?: string | null
          id?: string
          reason?: string
          reported_post_id?: string | null
          reported_user_id?: string | null
          reported_venue_id?: string | null
          reported_yap_id?: string | null
          reporter_id?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reports_reported_venue_id_fkey"
            columns: ["reported_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      review_votes: {
        Row: {
          created_at: string
          id: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          created_at?: string
          id?: string
          review_id: string
          user_id: string
          vote_type: string
        }
        Update: {
          created_at?: string
          id?: string
          review_id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "review_votes_review_id_fkey"
            columns: ["review_id"]
            isOneToOne: false
            referencedRelation: "venue_reviews"
            referencedColumns: ["id"]
          },
        ]
      }
      stories: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_anonymous: boolean | null
          is_demo: boolean | null
          is_public_buzz: boolean | null
          media_type: string
          media_url: string
          user_id: string
          venue_id: string | null
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_public_buzz?: boolean | null
          media_type: string
          media_url: string
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_public_buzz?: boolean | null
          media_type?: string
          media_url?: string
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stories_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      story_views: {
        Row: {
          id: string
          story_id: string
          user_id: string
          viewed_at: string
        }
        Insert: {
          id?: string
          story_id: string
          user_id: string
          viewed_at?: string
        }
        Update: {
          id?: string
          story_id?: string
          user_id?: string
          viewed_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "story_views_story_id_fkey"
            columns: ["story_id"]
            isOneToOne: false
            referencedRelation: "stories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "story_views_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string | null
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      venue_auto_corrections: {
        Row: {
          created_at: string | null
          id: string
          new_lat: number
          new_lng: number
          old_lat: number
          old_lng: number
          report_count: number
          reverted_at: string | null
          reverted_by: string | null
          unique_user_count: number
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          new_lat: number
          new_lng: number
          old_lat: number
          old_lng: number
          report_count: number
          reverted_at?: string | null
          reverted_by?: string | null
          unique_user_count: number
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          new_lat?: number
          new_lng?: number
          old_lat?: number
          old_lng?: number
          report_count?: number
          reverted_at?: string | null
          reverted_by?: string | null
          unique_user_count?: number
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_auto_corrections_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_auto_corrections_reverted_by_fkey"
            columns: ["reverted_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_auto_corrections_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_buzz_messages: {
        Row: {
          created_at: string | null
          emoji_vibe: string | null
          expires_at: string
          id: string
          is_anonymous: boolean | null
          is_demo: boolean | null
          text: string
          user_id: string
          venue_id: string
          venue_name: string
        }
        Insert: {
          created_at?: string | null
          emoji_vibe?: string | null
          expires_at: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          text: string
          user_id: string
          venue_id: string
          venue_name: string
        }
        Update: {
          created_at?: string | null
          emoji_vibe?: string | null
          expires_at?: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          text?: string
          user_id?: string
          venue_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_buzz_messages_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_location_reports: {
        Row: {
          auto_corrected_at: string | null
          auto_correction_id: string | null
          created_at: string | null
          id: string
          notes: string | null
          report_type: string
          reported_lat: number
          reported_lng: number
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          suggested_venue_name: string | null
          suggested_venue_type: string | null
          user_id: string | null
          user_lat: number
          user_lng: number
          venue_id: string | null
        }
        Insert: {
          auto_corrected_at?: string | null
          auto_correction_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          report_type: string
          reported_lat: number
          reported_lng: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_venue_name?: string | null
          suggested_venue_type?: string | null
          user_id?: string | null
          user_lat: number
          user_lng: number
          venue_id?: string | null
        }
        Update: {
          auto_corrected_at?: string | null
          auto_correction_id?: string | null
          created_at?: string | null
          id?: string
          notes?: string | null
          report_type?: string
          reported_lat?: number
          reported_lng?: number
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggested_venue_name?: string | null
          suggested_venue_type?: string | null
          user_id?: string | null
          user_lat?: number
          user_lng?: number
          venue_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "venue_location_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_location_reports_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_location_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_location_reports_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "venue_location_reports_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venue_reviews: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          is_anonymous: boolean | null
          rating: number
          review_text: string | null
          score: number | null
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_anonymous?: boolean | null
          rating: number
          review_text?: string | null
          score?: number | null
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          is_anonymous?: boolean | null
          rating?: number
          review_text?: string | null
          score?: number | null
          user_id?: string
          venue_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "venue_reviews_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
      }
      venues: {
        Row: {
          city: string | null
          created_at: string | null
          google_photo_refs: Json | null
          google_place_id: string | null
          google_rating: number | null
          google_user_ratings_total: number | null
          hours_last_updated: string | null
          id: string
          is_demo: boolean | null
          is_promoted: boolean | null
          is_user_submitted: boolean | null
          lat: number
          lng: number
          name: string
          neighborhood: string
          opened_at: string | null
          operating_hours: Json | null
          popularity_rank: number | null
          type: string
        }
        Insert: {
          city?: string | null
          created_at?: string | null
          google_photo_refs?: Json | null
          google_place_id?: string | null
          google_rating?: number | null
          google_user_ratings_total?: number | null
          hours_last_updated?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          is_user_submitted?: boolean | null
          lat: number
          lng: number
          name: string
          neighborhood: string
          opened_at?: string | null
          operating_hours?: Json | null
          popularity_rank?: number | null
          type: string
        }
        Update: {
          city?: string | null
          created_at?: string | null
          google_photo_refs?: Json | null
          google_place_id?: string | null
          google_rating?: number | null
          google_user_ratings_total?: number | null
          hours_last_updated?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          is_user_submitted?: boolean | null
          lat?: number
          lng?: number
          name?: string
          neighborhood?: string
          opened_at?: string | null
          operating_hours?: Json | null
          popularity_rank?: number | null
          type?: string
        }
        Relationships: []
      }
      wishlist_places: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
          venue_image_url: string | null
          venue_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
          venue_image_url?: string | null
          venue_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
          venue_image_url?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_places_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "wishlist_places_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yap_comment_votes: {
        Row: {
          comment_id: string
          created_at: string | null
          id: string
          user_id: string
          vote_type: string
        }
        Insert: {
          comment_id: string
          created_at?: string | null
          id?: string
          user_id: string
          vote_type: string
        }
        Update: {
          comment_id?: string
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "yap_comment_votes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "yap_comments"
            referencedColumns: ["id"]
          },
        ]
      }
      yap_comments: {
        Row: {
          author_handle: string | null
          created_at: string | null
          id: string
          is_anonymous: boolean | null
          is_demo: boolean | null
          score: number | null
          text: string
          user_id: string
          yap_id: string
        }
        Insert: {
          author_handle?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          score?: number | null
          text: string
          user_id: string
          yap_id: string
        }
        Update: {
          author_handle?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          score?: number | null
          text?: string
          user_id?: string
          yap_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yap_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yap_comments_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yap_comments_yap_id_fkey"
            columns: ["yap_id"]
            isOneToOne: false
            referencedRelation: "yap_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      yap_messages: {
        Row: {
          author_handle: string | null
          comments_count: number | null
          created_at: string | null
          expires_at: string
          id: string
          is_anonymous: boolean | null
          is_demo: boolean | null
          is_promoted: boolean | null
          score: number | null
          text: string
          user_id: string
          venue_name: string
        }
        Insert: {
          author_handle?: string | null
          comments_count?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_promoted?: boolean | null
          score?: number | null
          text: string
          user_id: string
          venue_name: string
        }
        Update: {
          author_handle?: string | null
          comments_count?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_promoted?: boolean | null
          score?: number | null
          text?: string
          user_id?: string
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "yap_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yap_messages_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
        ]
      }
      yap_votes: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
          vote_type: string
          yap_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
          vote_type: string
          yap_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
          vote_type?: string
          yap_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "yap_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yap_votes_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles_public"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "yap_votes_yap_id_fkey"
            columns: ["yap_id"]
            isOneToOne: false
            referencedRelation: "yap_messages"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      profiles_public: {
        Row: {
          avatar_url: string | null
          bio: string | null
          created_at: string | null
          display_name: string | null
          has_onboarded: boolean | null
          home_city: string | null
          id: string | null
          is_demo: boolean | null
          is_out: boolean | null
          last_active_at: string | null
          last_known_lat: number | null
          last_known_lng: number | null
          last_location_at: string | null
          location_sharing_level: string | null
          push_enabled: boolean | null
          push_subscription: Json | null
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          has_onboarded?: boolean | null
          home_city?: string | null
          id?: string | null
          is_demo?: boolean | null
          is_out?: never
          last_active_at?: never
          last_known_lat?: never
          last_known_lng?: never
          last_location_at?: never
          location_sharing_level?: string | null
          push_enabled?: boolean | null
          push_subscription?: never
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string | null
          has_onboarded?: boolean | null
          home_city?: string | null
          id?: string | null
          is_demo?: boolean | null
          is_out?: never
          last_active_at?: never
          last_known_lat?: never
          last_known_lng?: never
          last_location_at?: never
          location_sharing_level?: string | null
          push_enabled?: boolean | null
          push_subscription?: never
          username?: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      can_see_location: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      check_rate_limit: {
        Args: {
          p_action_type: string
          p_max_count: number
          p_user_id: string
          p_window_hours: number
        }
        Returns: boolean
      }
      cleanup_old_checkins: { Args: never; Returns: number }
      cleanup_old_rate_limits: { Args: never; Returns: number }
      create_dm_thread: { Args: { friend_id: string }; Returns: string }
      create_group_thread: {
        Args: { group_name?: string; member_ids: string[] }
        Returns: string
      }
      find_nearby_venues: {
        Args: {
          max_results?: number
          radius_meters?: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          distance_meters: number
          venue_id: string
          venue_name: string
        }[]
      }
      find_nearest_venue: {
        Args: { radius_meters?: number; user_lat: number; user_lng: number }
        Returns: {
          distance_meters: number
          venue_id: string
          venue_name: string
        }[]
      }
      get_profile_safe: {
        Args: { target_user_id: string }
        Returns: {
          avatar_url: string
          bio: string
          can_view_location: boolean
          created_at: string
          display_name: string
          has_onboarded: boolean
          home_city: string
          id: string
          is_demo: boolean
          is_out: boolean
          last_active_at: string
          last_known_lat: number
          last_known_lng: number
          last_location_at: string
          location_sharing_level: string
          username: string
        }[]
      }
      get_profiles_safe: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          has_onboarded: boolean
          home_city: string
          id: string
          is_demo: boolean
          is_out: boolean
          last_active_at: string
          last_known_lat: number
          last_known_lng: number
          last_location_at: string
          location_sharing_level: string
          username: string
        }[]
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_close_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_direct_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_mutual_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      process_invite_code: {
        Args: { invite_code: string; new_user_id: string }
        Returns: Json
      }
      record_rate_limited_action: {
        Args: {
          p_action_type: string
          p_max_count: number
          p_window_hours: number
        }
        Returns: boolean
      }
      user_is_thread_member: { Args: { thread_uuid: string }; Returns: boolean }
      validate_invite_code: { Args: { code_to_check: string }; Returns: Json }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
      friendship_status_enum: "pending" | "accepted" | "blocked"
      night_status_enum: "out" | "heading_out" | "home" | "planning" | "off"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
      friendship_status_enum: ["pending", "accepted", "blocked"],
      night_status_enum: ["out", "heading_out", "home", "planning", "off"],
    },
  },
} as const
