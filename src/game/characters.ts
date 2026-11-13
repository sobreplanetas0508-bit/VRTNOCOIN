// @ts-nocheck -- ported verbatim from the original game; written for a looser TypeScript config.
import * as THREE from "three";
import type { SkinId } from "./skins";

export interface CharacterRig {
  root: THREE.Group;
  /** Rotates/squashes for rolls. Positioned at hip height. */
  pivot: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  extras: THREE.Object3D[]; // capes, tails… animated with a wave
}

const matCache = new Map<string, THREE.MeshStandardMaterial>();
function mat(color: number, opts: { emissive?: number; rough?: number } = {}) {
  const key = `${color}-${opts.emissive ?? 0}-${opts.rough ?? 0.7}`;
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial({
      color,
      roughness: opts.rough ?? 0.7,
      metalness: 0.05,
      flatShading: true,
      emissive: opts.emissive ?? 0x000000,
    });
    matCache.set(key, m);
  }
  return m;
}

function box(w: number, h: number, d: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function ball(r: number, color: number, x = 0, y = 0, z = 0, seg = 10) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, seg, Math.max(6, seg - 2)), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}
function cone(r: number, h: number, color: number, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.ConeGeometry(r, h, 6), mat(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

interface Palette {
  skin: number;
  shirt: number;
  pants: number;
  shoes: number;
  sleeves?: number;
}

/**
 * Builds a humanoid rig. Front of the character faces -Z (direction of running).
 * Pivot sits at y=0.9 so rolls rotate around the body center.
 */
function baseRig(p: Palette): CharacterRig {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.position.y = 0.9;
  root.add(pivot);
  const off = -0.9; // children are authored in "feet = 0" coordinates

  const torso = box(0.62, 0.66, 0.36, p.shirt, 0, 1.12 + off, 0);
  pivot.add(torso);
  const hips = box(0.6, 0.18, 0.34, p.pants, 0, 0.8 + off, 0);
  pivot.add(hips);

  const mkLeg = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 0.78 + off, 0);
    g.add(box(0.24, 0.62, 0.26, p.pants, 0, -0.31, 0));
    g.add(box(0.28, 0.16, 0.38, p.shoes, 0, -0.7, -0.05));
    pivot.add(g);
    return g;
  };
  const mkArm = (x: number) => {
    const g = new THREE.Group();
    g.position.set(x, 1.4 + off, 0);
    g.add(box(0.18, 0.5, 0.2, p.sleeves ?? p.shirt, 0, -0.24, 0));
    g.add(ball(0.11, p.skin, 0, -0.54, 0, 8));
    pivot.add(g);
    return g;
  };

  return {
    root,
    pivot,
    legL: mkLeg(-0.16),
    legR: mkLeg(0.16),
    armL: mkArm(-0.42),
    armR: mkArm(0.42),
    extras: [],
  };
}

const HEAD_Y = 1.68 - 0.9;

function clown(): CharacterRig {
  const rig = baseRig({ skin: 0xffe0c2, shirt: 0xffd23f, pants: 0x3a86ff, shoes: 0xe63946, sleeves: 0xe63946 });
  const { pivot } = rig;
  // Polka dots on the shirt
  [[-0.15, 0.3], [0.14, 0.18], [-0.05, 0.05], [0.17, 0.38]].forEach(([x, y]) =>
    pivot.add(ball(0.06, 0x2ec4b6, x, y, -0.19, 6)),
  );
  pivot.add(ball(0.12, 0xffffff, 0, 0.47, -0.17, 8)); // collar ruffle
  pivot.add(ball(0.27, 0xfaf7f2, 0, HEAD_Y, 0, 12)); // white face
  pivot.add(ball(0.08, 0xe63946, 0, HEAD_Y - 0.02, -0.27, 10)); // red nose
  pivot.add(box(0.05, 0.05, 0.02, 0x1d3557, -0.1, HEAD_Y + 0.08, -0.25));
  pivot.add(box(0.05, 0.05, 0.02, 0x1d3557, 0.1, HEAD_Y + 0.08, -0.25));
  pivot.add(box(0.2, 0.04, 0.02, 0xe63946, 0, HEAD_Y - 0.13, -0.24)); // smile
  // Fluffy hair puffs
  [[-0.26, 0.04, 0xff6b35], [0.26, 0.04, 0xff6b35], [-0.2, 0.18, 0x9b5de5], [0.2, 0.18, 0x9b5de5], [0, 0.26, 0x00bbf9]].forEach(
    ([x, y, c]) => pivot.add(ball(0.13, c, x, HEAD_Y + y, 0.04, 8)),
  );
  // Tiny hat
  pivot.add(cone(0.1, 0.22, 0x2ec4b6, 0.05, HEAD_Y + 0.45, 0));
  return rig;
}

