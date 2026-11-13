// @ts-nocheck -- ported verbatim from the original game; written for a looser TypeScript config.
import { Game, type RunResult } from "./engine";
import { api, formatTime, ApiError, type PlayerData, type LeaderboardEntry } from "./api";
import { SKINS, LEADERBOARD_SIZE } from "./skins";

let started = false;

/** Wires the game UI to the DOM rendered by the home page. Runs once per page load. */
export function initApp() {
  if (started) return;
  started = true;

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;
const show = (el: HTMLElement, on = true) => el.classList.toggle("hidden", !on);

const screens = {
  auth: $("#screen-auth"),
  menu: $("#screen-menu"),
  pause: $("#screen-pause"),
  over: $("#screen-over"),
};
type ScreenName = keyof typeof screens | "none";
function showScreen(name: ScreenName) {
  for (const [k, el] of Object.entries(screens)) show(el, k === name);
  show($("#hud"), name === "none" || name === "pause");
}

let player: PlayerData | null = null;
let rank: number | null = null;
let previewSkin: string | null = null;
let activeTab = "play";

// ------------------------------------------------------------------ toast
let toastTimer = 0;
function toast(msg: string, kind: "ok" | "err" = "ok") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = `toast ${kind}`;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => t.classList.add("hidden"), 2800);
}

// ------------------------------------------------------------------ game
const timerEl = $("#timer");
const timerValue = $("#timer-value");
const timerLabel = $("#timer-label");
const hudCoins = $("#hud-coins");
const coinAlert = $("#coin-alert");

const game = new Game($<HTMLCanvasElement>("#game"), {
  onTick({ noCoinMs }) {
    timerValue.textContent = formatTime(noCoinMs);
  },
  onFirstCoin() {
    timerEl.classList.add("frozen");
    timerLabel.textContent = "PARADO";
    show(coinAlert);
    setTimeout(() => show(coinAlert, false), 2600);
  },
  onCoin(total) {
    hudCoins.textContent = String(total);
    hudCoins.parentElement!.classList.remove("bump");
    void hudCoins.offsetWidth;
    hudCoins.parentElement!.classList.add("bump");
  },
  onGameOver(r) {
    void finishRun(r);
  },
});

async function startRun() {
  if (!player) return;
  const btns = [$<HTMLButtonElement>("#btn-play"), $<HTMLButtonElement>("#btn-again")];
  btns.forEach((b) => (b.disabled = true));
  try {
    const settings = await api.settings();
    game.setTimerMultiplier(settings.multiplier);
    await api.startRun();
  } catch (e) {
    toast(errMsg(e), "err");
    if (e instanceof ApiError && e.status === 401) logout();
    return;
  } finally {
    btns.forEach((b) => (b.disabled = false));
  }
  game.setSkin(player.selectedSkin);
  previewSkin = null;
  timerEl.classList.remove("frozen");
  timerLabel.textContent = "SEM MOEDAS";
  timerValue.textContent = formatTime(0);
  hudCoins.textContent = "0";
  show(coinAlert, false);
  showScreen("none");
  const hint = $("#controls-hint");
  hint.classList.remove("fade");
  void hint.offsetWidth;
  hint.classList.add("fade");
  game.start();
}

async function finishRun(r: RunResult) {
  $("#over-time").textContent = formatTime(r.noCoinMs);
  $("#over-coins").textContent = String(r.coins);
  $("#over-rank").textContent = "…";
  $("#over-title").textContent = "Fim de corrida!";
  $("#over-msg").textContent = "Salvando no ranking global…";
  $("#over-msg").className = "form-msg";
  showScreen("over");
  try {
    const res = await api.finishRun(r.noCoinMs, r.coins, r.runMs);
    player = res.player;
    const me = await api.me();
    rank = me.rank;
    $("#over-rank").textContent = rank ? `#${rank}` : "—";
    if (res.isRecord) {
      $("#over-title").textContent = "Novo recorde!";
      $("#over-msg").textContent =
        rank && rank <= LEADERBOARD_SIZE ? `Você está no Top ${LEADERBOARD_SIZE} global!` : "Seu melhor tempo foi atualizado.";
      $("#over-msg").className = "form-msg ok";
    } else {
      $("#over-msg").textContent = `Seu recorde: ${formatTime(player.bestTimeMs)}`;
    }
    renderPlayer();
  } catch (e) {
    $("#over-msg").textContent = errMsg(e);
    $("#over-msg").className = "form-msg err";
    $("#over-rank").textContent = "—";
  }
}

$("#btn-play").addEventListener("click", startRun);
$("#btn-again").addEventListener("click", startRun);
$("#btn-menu").addEventListener("click", () => openMenu());
$("#btn-pause").addEventListener("click", pause);
$("#btn-resume").addEventListener("click", resume);
$("#btn-quit").addEventListener("click", () => {
  // Quitting ends the run as a normal crash would, so the time still counts
  game.quit();
  showScreen("none");
});

