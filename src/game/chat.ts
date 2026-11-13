import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { ApiError } from "./api";

export const CHAT_MAX_LENGTH = 200;
export const CHAT_HISTORY = 50;

export interface ChatMessage {
  id: number;
  playerId: string;
  username: string;
  influencer: boolean;
  owner: boolean;
  body: string;
  createdAt: string;
}

type Row = {
  id: number;
  player_id: string;
  username: string;
  influencer: boolean;
  owner: boolean;
  body: string;
  created_at: string;
};

const fromRow = (r: Row): ChatMessage => ({
  id: r.id,
  playerId: r.player_id,
  username: r.username,
  influencer: r.influencer,
  owner: r.owner,
  body: r.body,
  createdAt: r.created_at,
});

/** Last messages of the global chat, oldest first. */
export async function loadChat(): Promise<ChatMessage[]> {
  const { data, error } = await supabase
    .from("chat_messages")
    .select("id, player_id, username, influencer, owner, body, created_at")
    .order("id", { ascending: false })
    .limit(CHAT_HISTORY);
  if (error) throw new ApiError("Não foi possível carregar o chat.", 0);
  return (data as Row[]).map(fromRow).reverse();
}

export async function sendChat(body: string): Promise<ChatMessage> {
  const { data, error } = await supabase.rpc("send_chat_message", { p_body: body });
  if (error) throw new ApiError(error.message || "Algo deu errado.", 400);
  return data as unknown as ChatMessage;
}

/** Listens for new chat messages while the player is signed in. */
export class ChatSync {
  private channel: RealtimeChannel | null = null;
  constructor(private onMessage: (m: ChatMessage) => void) {}

  start() {
    if (this.channel) return;
    this.channel = supabase
      .channel(`chat-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "chat_messages" }, ({ new: row }) =>
        this.onMessage(fromRow(row as Row)),
      )
      .subscribe();
  }

  stop() {
    if (this.channel) void supabase.removeChannel(this.channel);
    this.channel = null;
  }
}
