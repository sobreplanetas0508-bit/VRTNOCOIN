// Player-side visual settings, saved only on this device.

export interface CoinColor {
  id: string;
  name: string;
  main: string;
  dark: string;
}

export const COIN_COLORS: CoinColor[] = [
  { id: "ouro", name: "Dourada", main: "#ffc300", dark: "#b37800" },
  { id: "prata", name: "Prata", main: "#d1d5db", dark: "#6b7280" },
  { id: "rosa", name: "Rosa", main: "#f472b6", dark: "#9d174d" },
  { id: "azul", name: "Azul", main: "#38bdf8", dark: "#075985" },
  { id: "verde", name: "Verde", main: "#4ade80", dark: "#166534" },
  { id: "vermelha", name: "Vermelha", main: "#ef4444", dark: "#7f1d1d" },
  { id: "roxa", name: "Roxa", main: "#a855f7", dark: "#581c87" },
];

const KEY = "fdt-coin-color";
const DEFAULT_COLOR: CoinColor = COIN_COLORS[0]!;

export function coinColor(id: string | null | undefined): CoinColor {
  return COIN_COLORS.find((c) => c.id === id) ?? DEFAULT_COLOR;
}

export function loadCoinColor(): CoinColor {
  try { return coinColor(localStorage.getItem(KEY)); } catch { return DEFAULT_COLOR; }
}

export function saveCoinColor(id: string) {
  try { localStorage.setItem(KEY, id); } catch { /* private mode */ }
}

// ---------------------------------------------------------------- trails
export type TrailId = "none" | "fogo" | "arco-iris" | "estrelas" | "neon" | "fumaca";

export interface TrailStyle {
  id: TrailId;
  name: string;
  colors: string[];
  /** Upward drift of the particles (units per second). */
  rise: number;
}

export const TRAILS: TrailStyle[] = [
  { id: "none", name: "Sem rastro", colors: ["#ffffff"], rise: 0 },
  { id: "fogo", name: "Fogo", colors: ["#ff4d00", "#ff9e00", "#ffd23f"], rise: 1.6 },
  { id: "arco-iris", name: "Arco-íris", colors: ["#ffffff"], rise: 0.2 },
  { id: "estrelas", name: "Estrelas", colors: ["#fff3b0", "#ffd23f", "#ffffff"], rise: 0.8 },
  { id: "neon", name: "Neon", colors: ["#00f5d4", "#9b5de5", "#f15bb5"], rise: 0 },
  { id: "fumaca", name: "Fumaça", colors: ["#9ca3af", "#d1d5db", "#6b7280"], rise: 1.1 },
];

export function trailStyle(id: string | null | undefined): TrailStyle {
  return TRAILS.find((t) => t.id === id) ?? TRAILS[0]!;
}

// ---------------------------------------------------------------- generic device prefs
export interface Prefs {
  trail: TrailId;
  lava: boolean;
  showFps: boolean;
  lowMode: boolean;
  /** Timer position as fractions of the screen (center x, top y); null = default spot. */
  timerPos: { x: number; y: number } | null;
  timerScale: number;
}

const PREFS_KEY = "fdt-prefs";
export const DEFAULT_PREFS: Prefs = { trail: "none", lava: false, showFps: false, lowMode: false, timerPos: null, timerScale: 1 };

export function loadPrefs(): Prefs {
  try {
    const raw = JSON.parse(localStorage.getItem(PREFS_KEY) ?? "{}");
    return { ...DEFAULT_PREFS, ...raw, trail: trailStyle(raw.trail).id };
  } catch { return { ...DEFAULT_PREFS }; }
}

export function savePrefs(p: Prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* private mode */ }
}
