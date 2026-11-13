import { supabase } from "@/integrations/supabase/client";
import { adminAction, registerPlayer } from "@/lib/game.functions";
import { usernameToEmail, validateRegistration } from "@/lib/player-account";
import { SKINS } from "./skins";

export interface PlayerData {
  id: string;
  username: string;
  coins: number;
  ownedSkins: string[];
  selectedSkin: string;
  bestTimeMs: number;
  influencer?: boolean;
  owner?: boolean;
}

export interface LeaderboardEntry {
  username: string;
  bestTimeMs: number;
  skin: string;
  influencer?: boolean;
  owner?: boolean;
}

export interface RoomPlayer {
  id: string;
  username: string;
  skin: string;
  influencer: boolean;
  owner: boolean;
  racing: boolean;
  lastRaceId: number | null;
  lastTimeMs: number | null;
  lastCoins: number | null;
}

export interface RoomState {
  room: {
    id: string;
    code: string;
    hostId: string;
    hostName: string;
    isPublic: boolean;
    maxPlayers: number;
    status: "waiting" | "racing";
    raceId: number;
    startedAt: string | null;
  };
  players: RoomPlayer[];
}

export interface OpenRoom {
  code: string;
  hostName: string;
  hostInfluencer: boolean;
  hostOwner: boolean;
  players: number;
  maxPlayers: number;
  status: "waiting" | "racing";
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

const LOGIN_REQUIRED = "Faça login para continuar.";

async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as (
    f: string,
    a?: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>)(fn, args);
  if (error) {
    const msg = error.message || "Algo deu errado.";
    throw new ApiError(msg, msg === LOGIN_REQUIRED ? 401 : 400);
  }
  return data as T;
}

async function signIn(username: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email: usernameToEmail(username), password });
  if (error) {
    if (error.message.toLowerCase().includes("fetch")) throw new ApiError("Sem conexão com o servidor.", 0);
    throw new ApiError("Nome ou senha incorretos.", 401);
  }
}

type PlayerRes = { player: PlayerData };
type MeRes = { player: PlayerData; rank: number | null };

export const api = {
  hasSession: async () => !!(await supabase.auth.getSession()).data.session,
  /** Timer speed for the signed-in player: their personal speed if set, otherwise the server speed. */
  settings: async () => {
    const value = await rpc<number | null>("my_timer_multiplier");
    return { multiplier: (value ?? 100) / 100 };
  },
  admin: async (path: string, password: string, body?: Record<string, unknown>) => {
    const res = await adminAction({ data: { ...(body ?? {}), action: path, password } as never });
    if (!res.ok) throw new ApiError(res.error || "Erro ADM", 403);
    return res;
  },
  register: async (username: string, password: string) => {
    const invalid = validateRegistration(username, password);
    if (invalid) throw new ApiError(invalid, 400);
    const res = await registerPlayer({ data: { username, password } });
    if (!res.ok) throw new ApiError(res.error, 400);
    await signIn(username, password);
    return rpc<MeRes>("get_me");
  },
  login: async (username: string, password: string) => {
    await signIn(username, password);
    return rpc<MeRes>("get_me");
  },
  logout: async () => {
    await supabase.auth.signOut();
    return { ok: true as const };
  },
  me: () => rpc<MeRes>("get_me"),
  leaderboard: async () => {
    const rows = await rpc<
      { username: string; best_time_ms: number; skin: string; influencer: boolean; owner: boolean }[]
    >("get_leaderboard");
    return {
      entries: (rows ?? []).map((r) => ({
        username: r.username,
        bestTimeMs: r.best_time_ms,
        skin: r.skin,
        influencer: r.influencer,
        owner: r.owner,
      })) as LeaderboardEntry[],
    };
  },
  startRun: async () => {
    await rpc("start_run");
    return { ok: true as const };
  },
  finishRun: (timeMs: number, coins: number, runMs: number) =>
    rpc<PlayerRes & { isRecord: boolean; timeMs: number; coins: number }>("finish_run", {
      p_time_ms: Math.floor(timeMs),
      p_coins: Math.floor(coins),
      p_run_ms: Math.floor(runMs),
    }),
  buySkin: (skin: string) => rpc<PlayerRes>("buy_skin", { p_skin: skin }),
  selectSkin: (skin: string) => rpc<PlayerRes>("select_skin", { p_skin: skin }),
  redeem: async (code: string) => {
    const res = await rpc<PlayerRes & { unlocked: string }>("redeem_code", { p_code: code });
    return { ...res, unlocked: SKINS.find((s) => s.id === res.unlocked)?.name ?? res.unlocked };
  },
  myRoom: () => rpc<RoomState | null>("get_my_room"),
  openRooms: async () => {
    const rows = await rpc<
      {
        code: string;
        host_name: string;
        host_influencer: boolean;
        host_owner: boolean;
        players: number;
        max_players: number;
        status: "waiting" | "racing";
      }[]
    >("list_open_rooms");
    return (rows ?? []).map(
      (r): OpenRoom => ({
        code: r.code,
        hostName: r.host_name,
        hostInfluencer: r.host_influencer,
        hostOwner: r.host_owner,
        players: r.players,
        maxPlayers: r.max_players,
        status: r.status,
      }),
    );
  },
  createRoom: (maxPlayers: number, isPublic: boolean) =>
    rpc<RoomState>("create_room", { p_max_players: maxPlayers, p_public: isPublic }),
  joinRoom: (code: string) => rpc<RoomState>("join_room", { p_code: code }),
  leaveRoom: () => rpc<null>("leave_room"),
  startRoomRace: () => rpc<RoomState>("start_room_race"),
  endRoomRace: () => rpc<RoomState>("end_room_race"),
};

export function formatTime(ms: number) {
  const total = Math.max(0, Math.floor(ms / 10));
  const cs = total % 100;
  const s = Math.floor(total / 100) % 60;
  const m = Math.floor(total / 6000);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(cs).padStart(2, "0")}`;
}
