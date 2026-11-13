// @ts-nocheck -- ported verbatim from the original game; written for a looser TypeScript config.
import { Game, type RunResult } from "./engine";
import { api, formatTime, ApiError, type PlayerData, type LeaderboardEntry, type RoomState, type OpenRoom } from "./api";
import { SKINS, LEADERBOARD_SIZE } from "./skins";
import { playerTags, OWNER_TAG, ROOM_MIN_PLAYERS, formatSpeed, normalizeTimerSpeed } from "./rules";
import { RoomSync, type RaceProgress } from "./room-sync";
import { ChatSync, loadChat, sendChat, type ChatMessage } from "./chat";

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

// Multiplayer room state
let room: RoomState | null = null;
let inRoomRace = false;
let raceSeen = 0;
let raceId = 0;
const live = new Map<string, RaceProgress>();
const sync = new RoomSync(
  () => void refreshRoom(),
  (p) => {
    if (!inRoomRace || p.raceId !== raceId) return;
    live.set(p.id, p);
    renderLive();
  },
);

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
  onTick({ noCoinMs, frozen }) {
    timerValue.textContent = formatTime(noCoinMs);
    if (inRoomRace) reportProgress(noCoinMs, frozen, false);
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
    if (inRoomRace) reportProgress(r.noCoinMs, true, true, true);
    void finishRun(r);
  },
});

async function startRun(): Promise<boolean> {
  if (!player) return false;
  const btns = [$<HTMLButtonElement>("#btn-play"), $<HTMLButtonElement>("#btn-again")];
  btns.forEach((b) => (b.disabled = true));
  try {
    const settings = await api.settings();
    game.setTimerMultiplier(settings.multiplier);
    const speedEl = $("#timer-speed");
    speedEl.textContent = `⏱ ${formatSpeed(normalizeTimerSpeed(settings.multiplier))}`;
    show(speedEl, normalizeTimerSpeed(settings.multiplier) !== 1);
    await api.startRun();
  } catch (e) {
    toast(errMsg(e), "err");
    if (e instanceof ApiError && e.status === 401) logout();
    return false;
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
  show($("#room-live"), inRoomRace);
  show($("#over-room"), inRoomRace);
  show($("#btn-room"), inRoomRace);
  show($("#btn-again"), !inRoomRace);
  renderLive();
  game.start();
  return true;
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
    if (inRoomRace) void refreshRoom();
  } catch (e) {
    $("#over-msg").textContent = errMsg(e);
    $("#over-msg").className = "form-msg err";
    $("#over-rank").textContent = "—";
  }
}

$("#btn-play").addEventListener("click", () => {
  inRoomRace = false;
  void startRun();
});
$("#btn-again").addEventListener("click", () => {
  inRoomRace = false;
  void startRun();
});
$("#btn-menu").addEventListener("click", () => {
  inRoomRace = false;
  openMenu();
});
$("#btn-room").addEventListener("click", () => {
  inRoomRace = false;
  activeTab = "rooms";
  openMenu();
});
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
    void refreshRoom();
  } catch (err) {
    $("#auth-error").textContent = errMsg(err);
  } finally {
    btn.disabled = false;
  }
});

function logout() {
  void api.logout().catch(() => {});
  player = null;
  room = null;
  inRoomRace = false;
  sync.watch(null);
  stopChat();
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
  startChat();
}

