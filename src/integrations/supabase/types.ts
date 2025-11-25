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
      checkins: {
        Row: {
          created_at: string | null
          id: string
          is_demo: boolean | null
          is_promoted: boolean | null
          lat: number
          lng: number
          user_id: string
          venue_name: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat: number
          lng: number
          user_id: string
          venue_name: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat?: number
          lng?: number
          user_id?: string
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
      dm_messages: {
        Row: {
          created_at: string | null
          id: string
          sender_id: string
          text: string
          thread_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          sender_id: string
          text: string
          thread_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
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
        ]
      }
      dm_threads: {
        Row: {
          created_at: string | null
          id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
        }
        Update: {
          created_at?: string | null
          id?: string
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
            foreignKeyName: "friendships_user_id_fkey"
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
          is_promoted: boolean | null
          lat: number | null
          lng: number | null
          status: Database["public"]["Enums"]["night_status_enum"]
          updated_at: string | null
          user_id: string
          venue_name: string | null
        }
        Insert: {
          expires_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat?: number | null
          lng?: number | null
          status?: Database["public"]["Enums"]["night_status_enum"]
          updated_at?: string | null
          user_id: string
          venue_name?: string | null
        }
        Update: {
          expires_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat?: number | null
          lng?: number | null
          status?: Database["public"]["Enums"]["night_status_enum"]
          updated_at?: string | null
          user_id?: string
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
        Relationships: []
      }
      post_comments: {
        Row: {
          created_at: string | null
          id: string
          post_id: string
          text: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          post_id: string
          text: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
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
          venue_name: string | null
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
          venue_name?: string | null
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
          venue_name?: string | null
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
          created_at: string | null
          display_name: string
          home_city: string | null
          id: string
          is_demo: boolean | null
          is_out: boolean | null
          last_active_at: string | null
          last_known_lat: number | null
          last_known_lng: number | null
          last_location_at: string | null
          location_sharing_level: string | null
          username: string
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name: string
          home_city?: string | null
          id: string
          is_demo?: boolean | null
          is_out?: boolean | null
          last_active_at?: string | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          username: string
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          created_at?: string | null
          display_name?: string
          home_city?: string | null
          id?: string
          is_demo?: boolean | null
          is_out?: boolean | null
          last_active_at?: string | null
          last_known_lat?: number | null
          last_known_lng?: number | null
          last_location_at?: string | null
          location_sharing_level?: string | null
          username?: string
        }
        Relationships: []
      }
      stories: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          is_demo: boolean | null
          media_type: string
          media_url: string
          user_id: string
          venue_name: string | null
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          is_demo?: boolean | null
          media_type: string
          media_url: string
          user_id: string
          venue_name?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          is_demo?: boolean | null
          media_type?: string
          media_url?: string
          user_id?: string
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
        ]
      }
      venues: {
        Row: {
          created_at: string | null
          id: string
          is_demo: boolean | null
          is_promoted: boolean | null
          lat: number
          lng: number
          name: string
          neighborhood: string
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat: number
          lng: number
          name: string
          neighborhood: string
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_demo?: boolean | null
          is_promoted?: boolean | null
          lat?: number
          lng?: number
          name?: string
          neighborhood?: string
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
        ]
      }
      yap_comments: {
        Row: {
          author_handle: string | null
          created_at: string | null
          id: string
          is_anonymous: boolean | null
          text: string
          user_id: string
          yap_id: string
        }
        Insert: {
          author_handle?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          text: string
          user_id: string
          yap_id: string
        }
        Update: {
          author_handle?: string | null
          created_at?: string | null
          id?: string
          is_anonymous?: boolean | null
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
      [_ in never]: never
    }
    Functions: {
      can_see_location: {
        Args: { target_user_id: string; viewer_id: string }
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
    }
    Enums: {
      friendship_status_enum: "pending" | "accepted" | "blocked"
      night_status_enum: "out" | "heading_out" | "home"
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
      friendship_status_enum: ["pending", "accepted", "blocked"],
      night_status_enum: ["out", "heading_out", "home"],
    },
  },
} as const
