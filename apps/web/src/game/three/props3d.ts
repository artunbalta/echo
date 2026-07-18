/**
 * Every prop in the world, built from geometry.
 *
 * This is the 3D twin of props.ts, which drew the same 27 kinds into 16×24 canvases. Same
 * vocabulary, same ids (`proc:<kind>`), same meaning — different medium. Nothing is loaded: no
 * GLB, no textures, no binaries to commit and no assets to 404 in production. The style rule is the
 * art bible's, unchanged: nature organic (spheres, cones, irregular solids), built things geometric
 * (boxes, clean edges), flat-shaded, no specular.
 *
 * The raft's five stages matter most. The silhouette IS the progress bar — holding [space] walks it
 * from two crossed logs to a true raft with a stub mast, so the work you put in is legible without
 * a number on screen. There has never been a PNG for these and there never will be.
 */
import * as THREE from "three";
import { PALETTE, hashStr } from "./palette";
import type { PropKind } from "../props";

const lam = (c: number) => new THREE.MeshLambertMaterial({ color: c, flatShading: true });

// Materials are shared across every instance of a kind — 100 islands of trees would otherwise mean
// thousands of identical materials and a shader recompile for each.
const M = {
  wood: lam(PALETTE.wood),
  woodLight: lam(PALETTE.woodLight),
  trunk: lam(PALETTE.trunk),
  rope: lam(PALETTE.rope),
  cloth: lam(PALETTE.cloth),
  leaf: lam(PALETTE.leaf),
  leafDark: lam(PALETTE.leafDark),
  bush: lam(PALETTE.bush),
  rock: lam(PALETTE.rock),
  rockLight: lam(PALETTE.rockLight),
  soil: lam(PALETTE.soil),
  sand: lam(PALETTE.sand),
  grain: lam(0xc9b458),
  grainRipe: lam(0xe0c15a),
  flower: lam(PALETTE.flower),
  water: lam(PALETTE.seaShallow),
  dark: lam(0x120f16),
  fur: lam(0xb6814a),
  furDark: lam(0x8c5d31),
  ember: new THREE.MeshBasicMaterial({ color: PALETTE.lantern }),
  echo: new THREE.MeshBasicMaterial({ color: PALETTE.echo, transparent: true, opacity: 0.5 }),
};

const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
const cyl = (rt: number, rb: number, h: number, s = 6) => new THREE.CylinderGeometry(rt, rb, h, s);

/** A log lying on its side, pointing along X. */
function log(len: number, r: number, mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(cyl(r, r, len, 6), mat);
  m.rotation.z = Math.PI / 2;
  m.castShadow = true;
  return m;
}

/** A plank. */
function plank(len: number, mat: THREE.Material = M.wood): THREE.Mesh {
  const m = new THREE.Mesh(box(len, 0.05, 0.16), mat);
  m.castShadow = true;
  return m;
}

// ── the raft, stage by stage ─────────────────────────────────────────────────────

