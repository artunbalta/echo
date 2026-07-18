/**
 * The islands and the sea, built in code.
 *
 * HEIGHT IS VISUAL ONLY. This is the load-bearing rule of the whole migration. The server holds
 * (x, y) on a flat plane and knows nothing about altitude; collision on both sides runs
 * `oceanLandAt(x, y, OCEAN_BEACH_W)` over the same shared geometry, and the proven drift is 0.0000.
 * So the ground here may dome, dip and jut as much as it likes — nothing reads its height back
 * into gameplay. You cannot climb a hill here to reach somewhere you could not walk to in 2D.
 * `groundHeight()` exists to SIT things on the dirt (a tree's roots, an avatar's feet), never to
 * decide where they may go.
 *
 * The island silhouette is therefore an exact function of the same OCEAN_ISLAND_R the collision
 * uses: what you see is where the wall is.
 */
import * as THREE from "three";
import { OCEAN_ISLAND_R, OCEAN_BEACH_W, oceanIslandCenters, WORLD } from "@echo/shared";
import { PALETTE, hash01 } from "./palette";

/** Vertical exaggeration of the island dome, in three units. Cosmetic. */
const DOME_H = 1.9;

/**
 * The visual height of the land at a tile position. Zero at (and beyond) the waterline, doming
 * gently toward each island's middle. Cosmetic only — see the file header.
 */
export function groundHeight(x: number, y: number): number {
  let best = 0;
  for (const c of oceanIslandCenters()) {
    const dx = x - c.x;
    if (dx > OCEAN_ISLAND_R || dx < -OCEAN_ISLAND_R) continue;
    const dy = y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > OCEAN_ISLAND_R * OCEAN_ISLAND_R) continue;
    const d = Math.sqrt(d2) / OCEAN_ISLAND_R; // 0 centre → 1 shore
    // A smooth dome that flattens to nothing exactly at the shore, so the beach meets the sea flush.
    const h = Math.cos(d * Math.PI * 0.5) ** 1.6 * DOME_H;
    if (h > best) best = h;
  }
  return best;
}

/**
 * One island's landmass: a disc of grass doming out of a sand ring. Radial geometry, because the
 * collision is radial — the coastline you see is `OCEAN_ISLAND_R` to the millimetre.
 */
