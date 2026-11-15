// @ts-nocheck -- ported verbatim from the original game; written for a looser TypeScript config.
import * as THREE from "three";
import { createCharacter, animateRig, type CharacterRig } from "./characters";
import { normalizeTimerSpeed } from "./rules";

const LANES = [-2.2, 0, 2.2];
const SPAWN_Z = -120;
const DESPAWN_Z = 14;
const GRAVITY = 30;
const JUMP_V = 11; // ~12% higher jump than the original 10.4
const ROLL_TIME = 0.75;
const START_SPEED = 15;
const MAX_SPEED = 36;

type ObstacleKind = "barrier" | "overhead" | "train" | "lava";

import { trailStyle, type TrailId } from "./settings";

interface Obstacle {
  kind: ObstacleKind;
  mesh: THREE.Object3D;
  lane: number;
  /** z of the front face (closest to player). The body extends toward -z by `length`. */
  z: number;
  length: number;
  minY: number;
  maxY: number;
}

interface Coin {
  mesh: THREE.Mesh;
  lane: number;
  z: number;
  y: number;
  taken: boolean;
  spin: number;
}

export interface RunResult {
  /** What ended the run: an obstacle, or stepping on lava in "Chão é Lava" mode. */
  cause?: "hit" | "lava";
  noCoinMs: number;
  coins: number;
  runMs: number;
}

export interface GameCallbacks {
  onTick(s: { noCoinMs: number; coins: number; frozen: boolean; runMs: number }): void;
  onFirstCoin(): void;
  onCoin(total: number): void;
  onGameOver(r: RunResult): void;
}

type Mode = "idle" | "running" | "paused" | "crashing" | "over";

export class Game {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Clock();
  private mode: Mode = "idle";

  private rig!: CharacterRig;
  private skinId = "palhaco";
  private trackTex!: THREE.CanvasTexture;
  private scenery: THREE.Object3D[] = [];
  private sceneryLength = 0;

  private obstacles: Obstacle[] = [];
  private coins: Coin[] = [];
  private coinGeo = new THREE.CylinderGeometry(0.36, 0.36, 0.08, 18);
  private coinMat = new THREE.MeshStandardMaterial({
    color: 0xffc300,
    emissive: 0x7a4a00,
    metalness: 0.6,
    roughness: 0.3,
  });

