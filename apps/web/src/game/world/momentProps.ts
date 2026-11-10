/**
 * The things the moments put in the world (DECISIONS C86, C87): a basket, a cart, a purse in the grass, two
 * boats on the sand. Made once, out of a few shapes each, and moved about by the moments layer; hidden
 * while no moment needs them. Each kind has its own, so two moments at once never share one.
 *
 * Sizes are in metres times `s` (the frame's tile over 1.6), as the rest of the layer's are.
 */
import * as THREE from "three";

type Mat = (hex: number, extra?: Partial<THREE.MeshLambertMaterialParameters>) => THREE.Material;
type Geo = <G extends THREE.BufferGeometry>(g: G) => G;

export interface MomentProps {
  // C86
  basket: THREE.Mesh;
  apples: THREE.Mesh[];
  cart: THREE.Group;
  ball: THREE.Mesh;
  buckets: THREE.Mesh[];
  hen: THREE.Group;
  lamp: THREE.Mesh;
  streak: THREE.Mesh;
  door: THREE.Group;
  // C87
  cane: THREE.Mesh;
  bottle: THREE.Mesh;
  /** The red boat, the shorter; the blue, plainly longer. */
  boats: [THREE.Group, THREE.Group];
  kite: THREE.Mesh;
  wall: THREE.Mesh;
  stones: THREE.Mesh[];
  net: THREE.Mesh;
  fish: THREE.Mesh[];
  fishBasket: THREE.Group;
  teaTable: THREE.Group;
  loaf: THREE.Mesh;
  fire: THREE.Group;
  flame: THREE.Mesh;
  fireLight: THREE.PointLight;
  dolphins: THREE.Mesh[];
  jugs: THREE.Mesh[];
  sacks: THREE.Mesh[];
  yoke: THREE.Group;
  staff: THREE.Mesh;
  pack: THREE.Mesh;
  purse: THREE.Mesh;
  coins: THREE.Mesh[];
  ledge: THREE.Mesh;
  gate: THREE.Group;
  fence: THREE.Group;
  lamb: THREE.Group;
  litter: THREE.Mesh[];
  bin: THREE.Mesh;
  logs: THREE.Mesh[];
  stall: THREE.Group;
  jars: THREE.Mesh[];
  nazar: THREE.Group;
  kaval: THREE.Mesh;
  pomegranate: THREE.Mesh;
  cup: THREE.Mesh;
  knucklebone: THREE.Mesh;
  /** Every one, for hiding them all at the start of a frame. */
  all: THREE.Object3D[];
}

