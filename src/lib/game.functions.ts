import { createServerFn } from "@tanstack/react-start";
import { USERNAME_RE, usernameToEmail, validateRegistration } from "./player-account";

type Result = { ok: true } | { ok: false; error: string };

/** Creates a nickname account (already confirmed) and its player profile. */
export const registerPlayer = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => ({
    username: String(input?.username ?? "").trim(),
    password: String(input?.password ?? ""),
  }))
  .handler(async ({ data }): Promise<Result> => {
    const invalid = validateRegistration(data.username, data.password);
    if (invalid) return { ok: false, error: invalid };

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: taken, error: takenErr } = await supabaseAdmin.rpc("username_taken", {
      p_username: data.username,
    });
    if (takenErr) {
      console.error("username_taken failed", takenErr);
      return { ok: false, error: "Erro interno no servidor. Tente novamente." };
    }
    if (taken) return { ok: false, error: "Esse nome de jogador já existe." };

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username: data.username },
    });
    if (createErr || !created.user) {
      console.error("createUser failed", createErr);
      const msg = createErr?.message?.toLowerCase() ?? "";
      if (msg.includes("already")) return { ok: false, error: "Esse nome de jogador já existe." };
      if (msg.includes("password")) {
        return { ok: false, error: "Senha muito fraca ou muito comum. Escolha outra senha." };
      }
      return { ok: false, error: "Erro interno no servidor. Tente novamente." };
    }

    const { error: profileErr } = await supabaseAdmin
      .from("profiles")
      .insert({ id: created.user.id, username: data.username });
    if (profileErr) {
      console.error("profile insert failed", profileErr);
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      if (profileErr.code === "23505") return { ok: false, error: "Esse nome de jogador já existe." };
      return { ok: false, error: "Erro interno no servidor. Tente novamente." };
    }
    return { ok: true };
  });

function safeEqual(a: string, b: string) {
  const ea = new TextEncoder().encode(a);
  const eb = new TextEncoder().encode(b);
  let diff = ea.length ^ eb.length;
  for (let i = 0; i < Math.max(ea.length, eb.length); i++) diff |= (ea[i] ?? 0) ^ (eb[i] ?? 0);
  return diff === 0;
}

type AdminInput =
  | { password: string; action: "status" }
  | { password: string; action: "coins"; username: string; amount: number }
  | { password: string; action: "influencer"; username: string; enabled: boolean }
  | { password: string; action: "timer"; multiplier: number };

/** Admin panel actions, protected by the ADMIN_PASSWORD secret (checked on the server only). */
export const adminAction = createServerFn({ method: "POST" })
  .inputValidator((input: AdminInput) => input)
  .handler(async ({ data }): Promise<Result> => {
    const expected = process.env["ADMIN_PASSWORD"];
    const supplied = typeof data?.password === "string" ? data.password : "";
    if (!expected || !supplied || !safeEqual(supplied, expected)) {
      return { ok: false, error: "Senha ADM incorreta ou não configurada." };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    switch (data.action) {
      case "status":
        return { ok: true };
      case "coins": {
        const username = String(data.username ?? "").trim();
        const amount = Math.floor(Number(data.amount));
        if (!USERNAME_RE.test(username) || !Number.isSafeInteger(amount) || amount <= 0 || amount > 1_000_000) {
          return { ok: false, error: "Informe um Nick e uma quantidade entre 1 e 1.000.000." };
        }
        const { data: rows, error } = await supabaseAdmin.rpc("admin_add_coins", {
          p_username: username,
          p_amount: amount,
        });
        if (error) {
          console.error(error);
          return { ok: false, error: "Erro interno no servidor. Tente novamente." };
        }
        if (!rows?.length) return { ok: false, error: "Jogador não encontrado." };
        return { ok: true };
      }
      case "influencer": {
        const username = String(data.username ?? "").trim();
        if (!USERNAME_RE.test(username) || typeof data.enabled !== "boolean") {
          return { ok: false, error: "Dados inválidos." };
        }
        const { data: n, error } = await supabaseAdmin.rpc("admin_set_influencer", {
          p_username: username,
          p_enabled: data.enabled,
        });
        if (error) {
          console.error(error);
          return { ok: false, error: "Erro interno no servidor. Tente novamente." };
        }
        if (!n) return { ok: false, error: "Jogador não encontrado." };
        return { ok: true };
      }
      case "timer": {
        if (![1, 1.5, 2].includes(data.multiplier)) return { ok: false, error: "Multiplicador inválido." };
        const { error } = await supabaseAdmin
          .from("game_settings")
          .upsert({ id: 1, timer_multiplier: Math.round(data.multiplier * 100) });
        if (error) {
          console.error(error);
          return { ok: false, error: "Erro interno no servidor. Tente novamente." };
        }
        return { ok: true };
      }
      default:
        return { ok: false, error: "Rota não encontrada." };
    }
  });
