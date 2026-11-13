// Client-safe rules for nickname accounts. Players never see an email: the sign-in
// address is derived from the nickname so the same nickname always maps to one account.

export const USERNAME_RE = /^[a-zA-Z0-9_.\-]{3,16}$/;
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

const ACCOUNT_DOMAIN = "jogadores.fugadostrilhos.app";

export function normalizeUsername(username: string) {
  return username.trim().toLowerCase();
}

/** Deterministic, email-safe sign-in address for a nickname. */
export function usernameToEmail(username: string) {
  const hex = Array.from(new TextEncoder().encode(normalizeUsername(username)))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `u-${hex}@${ACCOUNT_DOMAIN}`;
}

export function validateRegistration(username: string, password: string): string | null {
  if (!USERNAME_RE.test(username.trim())) {
    return "O nome deve ter de 3 a 16 caracteres (letras, números, _ . -).";
  }
  if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
    return `A senha deve ter pelo menos ${PASSWORD_MIN} caracteres.`;
  }
  return null;
}
