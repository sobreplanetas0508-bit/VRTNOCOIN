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