function buildIsland(cx: number, cy: number, seed: number): THREE.Group {
  const g = new THREE.Group();
  g.position.set(cx, 0, cy);

  const RINGS = 10;
  const SEGS = 40;
  const R = OCEAN_ISLAND_R + OCEAN_BEACH_W;

  // A radial disc: rings × segments, displaced by the same dome function the props sit on.
  const geo = new THREE.CircleGeometry(R, SEGS, 0, Math.PI * 2);
  // CircleGeometry is a fan (one centre vertex + a rim) — too coarse to dome. Rebuild as a proper
  // radial grid so the dome has vertices to lift.
  const pos: number[] = [];
  const col: number[] = [];
  const idx: number[] = [];
  const grass = new THREE.Color(PALETTE.grass);
  const grassDry = new THREE.Color(PALETTE.grassDry);
  const sand = new THREE.Color(PALETTE.sand);
  const sandWet = new THREE.Color(PALETTE.sandWet);

  for (let r = 0; r <= RINGS; r++) {
    const rr = (r / RINGS) * R;
    for (let s = 0; s <= SEGS; s++) {
      const a = (s / SEGS) * Math.PI * 2;
      // A little organic wobble on the rim so islands are not perfect circles — nature is organic.
      // It never exceeds the beach width, so it cannot contradict the collision radius.
      const wob = (hash01(seed * 131 + s) - 0.5) * OCEAN_BEACH_W * 0.5 * (rr / R);
      const x = Math.cos(a) * (rr + wob);
      const z = Math.sin(a) * (rr + wob);
      const h = groundHeight(cx + x, cy + z);
      pos.push(x, h, z);

      const t = rr / R;
      let c: THREE.Color;
      if (t > OCEAN_ISLAND_R / R) {
        // the sand ring — wet at the very edge
        const wet = (t - OCEAN_ISLAND_R / R) / (1 - OCEAN_ISLAND_R / R);
        c = sand.clone().lerp(sandWet, wet);
      } else {
        // grass, drying toward the shore
        c = grass.clone().lerp(grassDry, Math.min(1, t * 1.3) * 0.5 + hash01(seed + r * 31 + s) * 0.12);
      }
      col.push(c.r, c.g, c.b);
    }
  }
  for (let r = 0; r < RINGS; r++) {
    for (let s = 0; s < SEGS; s++) {
      const a = r * (SEGS + 1) + s;
      const b = a + SEGS + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const bg = new THREE.BufferGeometry();
  bg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  bg.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  bg.setIndex(idx);
  bg.computeVertexNormals();
  const mesh = new THREE.Mesh(
    bg,
    new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  );
  mesh.receiveShadow = true;
  g.add(mesh);
  geo.dispose();

  return g;
}

/** Trees, bushes and rocks, seeded per island so every machine grows the same island. */
function buildFlora(cx: number, cy: number, seed: number): { group: THREE.Group; bushes: THREE.Mesh[] } {
  const group = new THREE.Group();
  group.position.set(cx, 0, cy);
  const bushes: THREE.Mesh[] = [];

  const trunkMat = new THREE.MeshLambertMaterial({ color: PALETTE.trunk, flatShading: true });
  const leafMats = [PALETTE.leafDark, PALETTE.leaf, PALETTE.leafLight].map(
    (c) => new THREE.MeshLambertMaterial({ color: c, flatShading: true }),
  );

  const N_TREE = 14;
  const N_BUSH = 10;
  const N_ROCK = 7;

  const place = (i: number, salt: number, maxR: number) => {
    const a = hash01(seed + i * 7 + salt) * Math.PI * 2;
    const r = Math.sqrt(hash01(seed + i * 13 + salt)) * maxR;
    return { x: Math.cos(a) * r, z: Math.sin(a) * r };
  };

  for (let i = 0; i < N_TREE; i++) {
    const { x, z } = place(i, 11, OCEAN_ISLAND_R - 2.5);
    const y = groundHeight(cx + x, cy + z);
    const t = new THREE.Group();
    t.position.set(x, y, z);
    const hgt = 1.5 + hash01(seed + i * 17) * 1.4;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.14, hgt, 5), trunkMat);
    trunk.position.y = hgt / 2;
    trunk.castShadow = true;
    t.add(trunk);
    // Two or three stacked cones — a soft conifer mass, flat-shaded.
    const tiers = 2 + Math.floor(hash01(seed + i * 19) * 2);
    for (let k = 0; k < tiers; k++) {
      const rr = 0.75 - k * 0.16;
      const cone = new THREE.Mesh(
        new THREE.ConeGeometry(rr, 0.95, 6),
        leafMats[Math.floor(hash01(seed + i * 23 + k) * leafMats.length)],
      );
      cone.position.y = hgt * 0.72 + k * 0.5;
      cone.rotation.y = hash01(seed + i * 29 + k) * Math.PI;
      cone.castShadow = true;
      t.add(cone);
    }
    t.rotation.y = hash01(seed + i * 31) * Math.PI * 2;
    group.add(t);
  }

  for (let i = 0; i < N_BUSH; i++) {
    const { x, z } = place(i, 37, OCEAN_ISLAND_R - 2);
    const y = groundHeight(cx + x, cy + z);
    // The bushes are the visible larder: scarcity thins them (WorldCore.bushVisible).
    const b = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.34 + hash01(seed + i * 41) * 0.16, 0),
      new THREE.MeshLambertMaterial({ color: PALETTE.bush, flatShading: true }),
    );
    b.position.set(x, y + 0.28, z);
    b.castShadow = true;
    group.add(b);
    bushes.push(b);
  }

  const rockMat = new THREE.MeshLambertMaterial({ color: PALETTE.rock, flatShading: true });
  for (let i = 0; i < N_ROCK; i++) {
    const { x, z } = place(i, 53, OCEAN_ISLAND_R - 1);
    const y = groundHeight(cx + x, cy + z);
    const s = 0.2 + hash01(seed + i * 59) * 0.3;
    const r = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rockMat);
    r.position.set(x, y + s * 0.5, z);
    r.rotation.set(hash01(seed + i * 61) * 3, hash01(seed + i * 67) * 3, hash01(seed + i * 71) * 3);
    r.castShadow = true;
    group.add(r);
  }

  return { group, bushes };
}

export interface TerrainBuild {
  group: THREE.Group;
  /** Every bush, in a stable order, so scarcity can thin them deterministically. */
  bushes: THREE.Mesh[];
  sea: THREE.Mesh;
  dispose: () => void;
}

/**
 * The whole visible world: one sea plane, and the islands the shared geometry says exist.
 * Only islands within `radius` tiles of the player are built — 100 domed islands is a lot of
 * triangles for a world where you can only ever see a handful.
 */
export function buildTerrain(centerX: number, centerY: number, radius = 90): TerrainBuild {
  const group = new THREE.Group();
  const bushes: THREE.Mesh[] = [];

  // ── the sea: one big plane at y=0, the waterline the collision already agrees on ──
  const sea = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD.MAP_WIDTH * 1.5, WORLD.MAP_HEIGHT * 1.5, 1, 1),
    new THREE.MeshLambertMaterial({ color: PALETTE.seaShallow, flatShading: true }),
  );
  sea.rotation.x = -Math.PI / 2;
  sea.position.set(WORLD.MAP_WIDTH / 2, 0, WORLD.MAP_HEIGHT / 2);
  sea.receiveShadow = false;
  group.add(sea);

  const centres = oceanIslandCenters();
  centres.forEach((c, i) => {
    if (Math.hypot(c.x - centerX, c.y - centerY) > radius) return;
    group.add(buildIsland(c.x, c.y, i * 997 + 13));
    const f = buildFlora(c.x, c.y, i * 997 + 13);
    group.add(f.group);
    bushes.push(...f.bushes);
  });

  const dispose = () => {
    group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else if (mat) mat.dispose();
    });
  };

  return { group, bushes, sea, dispose };
}