function pause() {
  if (!game.isRunning) return;
  game.pause();
  showScreen("pause");
}
function resume() {
  game.resume();
  showScreen("none");
}
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" || e.key.toLowerCase() === "p") {
    if (game.isRunning) pause();
    else if (game.isPaused) resume();
  }
});
document.addEventListener("visibilitychange", () => {
  if (document.hidden) pause();
});

// ------------------------------------------------------------------ auth
let authMode: "register" | "login" = "register";
document.querySelectorAll<HTMLButtonElement>("[data-auth]").forEach((b) =>
  b.addEventListener("click", () => {
    authMode = b.dataset.auth as typeof authMode;
    document.querySelectorAll("[data-auth]").forEach((x) => x.classList.toggle("active", x === b));
    $("#auth-submit").textContent = authMode === "register" ? "Criar conta e jogar" : "Entrar";
    $<HTMLInputElement>("#auth-pass").autocomplete = authMode === "register" ? "new-password" : "current-password";
    $("#auth-error").textContent = "";
  }),
);

$("#auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const username = $<HTMLInputElement>("#auth-user").value.trim();
  const password = $<HTMLInputElement>("#auth-pass").value;
  const btn = $<HTMLButtonElement>("#auth-submit");
  btn.disabled = true;
  $("#auth-error").textContent = "";
  try {
    const res = authMode === "register" ? await api.register(username, password) : await api.login(username, password);
    player = res.player;
    rank = null;
    $<HTMLInputElement>("#auth-pass").value = "";
    toast(authMode === "register" ? `Bem-vindo, ${player.username}!` : `Olá de novo, ${player.username}!`);
    await refreshMe();
    openMenu();
  } catch (err) {
    $("#auth-error").textContent = errMsg(err);
  } finally {
    btn.disabled = false;
  }
});

function logout() {
  void api.logout().catch(() => {});
  player = null;
  game.toIdle();
  showScreen("auth");
}
$("#btn-logout").addEventListener("click", logout);

async function refreshMe() {
  const res = await api.me();
  player = res.player;
  rank = res.rank;
  renderPlayer();
}

// ------------------------------------------------------------------ menu
function openMenu() {
  game.toIdle();
  if (player) game.setSkin(player.selectedSkin);
  previewSkin = null;
  renderPlayer();
  setTab(activeTab);
  showScreen("menu");
}

function renderPlayer() {
  if (!player) return;
  $("#me-name").textContent = player.username;
  $("#me-best").textContent = formatTime(player.bestTimeMs);
  $("#me-rank").textContent = rank ? `#${rank}` : "—";
  $("#me-coins").textContent = String(player.coins);
  renderSkins();
}

document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) =>
  t.addEventListener("click", () => setTab(t.dataset.tab!)),
);

function setTab(tab: string) {
  activeTab = tab;
  document.querySelectorAll<HTMLButtonElement>(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === tab));
  for (const id of ["play", "skins", "codes", "ranking", "admin"]) show($(`#tab-${id}`), id === tab);
  if (tab !== "skins" && previewSkin && player) {
    previewSkin = null;
    game.setSkin(player.selectedSkin);
    renderSkins();
  }
  if (tab === "ranking") void loadRanking();
}

// ------------------------------------------------------------------ skins
function renderSkins() {
  if (!player) return;
  const grid = $("#skin-grid");
  const viewing = previewSkin ?? player.selectedSkin;
  grid.innerHTML = "";
  for (const s of SKINS) {
    const owned = player.ownedSkins.includes(s.id);
    const selected = player.selectedSkin === s.id;
    const card = document.createElement("div");
    card.className = `skin-card skin-${s.id}${viewing === s.id ? " viewing" : ""}${owned ? " owned" : ""}`;
    card.innerHTML = `
      <div class="skin-swatch" aria-hidden="true"></div>
      <div class="skin-info">
        <div class="skin-name">${s.name}${s.price === null ? ' <span class="badge">Exclusivo</span>' : ""}</div>
        <div class="skin-desc">${s.description}</div>
      </div>`;
    const action = document.createElement("button");
    action.className = "btn btn-sm";
    if (selected) {
      action.textContent = "Usando";
      action.disabled = true;
      action.classList.add("btn-ghost");
    } else if (owned) {
      action.textContent = "Usar";
      action.classList.add("btn-primary");
      action.onclick = (e) => {
        e.stopPropagation();
        void selectSkin(s.id);
      };
    } else if (s.price === null) {
      action.innerHTML = "🔒 Só com código";
      action.classList.add("btn-ghost");
      action.onclick = (e) => {
        e.stopPropagation();
        setTab("codes");
        $<HTMLInputElement>("#code-input").focus();
      };
    } else {
      action.innerHTML = `<span class="coin-ico"></span> ${s.price}`;
      action.classList.add("btn-buy");
      if (player.coins < s.price) action.classList.add("cant");
      action.onclick = (e) => {
        e.stopPropagation();
        void buySkin(s.id, s.price!);
      };
    }
    card.appendChild(action);
    card.addEventListener("click", () => {
      previewSkin = s.id;
      game.setSkin(s.id);
      renderSkins();
    });
    grid.appendChild(card);
  }
}