function raftStage(stage: 0 | 1 | 2 | 3 | 4): THREE.Group {
  const g = new THREE.Group();
  // Two crossed bearers — always there from the first stage.
  const b1 = log(1.5, 0.07, M.trunk);
  b1.position.set(0, 0.06, -0.28);
  const b2 = log(1.5, 0.07, M.trunk);
  b2.position.set(0, 0.06, 0.28);
  g.add(b1, b2);

  const deck = (n: number) => {
    for (let i = 0; i < n; i++) {
      const p = plank(1.3);
      p.position.set(0, 0.14, -0.36 + (i / Math.max(1, n - 1)) * 0.72);
      g.add(p);
    }
  };

  if (stage >= 1) deck(3);        // raft_half — a half deck, planks loose
  if (stage >= 2) {
    g.clear();
    g.add(b1, b2);
    deck(6);                       // raft_lashed — a bound deck; the first stage that floats
    for (const z of [-0.28, 0.28]) {
      const r = new THREE.Mesh(cyl(0.03, 0.03, 0.75, 5), M.rope);
      r.rotation.x = Math.PI / 2;
      r.position.set(0.45, 0.16, z);
      g.add(r);
    }
  }
  if (stage >= 3) {
    // raft_solid — double crossbeams, tight rope
    const b3 = log(0.8, 0.05, M.trunk);
    b3.rotation.y = Math.PI / 2;
    b3.position.set(-0.5, 0.19, 0);
    const b4 = b3.clone();
    b4.position.x = 0.5;
    g.add(b3, b4);
  }
  if (stage >= 4) {
    // raft_true — bound rails and a stub mast
    for (const z of [-0.4, 0.4]) {
      const rail = log(1.4, 0.04, M.woodLight);
      rail.position.set(0, 0.24, z);
      g.add(rail);
    }
    const mast = new THREE.Mesh(cyl(0.035, 0.05, 0.9, 5), M.trunk);
    mast.position.set(0, 0.6, 0);
    mast.castShadow = true;
    g.add(mast);
    const sail = new THREE.Mesh(box(0.02, 0.5, 0.55), M.cloth);
    sail.position.set(0, 0.75, 0);
    sail.castShadow = true;
    g.add(sail);
  }
  return g;
}

// ── the stands: bark frame + parchment awning (a stall silhouette, never a humanoid) ──

function stand(awning: number, goods: () => THREE.Object3D[]): THREE.Group {
  const g = new THREE.Group();
  for (const [x, z] of [[-0.5, -0.35], [0.5, -0.35], [-0.5, 0.35], [0.5, 0.35]] as const) {
    const post = new THREE.Mesh(cyl(0.05, 0.06, 1.1, 5), M.trunk);
    post.position.set(x, 0.55, z);
    post.castShadow = true;
    g.add(post);
  }
  const counter = new THREE.Mesh(box(1.2, 0.08, 0.8), M.wood);
  counter.position.y = 0.62;
  counter.castShadow = true;
  g.add(counter);
  const roof = new THREE.Mesh(box(1.4, 0.05, 1.0), lam(awning));
  roof.position.y = 1.14;
  roof.rotation.z = 0.07;
  roof.castShadow = true;
  g.add(roof);
  for (const o of goods()) g.add(o);
  return g;
}

// ── the registry ─────────────────────────────────────────────────────────────────