function joker(): CharacterRig {
  const rig = baseRig({ skin: 0xf4f1ea, shirt: 0x6a2c91, pants: 0x6a2c91, shoes: 0x2b2d42, sleeves: 0x6a2c91 });
  const { pivot } = rig;
  pivot.add(box(0.28, 0.5, 0.02, 0x3bb273, 0, 0.24, -0.19)); // green vest
  pivot.add(box(0.07, 0.3, 0.02, 0xf77f00, 0, 0.26, -0.205)); // orange tie
  pivot.add(box(0.48, 0.5, 0.46, 0xf4f1ea, 0, HEAD_Y, 0)); // pale face
  pivot.add(box(0.08, 0.06, 0.02, 0x111111, -0.12, HEAD_Y + 0.06, -0.235));
  pivot.add(box(0.08, 0.06, 0.02, 0x111111, 0.12, HEAD_Y + 0.06, -0.235));
  // Wide red grin
  pivot.add(box(0.3, 0.05, 0.02, 0xd00000, 0, HEAD_Y - 0.12, -0.235));
  pivot.add(box(0.05, 0.08, 0.02, 0xd00000, -0.16, HEAD_Y - 0.09, -0.235));
  pivot.add(box(0.05, 0.08, 0.02, 0xd00000, 0.16, HEAD_Y - 0.09, -0.235));
  // Spiky green hair
  pivot.add(box(0.52, 0.12, 0.5, 0x3bb273, 0, HEAD_Y + 0.29, 0.01));
  [-0.18, 0, 0.18].forEach((x, i) => pivot.add(cone(0.1, 0.24, 0x2d9a5f, x, HEAD_Y + 0.42 + (i % 2) * 0.04, 0.02)));
  return rig;
}

function cat(): CharacterRig {
  const fur = 0xf28c28;
  const rig = baseRig({ skin: fur, shirt: fur, pants: 0xd9731c, shoes: 0xfff4e6 });
  const { pivot } = rig;
  pivot.add(box(0.34, 0.4, 0.02, 0xfff4e6, 0, 0.2, -0.19)); // belly
  pivot.add(box(0.5, 0.44, 0.44, fur, 0, HEAD_Y, 0));
  // stripes
  pivot.add(box(0.52, 0.05, 0.3, 0xb85c12, 0, HEAD_Y + 0.17, 0.05));
  pivot.add(box(0.06, 0.05, 0.02, 0xb85c12, 0, HEAD_Y + 0.13, -0.225));
  const earL = cone(0.11, 0.24, fur, -0.15, HEAD_Y + 0.32, 0);
  const earR = cone(0.11, 0.24, fur, 0.15, HEAD_Y + 0.32, 0);
  pivot.add(earL, earR);
  pivot.add(cone(0.06, 0.12, 0xff99aa, -0.15, HEAD_Y + 0.3, -0.06), cone(0.06, 0.12, 0xff99aa, 0.15, HEAD_Y + 0.3, -0.06));
  pivot.add(box(0.26, 0.14, 0.06, 0xfff4e6, 0, HEAD_Y - 0.1, -0.23)); // muzzle
  pivot.add(ball(0.035, 0xff5c8a, 0, HEAD_Y - 0.04, -0.27, 6));
  pivot.add(box(0.09, 0.09, 0.02, 0x2bd96b, -0.12, HEAD_Y + 0.06, -0.225));
  pivot.add(box(0.09, 0.09, 0.02, 0x2bd96b, 0.12, HEAD_Y + 0.06, -0.225));
  pivot.add(box(0.03, 0.08, 0.025, 0x111111, -0.12, HEAD_Y + 0.06, -0.23));
  pivot.add(box(0.03, 0.08, 0.025, 0x111111, 0.12, HEAD_Y + 0.06, -0.23));
  // whiskers
  [-1, 1].forEach((s) => {
    pivot.add(box(0.2, 0.012, 0.01, 0x333333, s * 0.2, HEAD_Y - 0.08, -0.24));
    pivot.add(box(0.2, 0.012, 0.01, 0x333333, s * 0.2, HEAD_Y - 0.12, -0.24));
  });
  const tail = new THREE.Group();
  tail.position.set(0, -0.1, 0.18);
  const t1 = box(0.09, 0.09, 0.5, fur, 0, 0.1, 0.25);
  t1.rotation.x = -0.6;
  tail.add(t1);
  tail.add(box(0.1, 0.1, 0.14, 0xfff4e6, 0, 0.27, 0.46));
  pivot.add(tail);
  rig.extras.push(tail);
  return rig;
}