  // run state
  private speed = START_SPEED;
  private lane = 1;
  private x = 0;
  private y = 0;
  private vy = 0;
  private rollT = 0;
  private phase = 0;
  private runMs = 0;
  private noCoinMs = 0;
  private timerMultiplier = 1;
  private coinTouched = false;
  private coinCount = 0;
  private distSinceSpawn = 0;
  private nextGap = 30;
  private crashT = 0;
  private shake = 0;
  private time = 0;
  private lavaMode = false;
  private crashCause: "hit" | "lava" = "hit";
  private lavaMat = new THREE.MeshStandardMaterial({ color: 0xff5a1f, emissive: 0xff3300, emissiveIntensity: 1.1, roughness: 0.4 });
  private lavaCoreMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });
  private sun!: THREE.DirectionalLight;
  private trail: TrailId = "none";
  private trailGeo = new THREE.IcosahedronGeometry(0.13, 0);
  private trailBits: { mesh: THREE.Mesh; life: number; vx: number; vy: number }[] = [];
  private trailAcc = 0;

  constructor(private canvas: HTMLCanvasElement, private cb: GameCallbacks) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 220);
    this.scene.fog = new THREE.Fog(0xff9e6d, 45, 125);

    this.buildWorld();
    this.setSkin("palhaco");
    this.resize();
    window.addEventListener("resize", () => this.resize());
    this.bindInput();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  // ---------------------------------------------------------------- world
  private buildWorld() {
    const hemi = new THREE.HemisphereLight(0xffe4c8, 0x40305a, 1.25);
    this.scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff1dc, 2.1);
    sun.position.set(-6, 14, 6);
    sun.target.position.set(0, 0, -8);
    sun.castShadow = true;
    this.sun = sun;
    sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera;
    sc.left = -9;
    sc.right = 9;
    sc.top = 20;
    sc.bottom = -14;
    sc.near = 1;
    sc.far = 50;
    this.scene.add(sun, sun.target);

    // Track: one big plane with a scrolling canvas texture (3 sets of rails)
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#6d5a54";
    g.fillRect(0, 0, 512, 256);
    for (let i = 0; i < 900; i++) {
      g.fillStyle = Math.random() > 0.5 ? "#7d6a62" : "#5b4943";
      g.fillRect(Math.random() * 512, Math.random() * 256, 3, 3);
    }
    const laneW = 512 / 3.4;
    for (let l = 0; l < 3; l++) {
      const cx = 512 / 2 + (l - 1) * (512 / 3.4) * 1.0;
      // ties
      g.fillStyle = "#3e2c25";
      for (let t = 0; t < 4; t++) g.fillRect(cx - laneW * 0.42, t * 64 + 20, laneW * 0.84, 22);
      // rails
      g.fillStyle = "#c9c3bd";
      g.fillRect(cx - laneW * 0.3, 0, 8, 256);
      g.fillRect(cx + laneW * 0.3 - 8, 0, 8, 256);
      g.fillStyle = "#8c857f";
      g.fillRect(cx - laneW * 0.3 + 6, 0, 2, 256);
      g.fillRect(cx + laneW * 0.3 - 2, 0, 2, 256);
    }
    this.trackTex = new THREE.CanvasTexture(c);
    this.trackTex.wrapS = this.trackTex.wrapT = THREE.RepeatWrapping;
    this.trackTex.colorSpace = THREE.SRGBColorSpace;
    this.trackTex.anisotropy = 4;
    const trackLen = 240;
    this.trackTex.repeat.set(1, trackLen / 8);
    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(7.5, trackLen),
      new THREE.MeshStandardMaterial({ map: this.trackTex, roughness: 0.95 }),
    );
    track.rotation.x = -Math.PI / 2;
    track.position.z = -trackLen / 2 + 20;
    track.receiveShadow = true;
    this.scene.add(track);

    // Side ground
    const side = new THREE.Mesh(
      new THREE.PlaneGeometry(120, trackLen),
      new THREE.MeshStandardMaterial({ color: 0x4b3b5c, roughness: 1 }),
    );
    side.rotation.x = -Math.PI / 2;
    side.position.set(0, -0.02, -trackLen / 2 + 20);
    this.scene.add(side);

    // Platform edges
    for (const sx of [-1, 1]) {
      const edge = new THREE.Mesh(
        new THREE.BoxGeometry(1.2, 0.6, trackLen),
        new THREE.MeshStandardMaterial({ color: 0xd8c3a5, roughness: 0.9 }),
      );
      edge.position.set(sx * 4.35, 0.3, -trackLen / 2 + 20);
      edge.receiveShadow = true;
      this.scene.add(edge);
      const stripe = new THREE.Mesh(
        new THREE.BoxGeometry(0.18, 0.02, trackLen),
        new THREE.MeshStandardMaterial({ color: 0xffd23f, emissive: 0x4a3a00 }),
      );
      stripe.position.set(sx * 3.9, 0.61, -trackLen / 2 + 20);
      this.scene.add(stripe);
    }

    // Recyclable scenery: buildings + lamp posts on both sides
    const palette = [0x2b2d42, 0x3d2c5e, 0x5a3d7a, 0x22577a, 0x7b2d5b, 0x38405f];
    const windowMat = new THREE.MeshStandardMaterial({ color: 0xffe3a3, emissive: 0xffb347, emissiveIntensity: 0.9 });
    const step = 9;
    const count = 15;
    this.sceneryLength = step * count;
    for (let i = 0; i < count; i++) {
      for (const sx of [-1, 1]) {
        const grp = new THREE.Group();
        const h = 6 + Math.random() * 16;
        const w = 5 + Math.random() * 3;
        const b = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 7),
          new THREE.MeshStandardMaterial({ color: palette[(i * 2 + (sx > 0 ? 1 : 0)) % palette.length], flatShading: true }),
        );
        b.position.y = h / 2;
        grp.add(b);
        const rows = Math.floor(h / 2.4);
        for (let r = 0; r < rows; r++) {
          if (Math.random() < 0.35) continue;
          const win = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.8, 5), windowMat);
          win.position.set(-sx * (w / 2 + 0.02), 1.6 + r * 2.4, 0);
          grp.add(win);
        }
        grp.position.set(sx * (9 + w / 2 + Math.random() * 2), 0, -i * step);
        this.scene.add(grp);
        this.scenery.push(grp);
      }
      if (i % 2 === 0) {
        for (const sx of [-1, 1]) {
          const lamp = new THREE.Group();
          const pole = new THREE.Mesh(
            new THREE.CylinderGeometry(0.07, 0.09, 4.2, 6),
            new THREE.MeshStandardMaterial({ color: 0x2b2d42 }),
          );
          pole.position.y = 2.1 + 0.6;
          const bulb = new THREE.Mesh(
            new THREE.SphereGeometry(0.22, 8, 6),
            new THREE.MeshStandardMaterial({ color: 0xfff1c1, emissive: 0xffd27a, emissiveIntensity: 1.5 }),
          );
          bulb.position.set(-sx * 0.3, 4.85, 0);
          lamp.add(pole, bulb);
          lamp.position.set(sx * 4.6, 0, -i * step - 4);
          this.scene.add(lamp);
          this.scenery.push(lamp);
        }
      }
    }
  }

  private makeObstacle(kind: ObstacleKind, lane: number, z: number): Obstacle {
    const grp = new THREE.Group();
    const x = LANES[lane];
    let length = 0.4;
    let minY = 0;
    let maxY = 1.1;
    if (kind === "lava") {
      // Flat glowing pool: harmless in the air, deadly on the ground (even rolling).
      length = 3.2;
      minY = -1;
      maxY = 0.08;
      const pool = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.06, length), this.lavaMat);
      pool.position.set(0, 0.03, -length / 2);
      grp.add(pool);
      for (let k = 0; k < 4; k++) {
        const bubble = new THREE.Mesh(new THREE.CircleGeometry(0.12 + Math.random() * 0.12, 10), this.lavaCoreMat);
        bubble.rotation.x = -Math.PI / 2;
        bubble.position.set((Math.random() - 0.5) * 1.5, 0.07, -0.3 - Math.random() * (length - 0.6));
        grp.add(bubble);
      }
    } else if (kind === "barrier") {
      const stripes = stripeMaterial("#e63946", "#fff6e9");
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.18), stripes);
      board.position.y = 0.78;
      const legMat = new THREE.MeshStandardMaterial({ color: 0x555b6e });
      for (const sx of [-0.8, 0.8]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.05, 0.12), legMat);
        leg.position.set(sx, 0.52, 0);
        leg.castShadow = true;
        grp.add(leg);
      }
      board.castShadow = true;
      grp.add(board);
    } else if (kind === "overhead") {
      minY = 1.25;
      maxY = 3.2;
      const postMat = new THREE.MeshStandardMaterial({ color: 0x2b2d42 });
      for (const sx of [-0.95, 0.95]) {
        const p = new THREE.Mesh(new THREE.BoxGeometry(0.14, 3.2, 0.14), postMat);
        p.position.set(sx, 1.6, 0);
        p.castShadow = true;
        grp.add(p);
      }
      const sign = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.6, 0.2), stripeMaterial("#ffd23f", "#2b2d42"));
      sign.position.y = 2.1;
      sign.castShadow = true;
      grp.add(sign);
      const glow = new THREE.Mesh(
        new THREE.BoxGeometry(1.7, 0.1, 0.24),
        new THREE.MeshStandardMaterial({ color: 0xff4d6d, emissive: 0xff4d6d, emissiveIntensity: 1.2 }),
      );
      glow.position.y = 1.35;
      grp.add(glow);
    } else {
      length = 12;
      maxY = 3;
      const colors = [0x2ec4b6, 0xff6b35, 0x9b5de5, 0x3a86ff];
      const bodyColor = colors[Math.floor(Math.random() * colors.length)];
      const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.95, 2.8, length),
        new THREE.MeshStandardMaterial({ color: bodyColor, flatShading: true, roughness: 0.6 }),
      );
      body.position.set(0, 1.55, -length / 2);
      body.castShadow = true;
      body.receiveShadow = true;
      grp.add(body);
      const cream = new THREE.MeshStandardMaterial({ color: 0xfff6e9 });
      const band = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.3, length + 0.02), cream);
      band.position.set(0, 0.9, -length / 2);
      grp.add(band);
      const winMat = new THREE.MeshStandardMaterial({ color: 0x1b263b, emissive: 0x415a77, emissiveIntensity: 0.5 });
      const win = new THREE.Mesh(new THREE.BoxGeometry(2.02, 0.75, length - 1.5), winMat);
      win.position.set(0, 2.05, -length / 2);
      grp.add(win);
      const front = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.9, 0.05), winMat);
      front.position.set(0, 2.1, 0.01);
      grp.add(front);
      for (const sx of [-0.6, 0.6]) {
        const light = new THREE.Mesh(
          new THREE.CircleGeometry(0.14, 10),
          new THREE.MeshStandardMaterial({ color: 0xfffbe0, emissive: 0xfff3b0, emissiveIntensity: 2 }),
        );
        light.position.set(sx, 0.55, 0.03);
        grp.add(light);
      }
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.2, length - 0.4), cream);
      roof.position.set(0, 3.05, -length / 2);
      grp.add(roof);
    }
    grp.position.set(x, 0, z);
    this.scene.add(grp);
    const o: Obstacle = { kind, mesh: grp, lane, z, length, minY, maxY };
    this.obstacles.push(o);
    return o;
  }

  private makeCoin(lane: number, z: number, y = 0.95) {
    const mesh = new THREE.Mesh(this.coinGeo, this.coinMat);
    mesh.rotation.x = Math.PI / 2;
    mesh.position.set(LANES[lane], y, z);
    mesh.castShadow = true;
    this.scene.add(mesh);
    this.coins.push({ mesh, lane, z, y, taken: false, spin: Math.random() * 6 });
  }

  /** Spawns one "row" of obstacles, always leaving at least one free lane, plus optional coins. */
  private spawnRow(z = SPAWN_Z) {
    const difficulty = Math.min(1, (this.speed - START_SPEED) / (MAX_SPEED - START_SPEED));
    const lanes = shuffle([0, 1, 2]);
    const blocked = Math.random() < 0.35 + difficulty * 0.35 ? 2 : 1;
    let hasTrain = false;
    let clean = 0; // blocked lanes that can still be passed without touching a coin
    const free: number[] = [];
    const blockedLanes: number[] = [];
    lanes.forEach((lane, i) => {
      if (i < blocked) {
        const r = Math.random();
        const kind: ObstacleKind = r < 0.38 ? "train" : r < 0.7 ? "barrier" : "overhead";
        if (kind === "train") hasTrain = true;
        blockedLanes.push(lane);
        this.makeObstacle(kind, lane, z);
        if (kind === "barrier" && Math.random() < 0.45) {
          // coin arc over the barrier – a trap for jumpers
          for (let k = -2; k <= 2; k++) this.makeCoin(lane, z - k * 1.4, 1.2 + (2 - Math.abs(k)) * 0.45);
        } else if (kind !== "train") clean++;
      } else free.push(lane);
    });

    // Touching a coin must always be avoidable, otherwise the ranking is luck:
    // only fill the free lane with coins if another coin-free path exists.
    const canFillFree = free.length >= 2 || clean > 0;
    let filledFree = false;

    // Coins tempt the player on the safe lane
    if (canFillFree && Math.random() < 0.6 + difficulty * 0.2) {
      filledFree = true;
      const lane = free[Math.floor(Math.random() * free.length)];
      const n = 4 + Math.floor(Math.random() * 4);
      const start = z + 8 + Math.random() * 4;
      for (let k = 0; k < n; k++) this.makeCoin(lane, start - k * 1.6);
    }
    // Occasional lure line right in front of an obstacle
    if (Math.random() < 0.35 && (!filledFree || free.length >= 2)) {
      const lane = blockedLanes[Math.floor(Math.random() * blockedLanes.length)];
      const zz = z + 6;
      for (let k = 0; k < 3; k++) this.makeCoin(lane, zz - k * 1.6);
    }

    const minGap = hasTrain ? 24 : 15;
    this.nextGap = minGap + Math.random() * (12 - difficulty * 6) + this.speed * 0.15;

    // "Chão é Lava": lava pools between rows, never on all three lanes, so you can dodge or jump.
    if (this.lavaMode && Math.random() < 0.55 + difficulty * 0.3) {
      const count = Math.random() < 0.3 + difficulty * 0.3 ? 2 : 1;
      const lavaZ = z - Math.max(hasTrain ? 13.5 : 6, this.nextGap / 2);
      shuffle([0, 1, 2]).slice(0, count).forEach((lane) => this.makeObstacle("lava", lane, lavaZ));
    }
  }

  // ---------------------------------------------------------------- public API
  setSkin(id: string) {
    this.skinId = id;
    const prev = this.rig;
    this.rig = createCharacter(id);
    if (prev) {
      this.rig.root.position.copy(prev.root.position);
      this.rig.root.rotation.copy(prev.root.rotation);
      this.scene.remove(prev.root);
    } else {
      this.rig.root.rotation.y = Math.PI;
    }
    this.scene.add(this.rig.root);
  }

  setCoinColor(main: string, dark: string) {
    this.coinMat.color.set(main);
    this.coinMat.emissive.set(dark).multiplyScalar(0.6);
  }

  setLavaMode(on: boolean) { this.lavaMode = on; }

  setTrail(id: TrailId) { this.trail = id; }

  /** Light mode for weak phones: lower resolution and no shadows. */
  setLowQuality(on: boolean) {
    this.renderer.setPixelRatio(on ? 1 : Math.min(window.devicePixelRatio, 2));
    this.sun.castShadow = !on;
    this.resize();
  }

  setTimerMultiplier(value: number) { this.timerMultiplier = normalizeTimerSpeed(value); }

  get currentSkin() {
    return this.skinId;
  }

  start() {
    this.clearWorld();
    this.speed = START_SPEED;
    this.lane = 1;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.rollT = 0;
    this.runMs = 0;
    this.noCoinMs = 0;
    this.coinTouched = false;
    this.coinCount = 0;
    this.crashCause = "hit";
    // Pre-populate the track so the action starts right away
    let z = -42;
    for (;;) {
      this.spawnRow(z);
      const next = z - this.nextGap;
      if (next < SPAWN_Z) {
        this.distSinceSpawn = z - SPAWN_Z;
        break;
      }
      z = next;
    }
    this.rig.root.rotation.set(0, 0, 0);
    this.rig.pivot.rotation.set(0, 0, 0);
    this.rig.pivot.scale.set(1, 1, 1);
    this.rig.root.position.set(0, 0, 0);
    this.mode = "running";
    this.clock.getDelta();
  }

  pause() {
    if (this.mode === "running") this.mode = "paused";
  }
  resume() {
    if (this.mode === "paused") {
      this.mode = "running";
      this.clock.getDelta();
    }
  }
  get isRunning() {
    return this.mode === "running";
  }
  get isPaused() {
    return this.mode === "paused";
  }

  toIdle() {
    this.clearWorld();
    this.mode = "idle";
    this.rig.root.position.set(0, 0, 0);
    this.rig.root.rotation.set(0, Math.PI, 0);
    this.rig.pivot.rotation.set(0, 0, 0);
    this.rig.pivot.scale.set(1, 1, 1);
    this.x = 0;
    this.y = 0;
  }

  private clearWorld() {
    for (const o of this.obstacles) this.scene.remove(o.mesh);
    for (const c of this.coins) this.scene.remove(c.mesh);
    this.obstacles = [];
    this.coins = [];
    for (const b of this.trailBits) this.scene.remove(b.mesh);
    this.trailBits = [];
  }

  private updateTrail(dt: number, dist: number) {
    for (let i = this.trailBits.length - 1; i >= 0; i--) {
      const b = this.trailBits[i];
      b.life -= dt;
      b.mesh.position.z += dist;
      b.mesh.position.x += b.vx * dt;
      b.mesh.position.y += b.vy * dt;
      b.mesh.rotation.x += dt * 4;
      const t = Math.max(0, b.life / 0.6);
      b.mesh.scale.setScalar(0.3 + t * 0.9);
      (b.mesh.material as THREE.MeshBasicMaterial).opacity = t;
      if (b.life <= 0) {
        this.scene.remove(b.mesh);
        (b.mesh.material as THREE.Material).dispose();
        this.trailBits.splice(i, 1);
      }
    }
    if (this.trail === "none" || this.mode !== "running") return;
    this.trailAcc += dt;
    while (this.trailAcc > 0.025) {
      this.trailAcc -= 0.025;
      const style = trailStyle(this.trail);
      const color = new THREE.Color(style.colors[Math.floor(Math.random() * style.colors.length)]);
      if (this.trail === "arco-iris") color.setHSL((this.time * 0.6) % 1, 0.9, 0.6);
      const mesh = new THREE.Mesh(
        this.trailGeo,
        new THREE.MeshBasicMaterial({ color, transparent: true, depthWrite: false }),
      );
      mesh.position.set(this.x + (Math.random() - 0.5) * 0.35, this.y + 0.35 + Math.random() * 0.6, 0.45);
      this.scene.add(mesh);
      this.trailBits.push({
        mesh,
        life: 0.6,
        vx: (Math.random() - 0.5) * 0.8,
        vy: style.rise + (Math.random() - 0.5) * 0.6,
      });
    }
  }

  // ---------------------------------------------------------------- input
  private move(dir: -1 | 1) {
    if (this.mode !== "running") return;
    this.lane = Math.max(0, Math.min(2, this.lane + dir));
  }
  private jump() {
    if (this.mode !== "running") return;
    if (this.y <= 0.001) {
      this.vy = JUMP_V;
      this.rollT = 0;
    }
  }
  private roll() {
    if (this.mode !== "running") return;
    this.rollT = ROLL_TIME;
    if (this.y > 0) this.vy = -22; // slam down
  }

  private bindInput() {
    window.addEventListener("keydown", (e) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const k = e.key.toLowerCase();
      if (k === "arrowleft" || k === "a") this.move(-1);
      else if (k === "arrowright" || k === "d") this.move(1);
      else if (k === "arrowup" || k === "w" || k === " ") this.jump();
      else if (k === "arrowdown" || k === "s") this.roll();
      else return;
      if (this.mode === "running") e.preventDefault();
    });
    let sx = 0;
    let sy = 0;
    let tracking = false;
    this.canvas.addEventListener(
      "touchstart",
      (e) => {
        const t = e.touches[0];
        sx = t.clientX;
        sy = t.clientY;
        tracking = true;
      },
      { passive: true },
    );
    this.canvas.addEventListener(
      "touchmove",
      (e) => {
        if (!tracking) return;
        const t = e.touches[0];
        const dx = t.clientX - sx;
        const dy = t.clientY - sy;
        if (Math.max(Math.abs(dx), Math.abs(dy)) < 28) return;
        tracking = false;
        if (Math.abs(dx) > Math.abs(dy)) this.move(dx > 0 ? 1 : -1);
        else if (dy < 0) this.jump();
        else this.roll();
      },
      { passive: true },
    );
    this.canvas.addEventListener("touchend", () => (tracking = false), { passive: true });
  }

  // ---------------------------------------------------------------- loop
  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Widen FOV on portrait screens so all three lanes stay visible
    this.camera.fov = w / h < 0.8 ? 78 : 62;
    this.camera.updateProjectionMatrix();
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.time += dt;
    if (this.mode === "running") this.updateRun(dt);
    else if (this.mode === "idle") this.updateIdle(dt);
    else if (this.mode === "crashing") this.updateCrash(dt);
    this.updateCamera(dt);
    this.renderer.render(this.scene, this.camera);
  }

  private scrollWorld(dist: number) {
    this.trackTex.offset.y += dist / 8;
    for (const s of this.scenery) {
      s.position.z += dist;
      if (s.position.z > DESPAWN_Z + 6) s.position.z -= this.sceneryLength;
    }
  }

  private updateIdle(dt: number) {
    this.phase += dt * 6;
    animateRig(this.rig, this.phase, { airborne: false, rolling: false, speedFactor: 0.35 }, this.time);
    this.rig.root.rotation.y = Math.PI + Math.sin(this.time * 0.6) * 0.35;
  }

  private updateRun(dt: number) {
    this.speed = Math.min(MAX_SPEED, this.speed + dt * 0.32);
    const dist = this.speed * dt;
    this.runMs += dt * 1000;
    if (!this.coinTouched) this.noCoinMs += dt * 1000 * this.timerMultiplier;

    this.scrollWorld(dist);
    this.updateTrail(dt, dist);
    if (this.lavaMode) this.lavaMat.emissiveIntensity = 0.9 + Math.sin(this.time * 6) * 0.35;

    // spawn
    this.distSinceSpawn += dist;
    if (this.distSinceSpawn >= this.nextGap) {
      this.distSinceSpawn = 0;
      this.spawnRow();
    }

    // player physics
    const targetX = LANES[this.lane];
    this.x += (targetX - this.x) * Math.min(1, dt * 14);
    if (this.y > 0 || this.vy > 0) {
      this.vy -= GRAVITY * dt;
      this.y = Math.max(0, this.y + this.vy * dt);
      if (this.y === 0) this.vy = 0;
    }
    const rolling = this.rollT > 0;
    if (rolling) this.rollT -= dt;

    this.rig.root.position.set(this.x, this.y, 0);
    this.rig.root.rotation.z = (this.x - targetX) * 0.12;
    this.phase += dist * 0.55;
    if (rolling) {
      this.rig.pivot.rotation.x -= dt * 16;
      this.rig.pivot.scale.setScalar(0.7);
      this.rig.pivot.position.y = 0.5;
    } else {
      this.rig.pivot.rotation.x = 0;
      this.rig.pivot.scale.setScalar(1);
    }
    animateRig(
      this.rig,
      this.phase,
      { airborne: this.y > 0.05, rolling, speedFactor: 1 },
      this.time,
    );

    // player box
    const pMinY = this.y;
    const pMaxY = this.y + (rolling ? 0.9 : 1.75);
    const pHalfW = 0.38;
    const pHalfD = 0.35;

    // obstacles
    for (let i = this.obstacles.length - 1; i >= 0; i--) {
      const o = this.obstacles[i];
      o.z += dist;
      o.mesh.position.z = o.z;
      const front = o.z;
      const back = o.z - o.length;
      if (back > DESPAWN_Z) {
        this.scene.remove(o.mesh);
        this.obstacles.splice(i, 1);
        continue;
      }
      const ox = LANES[o.lane];
      const hitX = Math.abs(this.x - ox) < 0.95 + pHalfW - 0.2;
      const hitZ = front + 0.15 > -pHalfD && back - 0.15 < pHalfD;
      const hitY = pMaxY > o.minY && pMinY < o.maxY;
      if (hitX && hitZ && hitY) {
        this.crashCause = o.kind === "lava" ? "lava" : "hit";
        this.crash();
        return;
      }
    }

    // coins
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.z += dist;
      c.spin += dt * 5;
      c.mesh.position.z = c.z;
      c.mesh.rotation.z = c.spin;
      if (c.taken) {
        c.mesh.position.y += dt * 6;
        c.mesh.scale.multiplyScalar(1 - dt * 6);
        if (c.mesh.scale.x < 0.05) {
          this.scene.remove(c.mesh);
          this.coins.splice(i, 1);
        }
        continue;
      }
      if (c.z > DESPAWN_Z) {
        this.scene.remove(c.mesh);
        this.coins.splice(i, 1);
        continue;
      }
      const hit =
        Math.abs(c.mesh.position.x - this.x) < 0.75 &&
        Math.abs(c.z) < 0.7 &&
        c.y + 0.36 > pMinY &&
        c.y - 0.36 < pMaxY;
      if (hit) {
        c.taken = true;
        this.coinCount++;
        if (!this.coinTouched) {
          this.coinTouched = true;
          this.cb.onFirstCoin();
        }
        this.cb.onCoin(this.coinCount);
      }
    }

    this.cb.onTick({
      noCoinMs: this.noCoinMs,
      coins: this.coinCount,
      frozen: this.coinTouched,
      runMs: this.runMs,
    });
  }

  /** Ends the current run (used by "give up" in the pause menu). */
  quit() {
    if (this.mode === "running" || this.mode === "paused") this.crash();
  }

  private crash() {
    this.mode = "crashing";
    this.crashT = 0;
    this.shake = 0.6;
  }

  private updateCrash(dt: number) {
    this.crashT += dt;
    const t = Math.min(1, this.crashT / 0.5);
    this.rig.root.rotation.x = -t * 1.4;
    this.rig.root.position.z = t * 1.2;
    this.rig.root.position.y = Math.max(0, this.y * (1 - t));
    if (this.crashT > 0.9 && this.mode === "crashing") {
      this.mode = "over";
      this.cb.onGameOver({
        cause: this.crashCause,
        noCoinMs: Math.floor(this.noCoinMs),
        coins: this.coinCount,
        runMs: Math.floor(this.runMs),
      });
    }
  }

  private camTarget = new THREE.Vector3();
  private updateCamera(dt: number) {
    const portrait = window.innerWidth / window.innerHeight < 0.8;
    let px: number, py: number, pz: number;
    if (this.mode === "idle") {
      const wide = window.innerWidth > 900;
      px = wide ? -1.4 : 0;
      py = wide ? 2.3 : 1.9;
      pz = wide ? 5.2 : 6.2;
      this.camTarget.set(wide ? -1.9 : 0, wide ? 1.1 : -1.2, 0);
    } else {
      px = this.x * 0.55;
      py = (portrait ? 5.2 : 4.4) + this.y * 0.35;
      pz = portrait ? 8.6 : 7.2;
      this.camTarget.set(this.x * 0.4, 1.2, -7);
    }
    const k = Math.min(1, dt * (this.mode === "idle" ? 2.5 : 6));
    this.camera.position.x += (px - this.camera.position.x) * k;
    this.camera.position.y += (py - this.camera.position.y) * k;
    this.camera.position.z += (pz - this.camera.position.z) * k;
    if (this.shake > 0) {
      this.shake = Math.max(0, this.shake - dt);
      this.camera.position.x += (Math.random() - 0.5) * this.shake;
      this.camera.position.y += (Math.random() - 0.5) * this.shake;
    }
    this.camera.lookAt(this.camTarget);
  }
}

// ---------------------------------------------------------------- helpers
const stripeCache = new Map<string, THREE.MeshStandardMaterial>();
function stripeMaterial(a: string, b: string) {
  const key = a + b;
  const cached = stripeCache.get(key);
  if (cached) return cached;
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 32;
  const g = c.getContext("2d")!;
  g.fillStyle = b;
  g.fillRect(0, 0, 128, 32);
  g.fillStyle = a;
  for (let i = -2; i < 8; i++) {
    g.beginPath();
    g.moveTo(i * 24, 32);
    g.lineTo(i * 24 + 12, 32);
    g.lineTo(i * 24 + 32 + 12, 0);
    g.lineTo(i * 24 + 32, 0);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 });
  stripeCache.set(key, m);
  return m;
}

function shuffle<T>(arr: T[]) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
