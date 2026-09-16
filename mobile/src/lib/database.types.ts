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
    PostgrestVersion: "14.5"
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
        Relationships: [
          {
            foreignKeyName: "close_friends_close_friend_id_fkey"
            columns: ["close_friend_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "close_friends_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
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
      dm_message_reactions: {
        Row: {
          created_at: string | null
          id: string
          message_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          message_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          message_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dm_message_reactions_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "dm_messages"
            referencedColumns: ["id"]
          },
        ]
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
            foreignKeyName: "dm_messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "dm_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      dm_read_receipts: {
        Row: {
          last_read_at: string
          thread_id: string
          user_id: string
        }
        Insert: {
          last_read_at?: string
          thread_id: string
          user_id: string
        }
        Update: {
          last_read_at?: string
          thread_id?: string
          user_id?: string
        }
        Relationships: []
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
        ]
      }
      dm_threads: {
        Row: {
          created_at: string | null
          created_by: string | null
          group_avatar_url: string | null
          id: string
          is_group: boolean | null
          name: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          group_avatar_url?: string | null
          id?: string
          is_group?: boolean | null
          name?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          group_avatar_url?: string | null
          id?: string
          is_group?: boolean | null
          name?: string | null
        }
        Relationships: []
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
      event_rsvps: {
        Row: {
          created_at: string
          event_id: string
          id: string
          rsvp_type: string
          user_id: string
        }
        Insert: {
          created_at?: string
          event_id: string
          id?: string
          rsvp_type?: string
          user_id: string
        }
        Update: {
          created_at?: string
          event_id?: string
          id?: string
          rsvp_type?: string
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
        ]
      }
      events: {
        Row: {
          city: string | null
          cover_image_url: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          event_date: string
          expires_at: string
          id: string
          is_demo: boolean | null
          neighborhood: string | null
          start_time: string
          ticket_url: string | null
          title: string
          venue_id: string | null
          venue_name: string
        }
        Insert: {
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date: string
          expires_at: string
          id?: string
          is_demo?: boolean | null
          neighborhood?: string | null
          start_time: string
          ticket_url?: string | null
          title: string
          venue_id?: string | null
          venue_name: string
        }
        Update: {
          city?: string | null
          cover_image_url?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_date?: string
          expires_at?: string
          id?: string
          is_demo?: boolean | null
          neighborhood?: string | null
          start_time?: string
          ticket_url?: string | null
          title?: string
          venue_id?: string | null
          venue_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "events_venue_id_fkey"
            columns: ["venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
            referencedColumns: ["id"]
          },
        ]
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      location_events: {
        Row: {
          created_at: string
          day_of_week: number | null
          distance_to_venue_meters: number | null
          dwell_time_seconds: number | null
          evaluated_venue_id: string | null
          evaluated_venue_name: string | null
          evaluation_id: string
          event_type: string
          friends_at_venue_count: number | null
          gps_accuracy_meters: number | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          result: string | null
          speed_mph: number | null
          thresholds_met: Json | null
          time_of_day: number | null
          user_id: string | null
          user_status_after: string | null
          user_status_before: string | null
        }
        Insert: {
          created_at?: string
          day_of_week?: number | null
          distance_to_venue_meters?: number | null
          dwell_time_seconds?: number | null
          evaluated_venue_id?: string | null
          evaluated_venue_name?: string | null
          evaluation_id: string
          event_type: string
          friends_at_venue_count?: number | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          result?: string | null
          speed_mph?: number | null
          thresholds_met?: Json | null
          time_of_day?: number | null
          user_id?: string | null
          user_status_after?: string | null
          user_status_before?: string | null
        }
        Update: {
          created_at?: string
          day_of_week?: number | null
          distance_to_venue_meters?: number | null
          dwell_time_seconds?: number | null
          evaluated_venue_id?: string | null
          evaluated_venue_name?: string | null
          evaluation_id?: string
          event_type?: string
          friends_at_venue_count?: number | null
          gps_accuracy_meters?: number | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          result?: string | null
          speed_mph?: number | null
          thresholds_met?: Json | null
          time_of_day?: number | null
          user_id?: string | null
          user_status_after?: string | null
          user_status_before?: string | null
        }
        Relationships: []
      }
      location_hidden: {
        Row: {
          created_at: string | null
          hidden_from_id: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          hidden_from_id: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          hidden_from_id?: string
          id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "location_hidden_hidden_from_id_fkey"
            columns: ["hidden_from_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "location_hidden_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
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
          planning_venue_id: string | null
          planning_venue_name: string | null
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
          planning_venue_id?: string | null
          planning_venue_name?: string | null
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
          planning_venue_id?: string | null
          planning_venue_name?: string | null
          planning_visibility?: string | null
          status?: Database["public"]["Enums"]["night_status_enum"]
          updated_at?: string | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "night_statuses_planning_venue_id_fkey"
            columns: ["planning_venue_id"]
            isOneToOne: false
            referencedRelation: "venues"
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
          is_demo: boolean | null
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_read?: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_read?: boolean | null
          message?: string
          receiver_id?: string
          sender_id?: string
          type?: string
        }
        Relationships: []
      }
      party_locations: {
        Row: {
          expires_at: string
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          expires_at: string
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          expires_at?: string
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "party_locations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "profiles"
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
          plan_type: string | null
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
          plan_type?: string | null
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
          plan_type?: string | null
          score?: number | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string
          visibility?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      posts: {
        Row: {
          comments_count: number | null
          created_at: string | null
          expires_at: string
          id: string
          image_url: string | null
          is_demo: boolean | null
          likes_count: number | null
          media_hash: string | null
          media_height: number | null
          media_type: string | null
          media_width: number | null
          text: string
          user_id: string
          venue_id: string | null
          venue_name: string | null
          video_url: string | null
          visibility: string | null
        }
        Insert: {
          comments_count?: number | null
          created_at?: string | null
          expires_at: string
          id?: string
          image_url?: string | null
          is_demo?: boolean | null
          likes_count?: number | null
          media_hash?: string | null
          media_height?: number | null
          media_type?: string | null
          media_width?: number | null
          text: string
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
          video_url?: string | null
          visibility?: string | null
        }
        Update: {
          comments_count?: number | null
          created_at?: string | null
          expires_at?: string
          id?: string
          image_url?: string | null
          is_demo?: boolean | null
          likes_count?: number | null
          media_hash?: string | null
          media_height?: number | null
          media_type?: string | null
          media_width?: number | null
          text?: string
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
          video_url?: string | null
          visibility?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          apns_device_token: string | null
          avatar_url: string | null
          bio: string | null
          city: string | null
          created_at: string | null
          display_name: string | null
          id: string
          is_demo: boolean | null
          is_out: boolean | null
          is_private: boolean | null
          last_known_lat: number | null
          last_known_lng: number | null
          last_location_at: string | null
          location_sharing_level: string | null
          neighborhood: string | null
          onboarding_completed: boolean | null
          phone: string | null
          push_enabled: boolean | null
          push_subscription: Json | null
          push_token: string | null
          show_read_receipts: boolean
          username: string | null
        }
        Insert: {
          apns_device_token?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          id: string
          is_demo?: boolean | null
          is_out?: boolean | null
          is_private?: boolean | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          neighborhood?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          push_token?: string | null
          show_read_receipts?: boolean
          username?: string | null
        }
        Update: {
          apns_device_token?: string | null
          avatar_url?: string | null
          bio?: string | null
          city?: string | null
          created_at?: string | null
          display_name?: string | null
          id?: string
          is_demo?: boolean | null
          is_out?: boolean | null
          is_private?: boolean | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          neighborhood?: string | null
          onboarding_completed?: boolean | null
          phone?: string | null
          push_enabled?: boolean | null
          push_subscription?: Json | null
          push_token?: string | null
          show_read_receipts?: boolean
          username?: string | null
        }
        Relationships: []
      }
      promotion_interest: {
        Row: {
          created_at: string | null
          id: string
          user_id: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          user_id: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      push_logs: {
        Row: {
          created_at: string | null
          error: string | null
          id: string
          payload: Json | null
          success: boolean | null
          type: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          success?: boolean | null
          type?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          error?: string | null
          id?: string
          payload?: Json | null
          success?: boolean | null
          type?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      push_throttle: {
        Row: {
          created_at: string | null
          id: string
          notification_type: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          notification_type: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          notification_type?: string
          user_id?: string
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
        Relationships: []
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
        Relationships: []
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
          visibility: string
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
          visibility?: string
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
          visibility?: string
        }
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      venue_buzz_messages: {
        Row: {
          created_at: string | null
          emoji_vibe: string | null
          expires_at: string
          id: string
          is_anonymous: boolean | null
          is_demo: boolean | null
          star_rating: number | null
          text: string | null
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
          star_rating?: number | null
          text?: string | null
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
          star_rating?: number | null
          text?: string | null
          user_id?: string
          venue_id?: string
          venue_name?: string
        }
        Relationships: []
      }
      venue_claim_requests: {
        Row: {
          business_email: string
          business_phone: string | null
          created_at: string | null
          id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          user_id: string
          venue_id: string | null
          venue_name: string | null
          verification_notes: string | null
        }
        Insert: {
          business_email: string
          business_phone?: string | null
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id: string
          venue_id?: string | null
          venue_name?: string | null
          verification_notes?: string | null
        }
        Update: {
          business_email?: string
          business_phone?: string | null
          created_at?: string | null
          id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          user_id?: string
          venue_id?: string | null
          venue_name?: string | null
          verification_notes?: string | null
        }
        Relationships: []
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
        Relationships: []
      }
      venue_notif_throttle: {
        Row: {
          friend_id: string
          id: string
          notification_type: string
          notified_date: string
          user_id: string
          venue_id: string
        }
        Insert: {
          friend_id: string
          id?: string
          notification_type: string
          notified_date?: string
          user_id: string
          venue_id: string
        }
        Update: {
          friend_id?: string
          id?: string
          notification_type?: string
          notified_date?: string
          user_id?: string
          venue_id?: string
        }
        Relationships: []
      }
      venue_owners: {
        Row: {
          created_at: string | null
          id: string
          role: string | null
          user_id: string
          venue_id: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id: string
          venue_id: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          role?: string | null
          user_id?: string
          venue_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      venue_promotions: {
        Row: {
          amount_paid: number | null
          created_at: string | null
          created_by: string
          ends_at: string
          id: string
          promotion_type: string
          starts_at: string
          status: string | null
          stripe_payment_id: string | null
          stripe_subscription_id: string | null
          venue_id: string
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string | null
          created_by: string
          ends_at: string
          id?: string
          promotion_type: string
          starts_at: string
          status?: string | null
          stripe_payment_id?: string | null
          stripe_subscription_id?: string | null
          venue_id: string
        }
        Update: {
          amount_paid?: number | null
          created_at?: string | null
          created_by?: string
          ends_at?: string
          id?: string
          promotion_type?: string
          starts_at?: string
          status?: string | null
          stripe_payment_id?: string | null
          stripe_subscription_id?: string | null
          venue_id?: string
        }
        Relationships: []
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
        Relationships: []
      }
      venue_yap_messages: {
        Row: {
          created_at: string | null
          display_as: string | null
          expires_at: string | null
          id: string
          is_pinned: boolean | null
          posted_by: string
          text: string
          venue_id: string
        }
        Insert: {
          created_at?: string | null
          display_as?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          posted_by: string
          text: string
          venue_id: string
        }
        Update: {
          created_at?: string | null
          display_as?: string | null
          expires_at?: string | null
          id?: string
          is_pinned?: boolean | null
          posted_by?: string
          text?: string
          venue_id?: string
        }
        Relationships: []
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
          is_leaderboard_promoted: boolean | null
          is_map_promoted: boolean | null
          is_user_submitted: boolean | null
          lat: number
          leaderboard_promo_order: number | null
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
          is_leaderboard_promoted?: boolean | null
          is_map_promoted?: boolean | null
          is_user_submitted?: boolean | null
          lat: number
          leaderboard_promo_order?: number | null
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
          is_leaderboard_promoted?: boolean | null
          is_map_promoted?: boolean | null
          is_user_submitted?: boolean | null
          lat?: number
          leaderboard_promo_order?: number | null
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
        Relationships: []
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
        Relationships: []
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
        Relationships: []
      }
      yap_messages: {
        Row: {
          author_handle: string | null
          comments_count: number | null
          created_at: string | null
          expires_at: string
          id: string
          image_url: string | null
          is_anonymous: boolean | null
          is_demo: boolean | null
          is_private_party: boolean | null
          is_promoted: boolean | null
          media_type: string | null
          party_id: string | null
          party_lat: number | null
          party_lng: number | null
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
          image_url?: string | null
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_private_party?: boolean | null
          is_promoted?: boolean | null
          media_type?: string | null
          party_id?: string | null
          party_lat?: number | null
          party_lng?: number | null
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
          image_url?: string | null
          is_anonymous?: boolean | null
          is_demo?: boolean | null
          is_private_party?: boolean | null
          is_promoted?: boolean | null
          media_type?: string | null
          party_id?: string | null
          party_lat?: number | null
          party_lng?: number | null
          score?: number | null
          text?: string
          user_id?: string
          venue_name?: string
        }
        Relationships: []
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
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _can_see_location_unchecked: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_see_location: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      can_see_planning: {
        Args: { target_user_id: string; viewer_id: string; visibility: string }
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
      cleanup_venue_notif_throttle: { Args: never; Returns: undefined }
      clear_stale_push_token: {
        Args: { p_keep_user_id: string; p_token: string }
        Returns: undefined
      }
      create_dm_thread: { Args: { friend_id: string }; Returns: string }
      create_group_thread: {
        Args: { group_name: string; member_ids: string[] }
        Returns: string
      }
      create_notification: {
        Args: { p_message: string; p_receiver_id: string; p_type: string }
        Returns: {
          created_at: string | null
          id: string
          is_demo: boolean | null
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_notifications_batch: {
        Args: { p_notifications: Json }
        Returns: {
          created_at: string | null
          id: string
          is_demo: boolean | null
          is_read: boolean | null
          message: string
          receiver_id: string
          sender_id: string
          type: string
        }[]
        SetofOptions: {
          from: "*"
          to: "notifications"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      create_venue_from_discovery: {
        Args: {
          p_city: string
          p_google_place_id: string
          p_lat: number
          p_lng: number
          p_name: string
          p_neighborhood: string
          p_type: string
        }
        Returns: string
      }
      find_nearby_venues: {
        Args: {
          max_results: number
          radius_meters: number
          user_lat: number
          user_lng: number
        }
        Returns: {
          distance: number
          id: string
          name: string
        }[]
      }
      find_nearest_venue: {
        Args: { radius_meters: number; user_lat: number; user_lng: number }
        Returns: {
          distance: number
          id: string
          name: string
        }[]
      }
      get_morning_after_user_posts: {
        Args: {
          p_user_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          comments_count: number
          created_at: string
          id: string
          image_url: string
          likes_count: number
          media_type: string
          text: string
          venue_name: string
        }[]
      }
      get_morning_after_yaps: {
        Args: {
          p_user_id: string
          p_window_end: string
          p_window_start: string
        }
        Returns: {
          author_handle: string
          comments_count: number
          created_at: string
          id: string
          image_url: string
          is_anonymous: boolean
          media_type: string
          score: number
          text: string
          venue_name: string
        }[]
      }
      get_mutual_friend_ids: {
        Args: { p_user_id: string }
        Returns: {
          user_id: string
        }[]
      }
      get_mutual_friends_with: {
        Args: { p_other_id: string }
        Returns: {
          avatar_url: string
          display_name: string
          is_demo: boolean
          user_id: string
          username: string
        }[]
      }
      get_party_address: { Args: { p_status_user_id: string }; Returns: string }
      get_profiles_safe: {
        Args: never
        Returns: {
          avatar_url: string
          bio: string
          created_at: string
          display_name: string
          id: string
          is_demo: boolean
          is_out: boolean
          last_known_lat: number
          last_known_lng: number
          last_location_at: string
          location_sharing_level: string
          username: string
        }[]
      }
      get_visible_recipients: {
        Args: { candidate_ids: string[] }
        Returns: string[]
      }
      has_role: {
        Args: { role: Database["public"]["Enums"]["app_role"]; user_id: string }
        Returns: boolean
      }
      is_close_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_demo_user: { Args: { _uid: string }; Returns: boolean }
      is_direct_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_friend_or_mutual: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_mutual_friend: {
        Args: { target_user_id: string; viewer_id: string }
        Returns: boolean
      }
      is_venue_owner: {
        Args: { user_id: string; venue_id: string }
        Returns: boolean
      }
      match_phones: {
        Args: { phone_list: string[] }
        Returns: {
          avatar_url: string
          display_name: string
          phone: string
          user_id: string
          username: string
        }[]
      }
      night_start_at: {
        Args: { p_at?: string; p_city: string }
        Returns: string
      }
      nightly_reset: { Args: never; Returns: Json }
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
    Enums: {
      app_role: ["admin", "moderator", "user"],
      friendship_status_enum: ["pending", "accepted", "blocked"],
      night_status_enum: ["out", "heading_out", "home", "planning", "off"],
    },
  },
} as const