function dog(): CharacterRig {
  const fur = 0xa0673a;
  const rig = baseRig({ skin: fur, shirt: fur, pants: 0x7a4b28, shoes: 0x3d2614 });
  const { pivot } = rig;
  pivot.add(box(0.36, 0.42, 0.02, 0xf3e2c7, 0, 0.2, -0.19));
  pivot.add(box(0.66, 0.08, 0.4, 0xd62828, 0, 0.5, 0)); // red collar
  pivot.add(ball(0.06, 0xffd23f, 0, 0.44, -0.21, 8)); // tag
  pivot.add(box(0.5, 0.46, 0.46, fur, 0, HEAD_Y, 0));
  pivot.add(box(0.28, 0.22, 0.22, 0xf3e2c7, 0, HEAD_Y - 0.08, -0.3)); // snout
  pivot.add(ball(0.06, 0x1a1a1a, 0, HEAD_Y - 0.0, -0.42, 8)); // nose
  pivot.add(box(0.1, 0.04, 0.02, 0x8d1c1c, 0, HEAD_Y - 0.17, -0.41)); // tongue line
  pivot.add(ball(0.05, 0x1a1a1a, -0.13, HEAD_Y + 0.08, -0.23, 8));
  pivot.add(ball(0.05, 0x1a1a1a, 0.13, HEAD_Y + 0.08, -0.23, 8));
  pivot.add(box(0.16, 0.14, 0.03, 0x5c3a1e, 0.13, HEAD_Y + 0.08, -0.22)); // eye patch
  const earL = box(0.12, 0.34, 0.2, 0x5c3a1e, -0.3, HEAD_Y - 0.02, 0.02);
  const earR = box(0.12, 0.34, 0.2, 0x5c3a1e, 0.3, HEAD_Y - 0.02, 0.02);
  earL.rotation.z = 0.25;
  earR.rotation.z = -0.25;
  pivot.add(earL, earR);
  rig.extras.push(earL, earR);
  const tail = new THREE.Group();
  tail.position.set(0, -0.05, 0.18);
  const t = box(0.1, 0.1, 0.36, fur, 0, 0.12, 0.15);
  t.rotation.x = -0.9;
  tail.add(t);
  pivot.add(tail);
  rig.extras.push(tail);
  return rig;
}

function hero(): CharacterRig {
  const rig = baseRig({ skin: 0xf1c27d, shirt: 0x1d4ed8, pants: 0x1d4ed8, shoes: 0xc1121f, sleeves: 0x1d4ed8 });
  const { pivot } = rig;
  pivot.add(box(0.64, 0.08, 0.38, 0xffd60a, 0, -0.08, 0)); // gold belt
  pivot.add(box(0.64, 0.14, 0.38, 0xc1121f, 0, -0.17, 0)); // red trunks
  // Chest emblem: a simple red/gold diamond
  const em = box(0.22, 0.22, 0.02, 0xffd60a, 0, 0.3, -0.19);
  em.rotation.z = Math.PI / 4;
  pivot.add(em);
  const em2 = box(0.15, 0.15, 0.02, 0xc1121f, 0, 0.3, -0.2);
  em2.rotation.z = Math.PI / 4;
  pivot.add(em2);
  pivot.add(box(0.46, 0.48, 0.44, 0xf1c27d, 0, HEAD_Y, 0)); // head
  pivot.add(box(0.46, 0.10, 0.43, 0x14110f, 0, HEAD_Y + 0.245, 0.015)); // hair fixed above head
  pivot.add(box(0.1, 0.14, 0.04, 0x14110f, -0.05, HEAD_Y + 0.13, -0.22)); // curl
  pivot.add(box(0.07, 0.07, 0.02, 0x1d4ed8, -0.11, HEAD_Y + 0.04, -0.225));
  pivot.add(box(0.07, 0.07, 0.02, 0x1d4ed8, 0.11, HEAD_Y + 0.04, -0.225));
  pivot.add(box(0.16, 0.03, 0.02, 0x8a4b2a, 0, HEAD_Y - 0.12, -0.225));
  // Boots
  [rig.legL, rig.legR].forEach((leg) => leg.add(box(0.27, 0.28, 0.29, 0xc1121f, 0, -0.5, 0)));
  // Cape anchored at the shoulders
  const cape = new THREE.Group();
  cape.position.set(0, 0.5, 0.2);
  const cloth = new THREE.Mesh(
    new THREE.PlaneGeometry(0.75, 1.15, 1, 4),
    new THREE.MeshStandardMaterial({ color: 0xc1121f, side: THREE.DoubleSide, flatShading: true, roughness: 0.8 }),
  );
  cloth.position.y = -0.55;
  cloth.castShadow = true;
  cape.add(cloth);
  cape.rotation.x = 0.25;
  pivot.add(cape);
  rig.extras.push(cape);
  return rig;
}