export function momentProps(s: number, mat: Mat, geo: Geo, keep: (m: THREE.Material) => void): MomentProps {
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(geo(g), m);
  const wood = mat(0x7a5a3a);
  const darkWood = mat(0x4e3a26);

  // ── C86 ──
  const basket = mesh(new THREE.CylinderGeometry(0.22 * s, 0.17 * s, 0.22 * s, 8), mat(0x8a6a3e));
  const appleGeo = geo(new THREE.SphereGeometry(0.075 * s, 6, 5));
  const appleMat = mat(0xb5352a);
  const apples = Array.from({ length: 8 }, () => new THREE.Mesh(appleGeo, appleMat));
  const cart = new THREE.Group();
  const bed = mesh(new THREE.BoxGeometry(1.1 * s, 0.35 * s, 0.75 * s), wood);
  bed.position.y = 0.55 * s;
  const wheelGeo = geo(new THREE.CylinderGeometry(0.33 * s, 0.33 * s, 0.08 * s, 10));
  for (const side of [-1, 1]) {
    const wheel = new THREE.Mesh(wheelGeo, darkWood);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(0, 0.33 * s, side * 0.42 * s);
    cart.add(wheel);
  }
  const shaft = mesh(new THREE.BoxGeometry(1.2 * s, 0.06 * s, 0.06 * s), wood);
  shaft.position.set(1.05 * s, 0.6 * s, 0);
  cart.add(bed, shaft);
  const ball = mesh(new THREE.SphereGeometry(0.12 * s, 8, 6), mat(0xd8c9a0));
  const bucketGeo = geo(new THREE.CylinderGeometry(0.14 * s, 0.11 * s, 0.24 * s, 8));
  const bucketMat = mat(0x6a5a44);
  const buckets = Array.from({ length: 3 }, () => new THREE.Mesh(bucketGeo, bucketMat));
  const hen = new THREE.Group();
  const henMat = mat(0xe8e0cc);
  const henBody = mesh(new THREE.SphereGeometry(0.16 * s, 7, 5), henMat);
  henBody.scale.set(1.25, 1, 0.9);
  henBody.position.y = 0.2 * s;
  const henHead = mesh(new THREE.SphereGeometry(0.075 * s, 6, 5), henMat);
  henHead.position.set(0, 0.36 * s, 0.14 * s);
  const comb = mesh(new THREE.BoxGeometry(0.02 * s, 0.05 * s, 0.07 * s), mat(0xc0302a));
  comb.position.set(0, 0.43 * s, 0.14 * s);
  hen.add(henBody, henHead, comb);
  // A lantern's flame, in the hand of whoever carries one after dark: drawn bright, lit by nothing.
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd28a });
  keep(lampMat);
  const lamp = mesh(new THREE.SphereGeometry(0.07 * s, 6, 5), lampMat);
  // A door on its hinge: the group stands at the doorway, the leaf turns about its edge.
  const door = new THREE.Group();
  const hinge = new THREE.Group();
  hinge.position.set(-0.45 * s, 0, 0);
  const leaf = mesh(new THREE.BoxGeometry(0.9 * s, 1.85 * s, 0.07 * s), mat(0x6a4a30));
  leaf.position.set(0.45 * s, 0.93 * s, 0);
  hinge.add(leaf);
  door.add(hinge);
  const streakMat = new THREE.MeshBasicMaterial({ color: 0xe8f0ff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false });
  keep(streakMat);
  const streak = mesh(new THREE.BoxGeometry(0.9, 0.9, 22), streakMat);
  streak.frustumCulled = false;

  // ── C87 ──
  const cane = mesh(new THREE.CylinderGeometry(0.02 * s, 0.02 * s, 0.95 * s, 5), darkWood);
  cane.rotation.z = Math.PI / 2;
  const bottle = mesh(new THREE.CylinderGeometry(0.045 * s, 0.05 * s, 0.26 * s, 7), mat(0x3f6a3a, { emissive: 0x0c1a0c }));
  bottle.rotation.z = Math.PI / 2;
  // Two boats drawn up on the sand: a hull, a gunwale, a thwart. The red is a third shorter than the blue.
  const boat = (lengthM: number, hex: number) => {
    const g = new THREE.Group();
    const hull = mesh(new THREE.CylinderGeometry(0.42 * s, 0.3 * s, lengthM * s, 9, 1, false, 0, Math.PI), mat(hex));
    hull.rotation.z = Math.PI / 2;
    hull.rotation.y = Math.PI / 2;
    hull.position.y = 0.42 * s;
    const thwart = mesh(new THREE.BoxGeometry(0.06 * s, 0.05 * s, 0.7 * s), wood);
    thwart.position.y = 0.36 * s;
    g.add(hull, thwart);
    return g;
  };
  const boats: [THREE.Group, THREE.Group] = [boat(2.6, 0xa0413a), boat(4.2, 0x3e5f86)];
  const kite = mesh(new THREE.PlaneGeometry(0.5 * s, 0.7 * s), mat(0xc9a24a, { side: THREE.DoubleSide }));
  kite.rotation.x = -Math.PI / 2;
  const stone = mat(0x8a857a);
  const wall = mesh(new THREE.BoxGeometry(2.6 * s, 0.5 * s, 0.45 * s), stone);
  wall.position.y = 0.25 * s;
  const stoneGeo = geo(new THREE.DodecahedronGeometry(0.17 * s, 0));
  const stones = Array.from({ length: 6 }, () => new THREE.Mesh(stoneGeo, stone));
  const net = mesh(new THREE.BoxGeometry(1.6 * s, 0.06 * s, 1.1 * s), mat(0x46524a));
  const fishGeo = geo(new THREE.SphereGeometry(0.09 * s, 6, 4));
  const fishMat = mat(0xb8c4c8, { emissive: 0x101418 });
  const fish = Array.from({ length: 8 }, () => {
    const f = new THREE.Mesh(fishGeo, fishMat);
    f.scale.set(2.2, 0.55, 0.8);
    return f;
  });
  const fishBasket = new THREE.Group();
  const fb = mesh(new THREE.CylinderGeometry(0.26 * s, 0.2 * s, 0.24 * s, 8), mat(0x8a6a3e));
  fb.position.y = 0.12 * s;
  for (let i = 0; i < 3; i++) {
    const f = new THREE.Mesh(fishGeo, fishMat);
    f.scale.set(2.2, 0.55, 0.8);
    f.position.set((i - 1) * 0.1 * s, 0.26 * s, (i % 2) * 0.06 * s);
    f.rotation.y = i * 0.7;
    fishBasket.add(f);
  }
  fishBasket.add(fb);
  const teaTable = new THREE.Group();
  const top = mesh(new THREE.CylinderGeometry(0.28 * s, 0.28 * s, 0.04 * s, 10), wood);
  top.position.y = 0.32 * s;
  const leg = mesh(new THREE.CylinderGeometry(0.04 * s, 0.05 * s, 0.32 * s, 6), darkWood);
  leg.position.y = 0.16 * s;
  const glassMat = mat(0xa84a2a, { emissive: 0x2a0c04, transparent: true, opacity: 0.85 });
  for (const [x, z] of [[0.08, 0.05], [-0.1, -0.04]] as const) {
    const g = mesh(new THREE.CylinderGeometry(0.03 * s, 0.025 * s, 0.08 * s, 6), glassMat);
    g.position.set(x * s, 0.38 * s, z * s);
    teaTable.add(g);
  }
  teaTable.add(top, leg);
  const loaf = mesh(new THREE.SphereGeometry(0.13 * s, 7, 5), mat(0xb07a3e));
  loaf.scale.set(1.5, 0.75, 1);
  // A fire: logs crossed, a flame drawn bright, and a warm light that grows as it catches.
  const fire = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const log = mesh(new THREE.CylinderGeometry(0.06 * s, 0.06 * s, 0.8 * s, 6), darkWood);
    log.rotation.z = Math.PI / 2;
    log.rotation.y = (i / 4) * Math.PI;
    log.position.y = 0.06 * s;
    fire.add(log);
  }
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffb35a, transparent: true, opacity: 0.9 });
  keep(flameMat);
  const flame = mesh(new THREE.ConeGeometry(0.22 * s, 0.6 * s, 7), flameMat);
  flame.position.y = 0.35 * s;
  fire.add(flame);
  // The fire's light is not the fire's child: it stays in the scene, dark until a fire needs it, so that a
  // light coming and going never makes every material rebuild (the lanterns' rule, C84).
  const fireLight = new THREE.PointLight(0xffa860, 0, 12 * s, 1.6);
  const dolphinGeo = geo(new THREE.SphereGeometry(0.3 * s, 8, 5));
  const dolphinMat = mat(0x3c4a56);
  const dolphins = Array.from({ length: 3 }, () => {
    const d = new THREE.Mesh(dolphinGeo, dolphinMat);
    d.scale.set(3.2, 0.9, 1);
    return d;
  });
  const jugGeo = geo(new THREE.CylinderGeometry(0.12 * s, 0.16 * s, 0.42 * s, 8));
  const jugMat = mat(0xa8603e);
  const jugs = Array.from({ length: 2 }, () => new THREE.Mesh(jugGeo, jugMat));
  const sackGeo = geo(new THREE.SphereGeometry(0.24 * s, 7, 5));
  const sackMat = mat(0xb8a47c);
  const sacks = Array.from({ length: 2 }, () => {
    const k = new THREE.Mesh(sackGeo, sackMat);
    k.scale.set(1, 1.3, 0.9);
    return k;
  });
  // A water-carrier's yoke across the shoulders, a bucket hanging at each end.
  const yoke = new THREE.Group();
  const pole = mesh(new THREE.CylinderGeometry(0.025 * s, 0.025 * s, 1.5 * s, 5), wood);
  pole.rotation.z = Math.PI / 2;
  pole.position.y = 1.42 * s;
  yoke.add(pole);
  for (const side of [-1, 1]) {
    const b = new THREE.Mesh(bucketGeo, bucketMat);
    b.position.set(side * 0.7 * s, 0.85 * s, 0);
    yoke.add(b);
  }
  const staff = mesh(new THREE.CylinderGeometry(0.025 * s, 0.03 * s, 1.6 * s, 6), darkWood);
  const pack = mesh(new THREE.BoxGeometry(0.42 * s, 0.55 * s, 0.26 * s), mat(0x6e5a40));
  const purse = mesh(new THREE.SphereGeometry(0.14 * s, 8, 6), mat(0x7a4426, { emissive: 0x140804 }));
  purse.scale.set(1.25, 0.6, 0.95);
  const coinGeo = geo(new THREE.CylinderGeometry(0.045 * s, 0.045 * s, 0.012 * s, 9));
  // A coin catches the light, by day and by a lantern: drawn a little bright so it is seen in the grass.
  const coinMat = mat(0xe0bc50, { emissive: 0x5a420c });
  const coins = Array.from({ length: 9 }, () => new THREE.Mesh(coinGeo, coinMat));
  const ledge = mesh(new THREE.BoxGeometry(0.7 * s, 0.6 * s, 0.4 * s), stone);
  // A field gate: two posts, and a frame on a hinge at one of them.
  const gate = new THREE.Group();
  for (const x of [-0.75, 0.75]) {
    const post = mesh(new THREE.BoxGeometry(0.12 * s, 1.1 * s, 0.12 * s), darkWood);
    post.position.set(x * s, 0.55 * s, 0);
    gate.add(post);
  }
  const gateHinge = new THREE.Group();
  gateHinge.position.set(-0.7 * s, 0, 0);
  for (const y of [0.3, 0.65, 0.95]) {
    const rail = mesh(new THREE.BoxGeometry(1.4 * s, 0.07 * s, 0.05 * s), wood);
    rail.position.set(0.7 * s, y * s, 0);
    gateHinge.add(rail);
  }
  const brace = mesh(new THREE.BoxGeometry(1.5 * s, 0.06 * s, 0.05 * s), wood);
  brace.position.set(0.7 * s, 0.62 * s, 0);
  brace.rotation.z = 0.42;
  gateHinge.add(brace);
  gate.add(gateHinge);
  const fence = new THREE.Group();
  for (const x of [-1.2, 0, 1.2]) {
    const post = mesh(new THREE.BoxGeometry(0.1 * s, 0.9 * s, 0.1 * s), darkWood);
    post.position.set(x * s, 0.45 * s, 0);
    fence.add(post);
  }
  for (const y of [0.35, 0.7]) {
    const rail = mesh(new THREE.BoxGeometry(2.5 * s, 0.06 * s, 0.05 * s), wood);
    rail.position.set(0, y * s, 0);
    fence.add(rail);
  }
  const lamb = new THREE.Group();
  const wool = mat(0xeee8dc);
  const lambBody = mesh(new THREE.SphereGeometry(0.22 * s, 7, 5), wool);
  lambBody.scale.set(1.4, 1, 1);
  lambBody.position.set(-0.3 * s, 0.38 * s, 0);
  const lambHead = mesh(new THREE.SphereGeometry(0.1 * s, 6, 5), mat(0x3a3430));
  lambHead.position.set(0.05 * s, 0.42 * s, 0);
  for (const [x, z] of [[-0.45, 0.1], [-0.45, -0.1], [-0.15, 0.1], [-0.15, -0.1]] as const) {
    const l = mesh(new THREE.CylinderGeometry(0.03 * s, 0.03 * s, 0.26 * s, 5), mat(0x3a3430));
    l.position.set(x * s, 0.13 * s, z * s);
    lamb.add(l);
  }
  lamb.add(lambBody, lambHead);
  const litterMats = [mat(0x8a8070), mat(0x5a6a5a), mat(0x9a6a4a), mat(0x6a5a7a)];
  const litter = Array.from({ length: 7 }, (_, i) => {
    const l = mesh(i % 3 === 0 ? new THREE.BoxGeometry(0.22 * s, 0.03 * s, 0.16 * s) : new THREE.DodecahedronGeometry(0.07 * s, 0), litterMats[i % litterMats.length]!);
    return l;
  });
  const bin = mesh(new THREE.CylinderGeometry(0.26 * s, 0.22 * s, 0.5 * s, 9), mat(0x7a6440));
  const logGeo = geo(new THREE.CylinderGeometry(0.08 * s, 0.08 * s, 0.7 * s, 6));
  const logMat = mat(0x8a6a48);
  const logs = Array.from({ length: 8 }, () => new THREE.Mesh(logGeo, logMat));
  // An honesty stall: a trestle, a board with one jar painted on it, five jars of honey.
  const stall = new THREE.Group();
  const plank = mesh(new THREE.BoxGeometry(1.2 * s, 0.06 * s, 0.5 * s), wood);
  plank.position.y = 0.78 * s;
  stall.add(plank);
  for (const x of [-0.5, 0.5]) {
    const t = mesh(new THREE.BoxGeometry(0.06 * s, 0.78 * s, 0.4 * s), darkWood);
    t.position.set(x * s, 0.39 * s, 0);
    stall.add(t);
  }
  const board = mesh(new THREE.BoxGeometry(0.5 * s, 0.34 * s, 0.03 * s), mat(0xd8cba8));
  board.position.set(0, 1.08 * s, -0.22 * s);
  const mark = mesh(new THREE.BoxGeometry(0.09 * s, 0.13 * s, 0.01 * s), mat(0xb07a2a));
  mark.position.set(0, 1.08 * s, -0.2 * s);
  stall.add(board, mark);
  const jarGeo = geo(new THREE.CylinderGeometry(0.06 * s, 0.065 * s, 0.14 * s, 8));
  const jarMat = mat(0xc88a2a, { emissive: 0x2a1a04, transparent: true, opacity: 0.92 });
  const jars = Array.from({ length: 5 }, () => new THREE.Mesh(jarGeo, jarMat));
  // A nazar charm: the blue eye that watches, hung over the stall on a cord.
  const nazar = new THREE.Group();
  const eye = (r: number, hex: number, z: number) => {
    const d = mesh(new THREE.CylinderGeometry(r * s, r * s, 0.012 * s, 14), mat(hex, { emissive: hex === 0x1f4fa8 ? 0x0a1a3a : 0x000000 }));
    d.rotation.x = Math.PI / 2;
    d.position.z = z * s;
    return d;
  };
  nazar.add(eye(0.09, 0x1f4fa8, 0), eye(0.06, 0xf0f0f0, 0.008), eye(0.04, 0x6aa8e0, 0.014), eye(0.02, 0x101010, 0.02));
  const cord = mesh(new THREE.CylinderGeometry(0.004 * s, 0.004 * s, 0.3 * s, 4), mat(0x3a2a1a));
  cord.position.y = 0.24 * s;
  nazar.add(cord);
  const kaval = mesh(new THREE.CylinderGeometry(0.015 * s, 0.015 * s, 0.6 * s, 5), mat(0x9a7a4a));
  const pomegranate = mesh(new THREE.SphereGeometry(0.08 * s, 8, 6), mat(0xa8282a, { emissive: 0x200404 }));
  const cup = mesh(new THREE.CylinderGeometry(0.06 * s, 0.045 * s, 0.1 * s, 8), mat(0x8a5a3a));
  const knucklebone = mesh(new THREE.BoxGeometry(0.05 * s, 0.03 * s, 0.035 * s), mat(0xe8dcc0));

  const all: THREE.Object3D[] = [
    basket, ...apples, cart, ball, ...buckets, hen, lamp, streak, door,
    cane, bottle, ...boats, kite, wall, ...stones, net, ...fish, fishBasket, teaTable, loaf, fire, ...dolphins, ...jugs, ...sacks,
    yoke, staff, pack, purse, ...coins, ledge, gate, fence, lamb, ...litter, bin, ...logs, stall, ...jars, nazar, kaval, pomegranate, cup, knucklebone,
  ];
  for (const o of all) {
    o.visible = false;
    o.castShadow = o !== streak && o !== lamp && o !== flame;
  }
  return {
    basket, apples, cart, ball, buckets, hen, lamp, streak, door,
    cane, bottle, boats, kite, wall, stones, net, fish, fishBasket, teaTable, loaf, fire, flame, fireLight, dolphins, jugs, sacks,
    yoke, staff, pack, purse, coins, ledge, gate, fence, lamb, litter, bin, logs, stall, jars, nazar, kaval, pomegranate, cup, knucklebone,
    all,
  };
}