function renderPlayer() {
  if (!player) return;
  $("#me-name").textContent = player.username;
  $("#me-tags").innerHTML = tagsHtml(player);
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
  for (const id of ["play", "skins", "codes", "rooms", "chat", "ranking", "admin"]) show($(`#tab-${id}`), id === tab);
  if (tab !== "skins" && previewSkin && player) {
    previewSkin = null;
    game.setSkin(player.selectedSkin);
    renderSkins();
  }
  if (tab === "ranking") void loadRanking();
  if (tab === "rooms") void refreshRoom();
  $("#screen-menu .menu-panel").classList.toggle("chat-open", tab === "chat");
  if (tab === "chat") {
    chatUnread = false;
    renderChatBadge();
    scrollChat(true);
    if (!chatLoaded) void reloadChat();
  }
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
        <span class="rank-name"><span class="rank-line"><span class="rank-nick">${escapeHtml(e.username)}</span>${tagsHtml(e)}</span><small>${escapeHtml(SKIN_NAMES[e.skin] ?? "")}</small></span>
        <span class="rank-time">${formatTime(e.bestTimeMs)}</span>
      </li>`;
    })
    .join("");
}
$("#btn-refresh-rank").addEventListener("click", () => void loadRanking());

// ------------------------------------------------------------------ global chat
const chatMessages = new Map<number, ChatMessage>();
let chatLoaded = false;
let chatUnread = false;
const chatSync = new ChatSync((m) => addChat([m]));

function startChat() {
  chatSync.start();
  if (!chatLoaded) void reloadChat();
}
function stopChat() {
  chatSync.stop();
  chatMessages.clear();
  chatLoaded = false;
  chatUnread = false;
  $("#chat-list").innerHTML = "";
  renderChatBadge();
}
async function reloadChat() {
  try {
    const msgs = await loadChat();
    chatLoaded = true;
    addChat(msgs, true);
  } catch (e) {
    if (!chatMessages.size) $("#chat-list").innerHTML = `<li class="rank-empty">${escapeHtml(errMsg(e))}</li>`;
  }
}
function addChat(msgs: ChatMessage[], initial = false) {
  let fresh = false;
  for (const m of msgs) {
    if (chatMessages.has(m.id)) continue;
    chatMessages.set(m.id, m);
    if (!initial && m.playerId !== player?.id) fresh = true;
  }
  // Keep the newest 100 on screen.
  const ids = [...chatMessages.keys()].sort((a, b) => a - b);
  for (const id of ids.slice(0, Math.max(0, ids.length - 100))) chatMessages.delete(id);
  renderChat();
  if (fresh && !(activeTab === "chat" && isMenuOpen())) {
    chatUnread = true;
    renderChatBadge();
  }
}
function renderChatBadge() {
  document.querySelector('.tab[data-tab="chat"]')?.classList.toggle("has-unread", chatUnread);
}
function chatTime(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
function renderChat() {
  const list = $("#chat-list");
  const nearBottom = list.scrollHeight - list.scrollTop - list.clientHeight < 60;
  const msgs = [...chatMessages.values()].sort((a, b) => a.id - b.id);
  list.innerHTML = msgs.length
    ? msgs
        .map((m) => {
          const me = m.playerId === player?.id;
          return `<li class="chat-msg${me ? " me" : ""}">
        <div class="chat-meta"><span class="rank-line"><span class="rank-nick">${escapeHtml(m.username)}</span>${tagsHtml(m)}</span><time>${chatTime(m.createdAt)}</time></div>
        <div class="chat-body">${escapeHtml(m.body)}</div>
      </li>`;
        })
        .join("")
    : `<li class="rank-empty">Nenhuma mensagem ainda. Diga oi para todo mundo!</li>`;
  scrollChat(nearBottom);
}
function scrollChat(force: boolean) {
  const list = $("#chat-list");
  if (force) requestAnimationFrame(() => (list.scrollTop = list.scrollHeight));
}
$("#chat-form").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const input = $<HTMLInputElement>("#chat-input");
  const btn = $<HTMLButtonElement>("#chat-send");
  const text = input.value.trim();
  if (!text || btn.disabled) return;
  btn.disabled = true;
  try {
    const m = await sendChat(text);
    input.value = "";
    addChat([m]);
    scrollChat(true);
  } catch (e) {
    toast(errMsg(e), "err");
  } finally {
    btn.disabled = false;
    input.focus();
  }
});

// ------------------------------------------------------------------ utils
function errMsg(e: unknown) {
  return e instanceof Error ? e.message : "Algo deu errado.";
}
function tagsHtml(p: { influencer?: boolean; owner?: boolean }) {
  return playerTags(p)
    .map((t) => `<span class="ptag ${t === OWNER_TAG ? "ptag-owner" : "ptag-influencer"}">${t}</span>`)
    .join("");
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
      void refreshRoom();
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
    void refreshTimerStatus();
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
let adminSpeed = 1;
document.querySelectorAll<HTMLButtonElement>("#admin-speeds [data-speed]").forEach((b) => {
  b.addEventListener("click", () => {
    adminSpeed = Number(b.dataset.speed);
    document.querySelectorAll("#admin-speeds [data-speed]").forEach((x) => x.classList.toggle("active", x === b));
  });
});
async function refreshTimerStatus() {
  try {
    const [server, mine] = await Promise.all([api.serverSpeed(), api.settings()]);
    $("#admin-timer-status").textContent =
      `Agora — Servidor: ${formatSpeed(normalizeTimerSpeed(server))} · Você: ${formatSpeed(normalizeTimerSpeed(mine.multiplier))}`;
  } catch { /* status line is informational only */ }
}
async function setTimer(scope: "server" | "me") {
  if (scope === "me" && !player) { toast("Faça login para continuar.", "err"); return; }
  const speed = adminSpeed;
  try {
    await api.admin("timer", adminPassword, {
      multiplier: speed, scope, ...(scope === "me" && player ? { username: player.username } : {}),
    });
    toast(scope === "server"
      ? `Cronômetro ${formatSpeed(speed)} ativado para todos!`
      : `Cronômetro ${formatSpeed(speed)} ativado só para você!`);
    void refreshTimerStatus();
  } catch (e) { toast(errMsg(e), "err"); }
}
$("#admin-timer-server").addEventListener("click", () => void setTimer("server"));
$("#admin-timer-me").addEventListener("click", () => void setTimer("me"));
$("#admin-timer-player").addEventListener("click", async () => {
  const username = $<HTMLInputElement>("#admin-timer-nick").value.trim();
  if (!username) { toast("Digite o Nick do jogador.", "err"); return; }
  const speed = adminSpeed;
  try {
    await api.admin("timer", adminPassword, { multiplier: speed, scope: "me", username });
    toast(`Cronômetro ${formatSpeed(speed)} ativado só para ${username}!`);
    void refreshTimerStatus();
  } catch (e) { toast(errMsg(e), "err"); }
});

// ------------------------------------------------------------------ rooms (multiplayer)
function isMenuOpen() {
  return !screens.menu.classList.contains("hidden");
}

async function refreshRoom() {
  if (!player) return;
  try {
    room = await api.myRoom();
  } catch (e) {
    if (activeTab === "rooms" && isMenuOpen()) toast(errMsg(e), "err");
    return;
  }
  sync.watch(room?.room.id ?? null);
  renderRoom();
  maybeStartRace();
}

function renderRoom() {
  show($("#room-lobby"), !room);
  show($("#room-view"), !!room);
  if (!room) {
    if (activeTab === "rooms") void loadOpenRooms();
    return;
  }
  const r = room.room;
  const isHost = !!player && r.hostId === player.id;
  const host = room.players.find((p) => p.id === r.hostId);
  $("#room-host").innerHTML = `${escapeHtml(r.hostName)}${host ? tagsHtml(host) : ""}`;
  $("#room-code-value").textContent = r.code;
  const n = room.players.length;
  const results = room.players.filter((p) => r.raceId > 0 && p.lastRaceId === r.raceId && p.lastTimeMs !== null);
  let status: string;
  if (r.status === "racing") {
    const left = room.players.filter((p) => p.racing).length;
    status = `Corrida em andamento… faltam ${left} jogador${left === 1 ? "" : "es"} terminar.`;
  } else if (n < ROOM_MIN_PLAYERS) {
    status = `${n}/${r.maxPlayers} jogadores · Passe o código ${r.code} para seu amigo entrar.`;
  } else {
    status = `${n}/${r.maxPlayers} jogadores · ${isHost ? "Você é o dono da sala: comece quando todos estiverem prontos." : "Esperando o dono da sala começar."}`;
  }
  $("#room-status").textContent = status;

  const sorted = [...room.players];
  if (results.length) {
    sorted.sort((a, b) => (b.lastRaceId === r.raceId ? b.lastTimeMs ?? -1 : -1) - (a.lastRaceId === r.raceId ? a.lastTimeMs ?? -1 : -1));
  }
  const bestMs = results.length ? Math.max(...results.map((p) => p.lastTimeMs!)) : -1;
  $("#room-players").innerHTML = sorted
    .map((p) => {
      const has = p.lastRaceId === r.raceId && p.lastTimeMs !== null && r.raceId > 0;
      const win = has && r.status === "waiting" && p.lastTimeMs === bestMs;
      const right = p.racing && r.status === "racing" ? "correndo…" : has ? formatTime(p.lastTimeMs!) : "";
      return `<li class="rank-row${p.id === player?.id ? " me" : ""}${win ? " top top-1" : ""}">
        <span class="rank-pos">${win ? "🏆" : p.id === r.hostId ? "👑" : "•"}</span>
        <span class="rank-dot skin-${escapeHtml(p.skin)}"></span>
        <span class="rank-name"><span class="rank-line"><span class="rank-nick">${escapeHtml(p.username)}</span>${tagsHtml(p)}</span><small>${p.id === r.hostId ? "Dono da sala" : escapeHtml(SKIN_NAMES[p.skin] ?? "")}</small></span>
        <span class="rank-time">${right}</span>
      </li>`;
    })
    .join("");

  const start = $<HTMLButtonElement>("#room-start");
  show(start, isHost && r.status === "waiting");
  start.disabled = n < ROOM_MIN_PLAYERS;
  start.textContent = n < ROOM_MIN_PLAYERS ? "Esperando jogadores…" : results.length ? "Revanche!" : "Começar corrida";
  show($("#room-end"), isHost && r.status === "racing");

  // Result line on the game-over screen
  if (inRoomRace) {
    const msg = $("#over-room-msg");
    if (r.status === "waiting" && results.length) {
      const winners = results.filter((p) => p.lastTimeMs === bestMs).map((p) => p.username);
      msg.textContent = winners.includes(player?.username ?? "") ? "🏆 Você venceu a corrida da sala!" : `🏆 Vencedor: ${winners.join(", ")}`;
      msg.className = "form-msg ok";
      for (const p of results) {
        live.set(p.id, { id: p.id, username: p.username, raceId: r.raceId, ms: p.lastTimeMs!, frozen: true, done: true });
      }
      renderLive();
    } else {
      msg.textContent = "Esperando os outros jogadores terminarem…";
      msg.className = "form-msg";
    }
  }
}

async function loadOpenRooms() {
  const list = $("#room-list");
  if (!list.children.length) list.innerHTML = `<li class="rank-empty">Procurando salas…</li>`;
  let rooms: OpenRoom[];
  try {
    rooms = await api.openRooms();
  } catch (e) {
    list.innerHTML = `<li class="rank-empty">${escapeHtml(errMsg(e))}</li>`;
    return;
  }
  if (!rooms.length) {
    list.innerHTML = `<li class="rank-empty">Nenhuma sala aberta agora. Crie a sua!</li>`;
    return;
  }
  list.innerHTML = rooms
    .map((o) => {
      const full = o.players >= o.maxPlayers;
      const label = o.status === "racing" ? "Correndo" : full ? "Cheia" : "Entrar";
      return `<li class="rank-row room-row">
        <span class="rank-pos">${o.players}/${o.maxPlayers}</span>
        <span class="rank-name"><small>Sala de</small><span class="rank-line"><span class="rank-nick">${escapeHtml(o.hostName)}</span>${tagsHtml({ influencer: o.hostInfluencer, owner: o.hostOwner })}</span></span>
        <button class="btn btn-sm ${o.status === "racing" || full ? "btn-ghost" : "btn-primary"}" data-join="${escapeHtml(o.code)}"${o.status === "racing" || full ? " disabled" : ""}>${label}</button>
      </li>`;
    })
    .join("");
}

$("#room-list").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest<HTMLButtonElement>("[data-join]");
  if (btn) void joinRoom(btn.dataset.join!);
});

async function joinRoom(code: string) {
  if (!code.trim()) return;
  try {
    room = await api.joinRoom(code);
    $<HTMLInputElement>("#room-code").value = "";
    sync.watch(room.room.id);
    renderRoom();
    toast(`Você entrou na sala de ${room.room.hostName}!`);
  } catch (e) {
    toast(errMsg(e), "err");
    void loadOpenRooms();
  }
}

$("#room-join-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void joinRoom($<HTMLInputElement>("#room-code").value);
});
$("#room-refresh").addEventListener("click", () => void loadOpenRooms());

$("#room-create").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#room-create");
  btn.disabled = true;
  try {
    room = await api.createRoom(Number($<HTMLSelectElement>("#room-max").value), $<HTMLInputElement>("#room-public").checked);
    sync.watch(room.room.id);
    renderRoom();
    toast(`Sala criada! Código: ${room.room.code}`);
  } catch (e) {
    toast(errMsg(e), "err");
  } finally {
    btn.disabled = false;
  }
});

$("#room-leave").addEventListener("click", async () => {
  try {
    await api.leaveRoom();
    room = null;
    sync.watch(null);
    $("#room-list").innerHTML = "";
    renderRoom();
  } catch (e) {
    toast(errMsg(e), "err");
  }
});

$("#room-start").addEventListener("click", async () => {
  const btn = $<HTMLButtonElement>("#room-start");
  btn.disabled = true;
  try {
    room = await api.startRoomRace();
    renderRoom();
    maybeStartRace();
  } catch (e) {
    toast(errMsg(e), "err");
    btn.disabled = false;
  }
});

$("#room-end").addEventListener("click", async () => {
  try {
    room = await api.endRoomRace();
    renderRoom();
  } catch (e) {
    toast(errMsg(e), "err");
  }
});

$("#room-code-copy").addEventListener("click", async () => {
  if (!room) return;
  try {
    await navigator.clipboard.writeText(room.room.code);
    toast("Código copiado!");
  } catch {
    toast(`Código da sala: ${room.room.code}`);
  }
});

// A race starts for everyone in the room when the host presses "Começar corrida".
function maybeStartRace() {
  if (!room || !player || room.room.status !== "racing") return;
  const me = room.players.find((p) => p.id === player!.id);
  if (!me?.racing || room.room.raceId === raceSeen) return;
  raceSeen = room.room.raceId;
  void beginRoomRace(room);
}

async function beginRoomRace(state: RoomState) {
  if (game.isRunning || game.isPaused) game.toIdle();
  inRoomRace = true;
  raceId = state.room.raceId;
  live.clear();
  for (const p of state.players.filter((x) => x.racing)) {
    live.set(p.id, { id: p.id, username: p.username, raceId, ms: 0, frozen: false, done: false });
  }
  $("#over-room-list").innerHTML = "";
  showScreen("none");
  show($("#hud"), false);
  const cd = $("#room-countdown");
  for (const t of ["3", "2", "1", "JÁ!"]) {
    cd.textContent = t;
    show(cd);
    cd.classList.remove("pop");
    void cd.offsetWidth;
    cd.classList.add("pop");
    await new Promise((res) => setTimeout(res, t === "JÁ!" ? 450 : 800));
  }
  show(cd, false);
  if (!(await startRun())) {
    inRoomRace = false;
    openMenu();
  }
}

let lastSent = 0;
function reportProgress(ms: number, frozen: boolean, done: boolean, force = false) {
  if (!player) return;
  const now = performance.now();
  const mine = { id: player.id, username: player.username, raceId, ms: Math.floor(ms), frozen, done };
  live.set(player.id, mine);
  if (!force && now - lastSent < 500) return;
  lastSent = now;
  sync.send(mine);
  renderLive();
}

function renderLive() {
  const rows = [...live.values()].sort((a, b) => b.ms - a.ms);
  const html = rows
    .map((p, i) => {
      const me = p.id === player?.id;
      const state = p.done ? "🏁" : p.frozen ? "🪙" : "🏃";
      return `<li class="${me ? "me" : ""}${p.done ? " done" : ""}"><span class="live-pos">${i + 1}</span><span class="live-name">${escapeHtml(p.username)}</span><span class="live-state">${state}</span><span class="live-time">${formatTime(p.ms)}</span></li>`;
    })
    .join("");
  $("#room-live").innerHTML = html;
  $("#over-room-list").innerHTML = html;
}

// Safety net in case a live update is missed: re-check the room every few seconds.
window.setInterval(() => {
  if (!player || game.isRunning || game.isPaused) return;
  if (activeTab === "rooms" && isMenuOpen()) void refreshRoom();
  else if (room && (isMenuOpen() || inRoomRace)) void refreshRoom();
}, 5000);

}