function customHero(shirt: number, pants: number, hair: number, accent: number): CharacterRig {
  const rig = baseRig({ skin: 0xf1c9a5, shirt, pants, shoes: accent, sleeves: shirt });
  rig.pivot.add(box(0.49, 0.13, 0.48, hair, 0, HEAD_Y + 0.22, 0));
  rig.pivot.add(box(0.23, 0.22, 0.06, accent, 0, 0.3, -0.21));
  return rig;
}
const customLooks: Record<string, [number,number,number,number]> = {
 astronauta:[0xe5e7eb,0xd1d5db,0xf9fafb,0x38bdf8], ninja:[0x111827,0x111827,0x09090b,0xef4444],
 robo:[0x94a3b8,0x64748b,0x475569,0x22d3ee], pirata:[0x7f1d1d,0x1f2937,0x111827,0xfbbf24],
 zumbi:[0x4d7c0f,0x374151,0x365314,0xa3e635], rei:[0x7e22ce,0x581c87,0xfacc15,0xfacc15],
 samurai:[0x991b1b,0x1f2937,0x111827,0xf59e0b], alien:[0x16a34a,0x15803d,0x166534,0xa3e635],
 bombeiro:[0xdc2626,0x1f2937,0xfacc15,0xfacc15], galaxia:[0x312e81,0x1e1b4b,0x7c3aed,0x67e8f9]
};
const builders: Record<SkinId, () => CharacterRig> = {
  palhaco: clown,
  coringa: joker,
  gato: cat,
  cachorro: dog,
  superman: hero,
  astronauta: () => customHero(...customLooks.astronauta),
  ninja: () => customHero(...customLooks.ninja),
  robo: () => customHero(...customLooks.robo),
  pirata: () => customHero(...customLooks.pirata),
  zumbi: () => customHero(...customLooks.zumbi),
  rei: () => customHero(...customLooks.rei),
  samurai: () => customHero(...customLooks.samurai),
  alien: () => customHero(...customLooks.alien),
  bombeiro: () => customHero(...customLooks.bombeiro),
  galaxia: () => customHero(...customLooks.galaxia),

};

export function createCharacter(id: string): CharacterRig {
  return (builders[id as SkinId] ?? clown)();
}

/** Running / jumping / rolling pose. `phase` grows with distance. */
export function animateRig(
  rig: CharacterRig,
  phase: number,
  state: { airborne: boolean; rolling: boolean; speedFactor: number },
  time: number,
) {
  const s = Math.sin(phase);
  if (state.airborne) {
    rig.legL.rotation.x = -0.9;
    rig.legR.rotation.x = 0.4;
    rig.armL.rotation.x = 2.4;
    rig.armR.rotation.x = 2.4;
  } else {
    const amp = 0.95 * state.speedFactor;
    rig.legL.rotation.x = s * amp;
    rig.legR.rotation.x = -s * amp;
    rig.armL.rotation.x = -s * amp * 0.9;
    rig.armR.rotation.x = s * amp * 0.9;
  }
  rig.armL.rotation.z = -0.08;
  rig.armR.rotation.z = 0.08;
  if (!state.rolling) {
    rig.pivot.position.y = 0.9 + (state.airborne ? 0 : Math.abs(Math.cos(phase)) * 0.06 * state.speedFactor);
  }
  for (const e of rig.extras) {
    e.rotation.y = Math.sin(time * 9 + phase * 0.3) * 0.18 * state.speedFactor;
  }
}
