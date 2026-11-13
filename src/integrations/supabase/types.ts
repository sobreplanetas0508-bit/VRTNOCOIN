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
      chat_messages: {
        Row: {
          body: string
          created_at: string
          id: number
          influencer: boolean
          owner: boolean
          player_id: string
          username: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: never
          influencer?: boolean
          owner?: boolean
          player_id: string
          username: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: never
          influencer?: boolean
          owner?: boolean
          player_id?: string
          username?: string
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      game_settings: {
        Row: {
          id: number
          timer_multiplier: number
        }
        Insert: {
          id: number
          timer_multiplier?: number
        }
        Update: {
          id?: number
          timer_multiplier?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          best_time_at: string | null
          best_time_ms: number
          coins: number
          created_at: string
          id: string
          influencer: boolean
          legacy_id: number | null
          owned_skins: string[]
          owner: boolean
          redeemed_codes: string[]
          run_started_at: string | null
          selected_skin: string
          timer_multiplier: number | null
          username: string
        }
        Insert: {
          best_time_at?: string | null
          best_time_ms?: number
          coins?: number
          created_at?: string
          id: string
          influencer?: boolean
          legacy_id?: number | null
          owned_skins?: string[]
          owner?: boolean
          redeemed_codes?: string[]
          run_started_at?: string | null
          selected_skin?: string
          timer_multiplier?: number | null
          username: string
        }
        Update: {
          best_time_at?: string | null
          best_time_ms?: number
          coins?: number
          created_at?: string
          id?: string
          influencer?: boolean
          legacy_id?: number | null
          owned_skins?: string[]
          owner?: boolean
          redeemed_codes?: string[]
          run_started_at?: string | null
          selected_skin?: string
          timer_multiplier?: number | null
          username?: string
        }
        Relationships: []
      }
      redeem_codes: {
        Row: {
          code: string
          skin_id: string
        }
        Insert: {
          code: string
          skin_id: string
        }
        Update: {
          code?: string
          skin_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "redeem_codes_skin_id_fkey"
            columns: ["skin_id"]
            isOneToOne: false
            referencedRelation: "skins"
            referencedColumns: ["id"]
          },
        ]
      }
      room_players: {
        Row: {
          joined_at: string
          last_coins: number | null
          last_race_id: number | null
          last_time_ms: number | null
          player_id: string
          racing: boolean
          room_id: string
        }
        Insert: {
          joined_at?: string
          last_coins?: number | null
          last_race_id?: number | null
          last_time_ms?: number | null
          player_id: string
          racing?: boolean
          room_id: string
        }
        Update: {
          joined_at?: string
          last_coins?: number | null
          last_race_id?: number | null
          last_time_ms?: number | null
          player_id?: string
          racing?: boolean
          room_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "room_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "room_players_room_id_fkey"
            columns: ["room_id"]
            isOneToOne: false
            referencedRelation: "rooms"
            referencedColumns: ["id"]
          },
        ]
      }
      rooms: {
        Row: {
          code: string
          created_at: string
          host_id: string
          id: string
          is_public: boolean
          max_players: number
          race_id: number
          started_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          host_id: string
          id?: string
          is_public?: boolean
          max_players?: number
          race_id?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          host_id?: string
          id?: string
          is_public?: boolean
          max_players?: number
          race_id?: number
          started_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rooms_host_id_fkey"
            columns: ["host_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      skins: {
        Row: {
          id: string
          price: number | null
        }
        Insert: {
          id: string
          price?: number | null
        }
        Update: {
          id?: string
          price?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_add_coins: {
        Args: { p_amount: number; p_username: string }
        Returns: {
          coins: number
          username: string
        }[]
      }
      admin_set_influencer: {
        Args: { p_enabled: boolean; p_username: string }
        Returns: number
      }
      admin_set_personal_timer: {
        Args: { p_multiplier: number; p_username: string }
        Returns: number
      }
      buy_skin: { Args: { p_skin: string }; Returns: Json }
      create_room: {
        Args: { p_max_players: number; p_public: boolean }
        Returns: Json
      }
      current_player: {
        Args: never
        Returns: {
          best_time_at: string | null
          best_time_ms: number
          coins: number
          created_at: string
          id: string
          influencer: boolean
          legacy_id: number | null
          owned_skins: string[]
          owner: boolean
          redeemed_codes: string[]
          run_started_at: string | null
          selected_skin: string
          timer_multiplier: number | null
          username: string
        }
        SetofOptions: {
          from: "*"
          to: "profiles"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      end_room_race: { Args: never; Returns: Json }
      finish_run: {
        Args: { p_coins: number; p_run_ms: number; p_time_ms: number }
        Returns: Json
      }
      get_leaderboard: {
        Args: never
        Returns: {
          best_time_ms: number
          influencer: boolean
          owner: boolean
          skin: string
          username: string
        }[]
      }
      get_me: { Args: never; Returns: Json }
      get_my_room: { Args: never; Returns: Json }
      join_room: { Args: { p_code: string }; Returns: Json }
      leave_room: { Args: never; Returns: undefined }
      list_open_rooms: {
        Args: never
        Returns: {
          code: string
          host_influencer: boolean
          host_name: string
          host_owner: boolean
          max_players: number
          players: number
          status: string
        }[]
      }
      my_room_id: { Args: never; Returns: string }
      my_timer_multiplier: { Args: never; Returns: number }
      player_json: {
        Args: { p: Database["public"]["Tables"]["profiles"]["Row"] }
        Returns: Json
      }
      redeem_code: { Args: { p_code: string }; Returns: Json }
      room_remove_player: { Args: { p_player: string }; Returns: undefined }
      select_skin: { Args: { p_skin: string }; Returns: Json }
      send_chat_message: { Args: { p_body: string }; Returns: Json }
      start_room_race: { Args: never; Returns: Json }
      start_run: { Args: never; Returns: undefined }
      username_taken: { Args: { p_username: string }; Returns: boolean }
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