async function buySkin(id: string, price: number) {
  if (!player) return;
  if (player.coins < price) {
    toast(`Faltam ${price - player.coins} moedas. Pegue moedas nas corridas!`, "err");
    return;
  }
  try {
    const res = await api.buySkin(id);
    player = res.player;
    previewSkin = null;
    game.setSkin(player.selectedSkin);
    renderPlayer();
    toast(`${SKINS.find((s) => s.id === id)?.name} desbloqueado!`);
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

async function selectSkin(id: string) {
  try {
    const res = await api.selectSkin(id);
    player = res.player;
    previewSkin = null;
    game.setSkin(player.selectedSkin);
    renderPlayer();
  } catch (e) {
    toast(errMsg(e), "err");
  }
}

// ------------------------------------------------------------------ codes
$("#code-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const input = $<HTMLInputElement>("#code-input");
  const msg = $("#code-msg");
  const code = input.value.trim();
  if (!code) return;
  msg.textContent = "Verificando…";
  msg.className = "form-msg";
  try {
    const res = await api.redeem(code);
    player = res.player;
    input.value = "";
    msg.textContent = `Código aceito! ${res.unlocked} desbloqueado e equipado.`;
    msg.className = "form-msg ok";
    game.setSkin(player.selectedSkin);
    renderPlayer();
  } catch (err) {
    msg.textContent = errMsg(err);
    msg.className = "form-msg err";
  }
});

// ------------------------------------------------------------------ ranking
const SKIN_NAMES = Object.fromEntries(SKINS.map((s) => [s.id, s.name]));

async function loadRanking() {
  const list = $("#ranking");
  if (!list.children.length) list.innerHTML = `<li class="rank-empty">Carregando ranking…</li>`;
  try {
    const { entries } = await api.leaderboard();
    renderRanking(entries);
  } catch (e) {
    list.innerHTML = `<li class="rank-empty">${escapeHtml(errMsg(e))}</li>`;
  }
}

function renderRanking(entries: LeaderboardEntry[]) {
  const list = $("#ranking");
  if (!entries.length) {
    list.innerHTML = `<li class="rank-empty">Ninguém no ranking ainda. Seja o primeiro!</li>`;
    return;
  }
  list.innerHTML = entries
    .map((e, i) => {
      const me = player && e.username === player.username;
      const pos = i + 1;
      return `<li class="rank-row${pos <= 3 ? ` top top-${pos}` : ""}${me ? " me" : ""}">
        <span class="rank-pos">${pos}</span>
        <span class="rank-dot skin-${escapeHtml(e.skin)}"></span>
        <span class="rank-name">${escapeHtml(e.username)}<small>${escapeHtml(SKIN_NAMES[e.skin] ?? "")}</small></span>
        <span class="rank-time">${formatTime(e.bestTimeMs)}</span>
      </li>`;
    })
    .join("");
}
$("#btn-refresh-rank").addEventListener("click", () => void loadRanking());

// ------------------------------------------------------------------ utils
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Algo deu errado.";
}
function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

// ------------------------------------------------------------------ boot
(async () => {
  if (await api.hasSession()) {
    try {
      await refreshMe();
      openMenu();
      return;
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) void api.logout().catch(() => {});
      else toast(errMsg(e), "err");
    }
  }
  showScreen("auth");
})();

// ADM actions. Password is kept only in memory, not localStorage.
let adminPassword = "";
$("#admin-login").addEventListener("click", async () => {
  try {
    const password = $<HTMLInputElement>("#admin-password").value;
    await api.admin("status", password);
    adminPassword = password;
    $<HTMLInputElement>("#admin-password").value = "";
    show($("#admin-controls")); toast("Acesso ADM liberado!");
  } catch (e) { toast(errMsg(e), "err"); }
});
async function adminAction(path: string, body: unknown) {
  try { await api.admin(path, adminPassword, body); toast("Alteração salva!"); }
  catch (e) { toast(errMsg(e), "err"); }
}
$("#admin-send").addEventListener("click", () => void adminAction("coins", {
  username: $<HTMLInputElement>("#admin-nick").value,
  amount: Number($<HTMLInputElement>("#admin-amount").value)
}));
for (const [id, enabled] of [["#admin-influencer-on", true], ["#admin-influencer-off", false]] as const) {
  $(id).addEventListener("click", () => void adminAction("influencer", {
    username: $<HTMLInputElement>("#admin-influencer-nick").value, enabled
  }));
}
$("#admin-timer-normal").addEventListener("click", () => void adminAction("timer", { multiplier: 1 }));
$("#admin-timer-fast").addEventListener("click", () => void adminAction("timer", { multiplier: 1.5 }));

}
