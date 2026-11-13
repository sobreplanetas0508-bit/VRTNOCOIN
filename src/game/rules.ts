// Display and room rules shared by the game UI (the database enforces the same limits).

export const ROOM_MIN_PLAYERS = 2;
export const ROOM_MAX_PLAYERS = 10;

/** Timer speeds the ADM panel can choose. */
export const TIMER_SPEEDS = [1, 1.5, 2, 3, 4, 5] as const;

/** Where an ADM timer speed applies. */
export type TimerScope = "server" | "me";

export function normalizeTimerSpeed(value: number): number {
  return (TIMER_SPEEDS as readonly number[]).includes(value) ? value : 1;
}

export const OWNER_TAG = "DONO DO JOGO🔥";
export const INFLUENCER_TAG = "INFLUENCER🔥";

/** Tags shown next to a nickname. The owner tag replaces the influencer one. */
export function playerTags(p: { influencer?: boolean | null; owner?: boolean | null }): string[] {
  if (p.owner) return [OWNER_TAG];
  if (p.influencer) return [INFLUENCER_TAG];
  return [];
}

/** "1x", "1,5x", "5x" (pt-BR decimal comma). */
export function formatSpeed(value: number): string {
  return `${String(value).replace(".", ",")}x`;
}