const BUILDERS: Record<PropKind, () => THREE.Group> = {
  dog: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.26, 3, 6), M.fur);
    body.rotation.z = Math.PI / 2;
    body.position.y = 0.22;
    body.castShadow = true;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 6, 5), M.fur);
    head.position.set(0.24, 0.3, 0);
    const snout = new THREE.Mesh(box(0.1, 0.07, 0.07), M.furDark);
    snout.position.set(0.34, 0.27, 0);
    const tail = new THREE.Mesh(cyl(0.02, 0.03, 0.2, 4), M.furDark);
    tail.position.set(-0.24, 0.32, 0);
    tail.rotation.z = -0.7;
    g.add(body, head, snout, tail);
    for (const [x, z] of [[0.14, 0.09], [0.14, -0.09], [-0.14, 0.09], [-0.14, -0.09]] as const) {
      const leg = new THREE.Mesh(cyl(0.035, 0.035, 0.2, 4), M.furDark);
      leg.position.set(x, 0.1, z);
      g.add(leg);
    }
    return g;
  },

  grain_sprout: () => {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(cyl(0.34, 0.38, 0.06, 8), M.soil);
    soil.position.y = 0.03;
    g.add(soil);
    for (let i = 0; i < 5; i++) {
      const b = new THREE.Mesh(box(0.02, 0.22, 0.02), M.grain);
      const a = (i / 5) * Math.PI * 2;
      b.position.set(Math.cos(a) * 0.1, 0.16, Math.sin(a) * 0.1);
      b.rotation.z = (i - 2) * 0.09;
      g.add(b);
    }
    return g;
  },

  grain_ripe: () => {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(cyl(0.34, 0.38, 0.06, 8), M.soil);
    soil.position.y = 0.03;
    g.add(soil);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const stalk = new THREE.Mesh(box(0.02, 0.5, 0.02), M.grainRipe);
      stalk.position.set(Math.cos(a) * 0.12, 0.3, Math.sin(a) * 0.12);
      stalk.rotation.z = (i - 3) * 0.07;
      stalk.castShadow = true;
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.045, 5, 4), M.grainRipe);
      head.position.set(Math.cos(a) * 0.14, 0.56, Math.sin(a) * 0.14);
      g.add(stalk, head);
    }
    return g;
  },

  raft: () => raftStage(4),
  raft_frame: () => raftStage(0),
  raft_half: () => raftStage(1),
  raft_lashed: () => raftStage(2),
  raft_solid: () => raftStage(3),
  raft_true: () => raftStage(4),

  tidepool: () => {
    const g = new THREE.Group();
    const basin = new THREE.Mesh(cyl(0.5, 0.42, 0.1, 10), M.rock);
    basin.position.y = 0.05;
    g.add(basin);
    const water = new THREE.Mesh(new THREE.CircleGeometry(0.42, 12), M.water);
    water.rotation.x = -Math.PI / 2;
    water.position.y = 0.105;
    g.add(water);
    for (let i = 0; i < 4; i++) {
      const r = new THREE.Mesh(new THREE.DodecahedronGeometry(0.09, 0), M.rockLight);
      const a = (i / 4) * Math.PI * 2 + 0.5;
      r.position.set(Math.cos(a) * 0.46, 0.1, Math.sin(a) * 0.46);
      g.add(r);
    }
    return g;
  },

  berry_bush: () => {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 0), M.bush);
    b.position.y = 0.36;
    b.castShadow = true;
    g.add(b);
    for (let i = 0; i < 6; i++) {
      const berry = new THREE.Mesh(new THREE.SphereGeometry(0.05, 4, 3), lam(0xa33b4a));
      const a = (i / 6) * Math.PI * 2;
      berry.position.set(Math.cos(a) * 0.3, 0.34 + (i % 3) * 0.1, Math.sin(a) * 0.3);
      g.add(berry);
    }
    return g;
  },

  book_cairn: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.24 - i * 0.03, 0), i % 2 ? M.rock : M.rockLight);
      s.position.y = 0.14 + i * 0.2;
      s.rotation.y = i * 0.7;
      s.castShadow = true;
      g.add(s);
    }
    const bk = new THREE.Mesh(box(0.3, 0.06, 0.22), M.cloth);
    bk.position.set(0.08, 1.16, 0);
    bk.rotation.z = 0.16;
    g.add(bk);
    return g;
  },

  bedroll: () => {
    const g = new THREE.Group();
    const roll = new THREE.Mesh(new THREE.CapsuleGeometry(0.16, 0.7, 3, 6), M.cloth);
    roll.rotation.z = Math.PI / 2;
    roll.position.y = 0.16;
    roll.castShadow = true;
    const pillow = new THREE.Mesh(box(0.2, 0.1, 0.3), lam(0xb9a888));
    pillow.position.set(-0.42, 0.2, 0);
    g.add(roll, pillow);
    return g;
  },

  campfire: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.08, 0), M.rock);
      s.position.set(Math.cos(a) * 0.34, 0.05, Math.sin(a) * 0.34);
      g.add(s);
    }
    for (let i = 0; i < 4; i++) {
      const l = log(0.5, 0.05, M.trunk);
      l.position.y = 0.1;
      l.rotation.y = (i / 4) * Math.PI;
      l.rotation.z = Math.PI / 2 - 0.35;
      g.add(l);
    }
    // The one pooled warm light in the world (the bible's lantern rule) — the flame is emissive,
    // and the light itself is added by the renderer so it actually pools on the ground.
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.34, 5), M.ember);
    flame.position.y = 0.34;
    flame.name = "flame";
    g.add(flame);
    return g;
  },

  hill: () => {
    const g = new THREE.Group();
    const m = new THREE.Mesh(new THREE.ConeGeometry(1.5, 1.5, 9), lam(PALETTE.grassDry));
    m.position.y = 0.75;
    m.castShadow = true;
    g.add(m);
    const cap = new THREE.Mesh(new THREE.DodecahedronGeometry(0.2, 0), M.rock);
    cap.position.y = 1.5;
    g.add(cap);
    return g;
  },

  thicket: () => {
    const g = new THREE.Group();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.34 + (i % 2) * 0.1, 0), i % 2 ? M.leafDark : M.bush);
      b.position.set(Math.cos(a) * 0.34, 0.3 + (i % 3) * 0.08, Math.sin(a) * 0.34);
      b.castShadow = true;
      g.add(b);
    }
    return g;
  },

  driftwood: () => {
    const g = new THREE.Group();
    const l = log(0.9, 0.08, M.woodLight);
    l.position.y = 0.08;
    l.rotation.y = 0.4;
    g.add(l);
    const s = log(0.4, 0.05, M.wood);
    s.position.set(0.2, 0.1, 0.14);
    s.rotation.y = -0.7;
    g.add(s);
    return g;
  },

  shell: () => {
    const g = new THREE.Group();
    const s = new THREE.Mesh(new THREE.SphereGeometry(0.12, 7, 4, 0, Math.PI * 2, 0, Math.PI / 2), lam(0xe6d3b8));
    s.position.y = 0.04;
    s.rotation.x = 0.25;
    g.add(s);
    return g;
  },

  path_marker: () => {
    const g = new THREE.Group();
    const post = new THREE.Mesh(cyl(0.05, 0.06, 0.8, 5), M.trunk);
    post.position.y = 0.4;
    post.castShadow = true;
    const arm = new THREE.Mesh(box(0.36, 0.09, 0.03), M.woodLight);
    arm.position.set(0.12, 0.68, 0);
    g.add(post, arm);
    return g;
  },

  fertile_patch: () => {
    const g = new THREE.Group();
    const soil = new THREE.Mesh(cyl(0.55, 0.6, 0.07, 10), M.soil);
    soil.position.y = 0.035;
    g.add(soil);
    // Tilled furrows — built by hands, so: geometric.
    for (let i = -2; i <= 2; i++) {
      const f = new THREE.Mesh(box(0.9, 0.03, 0.06), lam(0x3d3024));
      f.position.set(0, 0.08, i * 0.16);
      g.add(f);
    }
    return g;
  },

  gamble_cave: () => {
    const g = new THREE.Group();
    const rockMass = new THREE.Mesh(new THREE.DodecahedronGeometry(1.1, 0), M.rock);
    rockMass.position.y = 0.6;
    rockMass.scale.set(1, 0.9, 0.8);
    rockMass.castShadow = true;
    g.add(rockMass);
    // The mouth: a black hole you cannot see into. That unreadability IS the risk cue.
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.42, 10), M.dark);
    mouth.position.set(0, 0.42, 0.72);
    g.add(mouth);
    return g;
  },

  marker_stone: () => {
    const g = new THREE.Group();
    const st = new THREE.Mesh(box(0.5, 1.1, 0.16), M.rockLight);
    st.position.y = 0.55;
    st.rotation.z = 0.04;
    st.castShadow = true;
    g.add(st);
    // The glyph. Echo-violet, and this is exactly the kind of rare, meaning-bearing use the ≤5%
    // rule protects: it marks the one thing in the world that is trying to tell you something.
    const glyph = new THREE.Mesh(new THREE.RingGeometry(0.08, 0.13, 8), M.echo);
    glyph.position.set(0, 0.7, 0.085);
    glyph.name = "glyph";
    g.add(glyph);
    return g;
  },

  buried_cache: () => {
    const g = new THREE.Group();
    const mound = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 4, 0, Math.PI * 2, 0, Math.PI / 2), M.soil);
    mound.position.y = 0.01;
    mound.scale.y = 0.4;
    g.add(mound);
    for (const r of [0.5, -0.5]) {
      const stick = new THREE.Mesh(box(0.36, 0.04, 0.04), M.trunk);
      stick.position.set(0, 0.2, 0);
      stick.rotation.z = r;
      g.add(stick);
    }
    return g;
  },

  shy_creature: () => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.16, 6, 5), lam(0x9a8ea8));
    body.position.y = 0.16;
    body.scale.set(1, 0.85, 1.2);
    const ear = (s: number) => {
      const e = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.14, 4), lam(0x9a8ea8));
      e.position.set(s * 0.07, 0.32, 0.02);
      return e;
    };
    const eye = (s: number) => {
      const e = new THREE.Mesh(new THREE.SphereGeometry(0.028, 4, 3), M.dark);
      e.position.set(s * 0.06, 0.19, 0.15);
      return e;
    };
    g.add(body, ear(-1), ear(1), eye(-1), eye(1));
    return g;
  },

  travel_stand: () => stand(0x6d7f9a, () => {
    const oar = new THREE.Mesh(box(0.06, 0.9, 0.03), M.woodLight);
    oar.position.set(-0.5, 1.0, 0.3);
    oar.rotation.z = 0.3;
    const blade = new THREE.Mesh(box(0.14, 0.24, 0.03), M.wood);
    blade.position.set(-0.66, 0.62, 0.3);
    return [oar, blade];
  }),

  workplace_stand: () => stand(0x8a7a5a, () => {
    const out: THREE.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const t = new THREE.Mesh(box(0.08, 0.3, 0.05), M.trunk);
      t.position.set(-0.3 + i * 0.3, 0.8, 0);
      out.push(t);
    }
    return out;
  }),

  food_stand: () => stand(0x9a6a52, () => {
    const out: THREE.Object3D[] = [];
    for (let i = 0; i < 4; i++) {
      const f = new THREE.Mesh(new THREE.SphereGeometry(0.08, 5, 4), i % 2 ? M.grainRipe : lam(0xa33b4a));
      out.push(Object.assign(f, { position: new THREE.Vector3(-0.36 + i * 0.24, 0.72, 0.1) }));
    }
    return out;
  }),

  market_stand: () => stand(0x7a5f8a, () => {
    const out: THREE.Object3D[] = [];
    for (let i = 0; i < 3; i++) {
      const c = new THREE.Mesh(box(0.16, 0.16, 0.16), i % 2 ? M.cloth : M.woodLight);
      c.position.set(-0.3 + i * 0.3, 0.74, 0);
      c.rotation.y = i * 0.4;
      out.push(c);
    }
    return out;
  }),
};

const cache = new Map<PropKind, THREE.Group>();

/**
 * Build (or clone) a prop. Kinds are cached and cloned, so an island of driftwood costs one
 * geometry build and N cheap clones sharing materials.
 */
export function buildProp3D(kind: PropKind, id = ""): THREE.Group {
  let proto = cache.get(kind);
  if (!proto) {
    proto = BUILDERS[kind]();
    cache.set(kind, proto);
  }
  const g = proto.clone(true);
  // Seeded rotation so a row of identical props does not read as a row of identical props.
  if (id) g.rotation.y = hashStr(id) * Math.PI * 2;
  return g;
}

/** A neutral stand-in for anything we do not have a builder for — visible, never invisible, so a
 *  missing prop shows up as a question rather than as nothing. */
export function buildUnknownProp(): THREE.Group {
  const g = new THREE.Group();
  const m = new THREE.Mesh(box(0.3, 0.3, 0.3), M.rockLight);
  m.position.y = 0.15;
  m.castShadow = true;
  g.add(m);
  return g;
}
