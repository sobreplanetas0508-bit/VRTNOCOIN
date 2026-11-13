import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

const TITLE = "Fuga dos Trilhos — corra sem pegar moedas";
const DESCRIPTION =
  "Corredor infinito em 3D: desvie dos trens, evite as moedas e suba no ranking global de quem fica mais tempo sem pegar moeda.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    // The 3D engine needs the browser (WebGL), so it loads only after the page is on screen.
    let cancelled = false;
    void import("@/game/app").then(({ initApp }) => {
      if (!cancelled) initApp();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="fdt-root">
          <div className="sky"><div className="sun"></div></div>
          <canvas id="game"></canvas>

          {/* HUD */}
          <div id="hud" className="hidden">
            <button id="btn-pause" className="hud-btn" aria-label="Pausar">❚❚</button>
            <div id="timer" className="timer">
              <div className="timer-label" id="timer-label">SEM MOEDAS</div>
              <div className="timer-value" id="timer-value">00:00.00</div>
            </div>
            <div className="hud-coins"><span className="coin-ico"></span><span id="hud-coins">0</span></div>
            <div id="coin-alert" className="coin-alert hidden">Você tocou numa moeda! Cronômetro parado — continue correndo.</div>
            <ol id="room-live" className="room-live hidden" aria-label="Corrida da sala"></ol>
            <div className="controls-hint" id="controls-hint">← → trocar trilho · ↑ pular · ↓ rolar <span className="touch-only">(ou deslize)</span></div>
          </div>

          {/* AUTH */}
          <section id="screen-auth" className="screen hidden">
            <div className="panel auth-panel">
              <div className="brand"><span className="brand-top">FUGA DOS</span><span className="brand-bottom">TRILHOS</span></div>
              <p className="tagline">Quanto tempo você aguenta <b>sem tocar numa moeda</b>?</p>
              <div className="seg" role="tablist">
                <button className="seg-btn active" data-auth="register">Criar conta</button>
                <button className="seg-btn" data-auth="login">Entrar</button>
              </div>
              <form id="auth-form" className="form" autoComplete="on">
                <label>Nome de jogador
                  <input id="auth-user" name="username" required minLength={3} maxLength={16} placeholder="ex: corredor_99" autoComplete="username" />
                </label>
                <label>Senha
                  <input id="auth-pass" name="password" type="password" required minLength={6} placeholder="mínimo 6 caracteres" autoComplete="new-password" />
                </label>
                <p id="auth-error" className="form-error"></p>
                <button id="auth-submit" className="btn btn-primary" type="submit">Criar conta e jogar</button>
              </form>
            </div>
          </section>

          {/* MENU */}
          <section id="screen-menu" className="screen hidden">
            <div className="panel menu-panel">
              <header className="menu-head">
                <div className="brand small"><span className="brand-top">FUGA DOS</span><span className="brand-bottom">TRILHOS</span></div>
                <div className="who">
                  <span className="who-name"><span id="me-name">—</span><span id="me-tags"></span></span>
                  <button id="btn-logout" className="link-btn">sair</button>
                </div>
              </header>
              <div className="stats">
                <div className="stat"><span className="stat-k">Recorde sem moedas</span><span className="stat-v" id="me-best">00:00.00</span></div>
                <div className="stat"><span className="stat-k">Posição global</span><span className="stat-v" id="me-rank">—</span></div>
                <div className="stat"><span className="stat-k">Moedas</span><span className="stat-v coin-v"><span className="coin-ico"></span><span id="me-coins">0</span></span></div>
              </div>

              <nav className="tabs" role="tablist">
                <button className="tab active" data-tab="play">Jogar</button>
                <button className="tab" data-tab="skins">Personagens</button>
                <button className="tab" data-tab="codes">Códigos</button>
                <button className="tab" data-tab="rooms">Salas</button>
                <button className="tab" data-tab="ranking">Ranking</button>
                <button className="tab" data-tab="admin">ADM</button>
              </nav>

              <div className="tab-body" id="tab-play">
                <ol className="rules">
                  <li><b>O cronômetro</b> no topo da tela conta quanto tempo você fica <b>sem tocar em moedas</b>.</li>
                  <li>Tocou numa moeda? O cronômetro <b>para</b>, mas a corrida continua — e a moeda vai pro seu cofre.</li>
                  <li>Use as moedas para liberar personagens. Use o tempo para subir no <b>ranking global</b>.</li>
                </ol>
                <button id="btn-play" className="btn btn-primary btn-xl">Jogar</button>
                <p className="keys">← → trocar trilho · ↑ / espaço pular · ↓ rolar · no celular, deslize</p>
              </div>

              <div className="tab-body hidden" id="tab-skins">
                <p className="hint">Toque num personagem para ver ao lado.</p>
                <div className="skin-grid" id="skin-grid"></div>
              </div>

              <div className="tab-body hidden" id="tab-codes">
                <p className="hint">Tem um código secreto? Digite abaixo para resgatar recompensas exclusivas.</p>
                <form id="code-form" className="form code-form">
                  <input id="code-input" placeholder="DIGITE O CÓDIGO" maxLength={32} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
                  <button className="btn btn-primary" type="submit">Resgatar</button>
                </form>
                <p id="code-msg" className="form-msg"></p>
              </div>

              <div className="tab-body hidden" id="tab-admin">
                <h3>Painel administrativo</h3>
                <input id="admin-password" type="password" placeholder="Senha ADM" autoComplete="off" />
                <button id="admin-login" className="btn btn-primary">Entrar</button>
                <div id="admin-controls" className="hidden">
                  <p>Enviar moedas</p><input id="admin-nick" placeholder="Nick do jogador" />
                  <input id="admin-amount" type="number" min="1" max="1000000" placeholder="Quantidade" />
                  <button id="admin-send" className="btn btn-primary">Enviar moedas</button>
                  <p>TAG de influenciador</p><input id="admin-influencer-nick" placeholder="Nick do jogador" />
                  <button id="admin-influencer-on" className="btn btn-primary">Adicionar TAG</button>
                  <button id="admin-influencer-off" className="btn btn-ghost">Remover TAG</button>
                  <p>Velocidade do cronômetro (vale para o ranking)</p>
                  <button id="admin-timer-normal" className="btn btn-ghost">1x</button>
                  <button id="admin-timer-fast" className="btn btn-primary">1,5x</button>
                  <button id="admin-timer-double" className="btn btn-primary">2x</button>
                </div>
              </div>
              <div className="tab-body hidden" id="tab-rooms">
                <div id="room-lobby">
                  <p className="hint">Corra contra seus amigos ao mesmo tempo. Quem ficar mais tempo sem pegar moeda vence!</p>
                  <div className="room-box">
                    <div className="room-create">
                      <label className="room-field">Jogadores
                        <select id="room-max" defaultValue="10">
                          {[2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                            <option key={n} value={n}>{n === 2 ? "2 (1x1)" : n}</option>
                          ))}
                        </select>
                      </label>
                      <label className="room-check"><input id="room-public" type="checkbox" defaultChecked /> Aparecer em salas abertas</label>
                    </div>
                    <button id="room-create" className="btn btn-primary">Criar sala</button>
                  </div>
                  <form id="room-join-form" className="form code-form room-join">
                    <input id="room-code" placeholder="CÓDIGO DA SALA" maxLength={5} autoComplete="off" autoCapitalize="characters" spellCheck={false} />
                    <button className="btn btn-primary" type="submit">Entrar</button>
                  </form>
                  <div className="rank-head">
                    <span>Salas abertas</span>
                    <button id="room-refresh" className="link-btn">atualizar</button>
                  </div>
                  <ul className="ranking" id="room-list"></ul>
                </div>
                <div id="room-view" className="hidden">
                  <div className="room-top">
                    <div className="room-title"><span className="stat-k">Sala de</span><span id="room-host"></span></div>
                    <button id="room-code-copy" className="room-code" title="Copiar código">
                      <span className="stat-k">Código</span><span id="room-code-value">—</span>
                    </button>
                  </div>
                  <p id="room-status" className="hint"></p>
                  <ol className="ranking" id="room-players"></ol>
                  <div className="room-actions">
                    <button id="room-start" className="btn btn-primary btn-xl">Começar corrida</button>
                    <button id="room-end" className="btn btn-ghost hidden">Encerrar corrida</button>
                    <button id="room-leave" className="btn btn-ghost">Sair da sala</button>
                  </div>
                </div>
              </div>
              <div className="tab-body hidden" id="tab-ranking">
                <div className="rank-head">
                  <span>Top 25 · mais tempo sem pegar moeda</span>
                  <button id="btn-refresh-rank" className="link-btn">atualizar</button>
                </div>
                <ol className="ranking" id="ranking"></ol>
              </div>
            </div>
          </section>

          {/* PAUSE */}
          <section id="screen-pause" className="screen center hidden">
            <div className="panel small-panel">
              <h2 className="title">Pausado</h2>
              <button id="btn-resume" className="btn btn-primary">Continuar</button>
              <button id="btn-quit" className="btn btn-ghost">Desistir da corrida</button>
            </div>
          </section>

          {/* GAME OVER */}
          <section id="screen-over" className="screen center hidden">
            <div className="panel small-panel over-panel">
              <h2 className="title" id="over-title">Fim de corrida!</h2>
              <div className="big-time" id="over-time">00:00.00</div>
              <p className="over-sub" id="over-sub">sem pegar moeda</p>
              <div className="over-row">
                <div><span className="stat-k">Moedas ganhas</span><span className="stat-v coin-v"><span className="coin-ico"></span><span id="over-coins">0</span></span></div>
                <div><span className="stat-k">Posição global</span><span className="stat-v" id="over-rank">—</span></div>
              </div>
              <p id="over-msg" className="form-msg"></p>
              <div id="over-room" className="over-room hidden">
                <div className="rank-head"><span>Corrida da sala</span></div>
                <p id="over-room-msg" className="form-msg"></p>
                <ol className="ranking" id="over-room-list"></ol>
              </div>
              <button id="btn-room" className="btn btn-primary hidden">Voltar para a sala</button>
              <button id="btn-again" className="btn btn-primary">Correr de novo</button>
              <button id="btn-menu" className="btn btn-ghost">Menu</button>
            </div>
          </section>

          <div id="room-countdown" className="room-countdown hidden" aria-live="assertive"></div>
          <div id="toast" className="toast hidden"></div>

    </div>
  );
}
