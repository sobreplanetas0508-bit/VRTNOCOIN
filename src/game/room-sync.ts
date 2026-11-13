import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

/** Live state a racer shares with the rest of the room while running. */
export interface RaceProgress {
  id: string;
  username: string;
  raceId: number;
  ms: number;
  frozen: boolean;
  done: boolean;
}

/**
 * Keeps one room in sync: database changes (players joining, race start/end) trigger a refetch,
 * and racers broadcast their timer to each other during a race.
 */
export class RoomSync {
  private db: RealtimeChannel | null = null;
  private live: RealtimeChannel | null = null;
  private roomId: string | null = null;
  private changeTimer = 0;

  constructor(
    private onChange: () => void,
    private onProgress: (p: RaceProgress) => void,
  ) {}

  watch(roomId: string | null) {
    if (roomId === this.roomId) return;
    this.stop();
    this.roomId = roomId;
    if (!roomId) return;
    const changed = () => {
      clearTimeout(this.changeTimer);
      this.changeTimer = window.setTimeout(() => this.onChange(), 150);
    };
    this.db = supabase
      .channel(`roomdb-${roomId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, changed)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
        changed,
      )
      .subscribe();
    this.live = supabase
      .channel(`room-live-${roomId}`, { config: { broadcast: { self: false } } })
      .on("broadcast", { event: "progress" }, ({ payload }) => this.onProgress(payload as RaceProgress))
      .subscribe();
  }

  send(p: RaceProgress) {
    void this.live?.send({ type: "broadcast", event: "progress", payload: p });
  }

  stop() {
    clearTimeout(this.changeTimer);
    if (this.db) void supabase.removeChannel(this.db);
    if (this.live) void supabase.removeChannel(this.live);
    this.db = this.live = null;
    this.roomId = null;
  }
}
