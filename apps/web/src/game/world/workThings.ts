/**
 * What the village's people work AT, and with (DECISIONS C98).
 *
 * Each trade has its own motion (`crowd.ts` `taskPose`), and a motion with nothing under it is still a
 * person pretending: the potter's hands went round no pot and the smith struck the air. This file is
 * the pot and the anvil: for each task the thing worked on, stood where that task's hands are (measured
 * from the pose, not guessed: the wheel's head is under the potter's palms, the log under the saw), and
 * the tool, held in the hand and moved by it.
 *
 * A few boxes and cylinders each, in the world's flat colours, made the first time someone near is at
 * that work and handed out again every frame (`begin`, `put` for each body at work, `end`). Nothing here
 * knows who anyone is; the villagers' layer says who is working at what, and where their hands are
 * (`Crowd.hands`).
 *
 * Sizes are metres for a grown body, in the body's own frame: +z is the way it faces. A kit is scaled
 * with the body it is given to.
 */
import * as THREE from "three";

import type { Task } from "./crowd";

export interface WorkThings {
  /** Start a frame: nobody has anything yet. */
  begin(): void;
  /**
   * Give the body just posed its task's things. `feet` is where it stands in the scene, `yaw` the way
   * it faces (three's rotation.y; 0 faces +z), `scale` its size against a grown body, `time` its own
   * clock; `grip`, `right` and `left` are its hands (`Crowd.hands`).
   */
  put(task: Task, feet: { x: number; y: number; z: number }, yaw: number, scale: number, time: number, grip: THREE.Matrix4, right: THREE.Vector3, left: THREE.Vector3): void;
  /**
   * The thing worked on, where its owner left it and while they are away: the loom does not go to dinner
   * with the weaver. No tool (that went with the hand), nothing turning, no rope held.
   */
  rest(task: Task, feet: { x: number; y: number; z: number }, yaw: number, scale: number): void;
  /** End a frame: hide what nobody was given. */
  end(): void;
  dispose(): void;
}

interface Kit {
  /** What is worked on: stands on the ground before the body. */
  piece: THREE.Group | null;
  /** What is worked with: in the hand. */
  tool: THREE.Group | null;
  /** The part of the piece that goes round (the wheel's head and the pot on it). */
  turning: THREE.Object3D | null;
  /** The part of the piece that is only there while hands hold it (the rope to the load). */
  held: THREE.Object3D | null;
}

/** How many bodies at one task are given its things at once: the nearest handful is all anyone sees. */
const EACH = 4;

/** Tasks a moment's own people do, with the moment's own props (the cart, the wall, the well's rope). */
const NOTHING: ReadonlySet<Task> = new Set<Task>(["hoe", "knead", "lay", "draw", "push"]);
/** Tasks whose only thing is in the hand: nothing of them stands about when the hand has gone. */
const HAND_ONLY: ReadonlySet<Task> = new Set<Task>(["sweep"]);

export function workThings(scene: THREE.Scene): WorkThings {
  const group = new THREE.Group();
  group.name = "villagers:work";
  scene.add(group);
  const geometries: THREE.BufferGeometry[] = [];
  const lambert = (color: number, extra: Partial<THREE.MeshLambertMaterialParameters> = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });
  const M = {
    wood: lambert(0x9a7444),
    dark: lambert(0x5b4128),
    bark: lambert(0x6e5236),
    stone: lambert(0x83868c),
    iron: lambert(0x4a4d55),
    steel: lambert(0xaab0b8),
    clay: lambert(0xb4643a),
    // A pot is open at the top, and seen into.
    pot: lambert(0xb4643a, { side: THREE.DoubleSide }),
    cloth: lambert(0x9b3d3d),
    sack: lambert(0xb39c6c),
    straw: lambert(0xc9a84c),
    green: lambert(0x5d8a3c),
    hot: lambert(0xff8a3a, { emissive: 0xc24a12 }),
  };
  const thread = new THREE.LineBasicMaterial({ color: 0xe2d8b8 });

  const add = (parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
    geometries.push(geometry);
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  };
  const box = (parent: THREE.Object3D, w: number, h: number, d: number, material: THREE.Material, x: number, y: number, z: number) => add(parent, new THREE.BoxGeometry(w, h, d), material, x, y, z);
  const cyl = (parent: THREE.Object3D, top: number, bottom: number, h: number, material: THREE.Material, x: number, y: number, z: number, sides = 10) =>
    add(parent, new THREE.CylinderGeometry(top, bottom, h, sides), material, x, y, z);
  /** A rod along +z from the origin, `length` long: a handle, a blade's back. */
  const rod = (parent: THREE.Object3D, r: number, length: number, material: THREE.Material) => {
    const m = cyl(parent, r, r, length, material, 0, 0, length / 2, 6);
    m.rotation.x = Math.PI / 2;
    return m;
  };
  const lines = (parent: THREE.Object3D, points: number[]) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(points, 3));
    geometries.push(g);
    parent.add(new THREE.LineSegments(g, thread));
  };

  const build = (task: Task): Kit => {
    const piece = new THREE.Group();
    const tool = new THREE.Group();
    tool.matrixAutoUpdate = false;
    let turning: THREE.Object3D | null = null;
    let held: THREE.Object3D | null = null;
    switch (task) {
      case "turn": {
        // A kick wheel: the heavy wheel at the foot, the head under the palms, the pot going round on it.
        cyl(piece, 0.07, 0.1, 0.6, M.dark, 0, 0.3, 0.53, 8);
        cyl(piece, 0.25, 0.25, 0.05, M.wood, 0, 0.08, 0.53, 14);
        turning = new THREE.Group();
        turning.position.set(0, 0.6, 0.53);
        cyl(turning, 0.21, 0.21, 0.04, M.wood, 0, 0.02, 0, 14);
        const profile = [new THREE.Vector2(0.1, 0), new THREE.Vector2(0.19, 0.07), new THREE.Vector2(0.2, 0.14), new THREE.Vector2(0.14, 0.22), new THREE.Vector2(0.12, 0.26)];
        add(turning, new THREE.LatheGeometry(profile, 10), M.pot, 0, 0.04, 0);
        piece.add(turning);
        break;
      }
      case "weave": {
        // An upright loom: the warp hanging from the top beam, the cloth made so far below the hands.
        for (const x of [-0.55, 0.55]) box(piece, 0.06, 1.55, 0.06, M.dark, x, 0.775, 0.66);
        box(piece, 1.16, 0.06, 0.06, M.dark, 0, 1.52, 0.66);
        box(piece, 1.16, 0.07, 0.07, M.wood, 0, 0.72, 0.66);
        box(piece, 0.98, 0.34, 0.012, M.cloth, 0, 0.92, 0.66);
        const warp: number[] = [];
        for (let i = 0; i < 17; i++) warp.push(-0.48 + i * 0.06, 1.09, 0.66, -0.48 + i * 0.06, 1.5, 0.66);
        lines(piece, warp);
        break;
      }
      case "hammer": {
        // An anvil on its block, the iron on it still bright; the hammer is the hand's.
        cyl(piece, 0.17, 0.2, 0.6, M.dark, 0, 0.3, 0.68, 8);
        box(piece, 0.34, 0.13, 0.14, M.iron, 0, 0.665, 0.68);
        box(piece, 0.16, 0.06, 0.1, M.iron, 0.24, 0.695, 0.68);
        box(piece, 0.3, 0.03, 0.04, M.hot, -0.1, 0.745, 0.66).rotation.y = 0.35;
        rod(tool, 0.014, 0.28, M.wood);
        box(tool, 0.05, 0.11, 0.05, M.iron, 0, 0, 0.28);
        break;
      }
      case "saw": {
        // A log across two trestles; the saw goes through it with the hand.
        // Far enough off that the saw's handle stays this side of it at the end of the push.
        for (const x of [-0.38, 0.38]) box(piece, 0.05, 0.6, 0.34, M.dark, x, 0.3, 0.72);
        cyl(piece, 0.09, 0.09, 1.1, M.bark, 0, 0.69, 0.72, 8).rotation.z = Math.PI / 2;
        box(tool, 0.006, 0.09, 0.46, M.steel, 0, -0.03, 0.27);
        box(tool, 0.03, 0.1, 0.06, M.wood, 0, 0, 0.02);
        break;
      }
      case "pick": {
        // The rock being broken, and what has come off it.
        const rock = add(piece, new THREE.DodecahedronGeometry(0.3), M.stone, 0, 0.2, 1.08);
        rock.scale.set(1, 0.75, 1);
        for (const [x, z, r] of [[-0.34, 0.86, 0.07], [0.3, 0.9, 0.05], [0.12, 0.74, 0.04]] as const) add(piece, new THREE.TetrahedronGeometry(r), M.stone, x, r * 0.5, z);
        const handle = rod(tool, 0.016, 0.5, M.wood);
        handle.position.z = 0.2;
        box(tool, 0.035, 0.4, 0.035, M.iron, 0, 0, 0.45);
        break;
      }
      case "mend": {
        // The net hung on its rack to dry, and mended where it hangs.
        for (const x of [-0.65, 0.65]) box(piece, 0.05, 1.35, 0.05, M.dark, x, 0.675, 0.6);
        box(piece, 1.35, 0.05, 0.05, M.dark, 0, 1.33, 0.6);
        const net: number[] = [];
        for (let i = 0; i < 12; i++) {
          // Diamonds: one strand down to the right, one down to the left, from each knot on the rail.
          const x = -0.6 + i * 0.1;
          net.push(x, 1.3, 0.6, Math.min(0.6, x + 0.95), Math.max(0.35, 1.3 - (Math.min(0.6, x + 0.95) - x)), 0.6);
          net.push(x + 0.1, 1.3, 0.6, Math.max(-0.6, x + 0.1 - 0.95), Math.max(0.35, 1.3 - (x + 0.1 - Math.max(-0.6, x + 0.1 - 0.95))), 0.6);
        }
        lines(piece, net);
        break;
      }
      case "haul": {
        // The load, and the rope from it to the hands.
        box(piece, 0.6, 0.34, 0.5, M.sack, 0, 0.17, 2.3);
        box(piece, 0.45, 0.26, 0.4, M.sack, 0.04, 0.47, 2.28).rotation.y = 0.3;
        const from = new THREE.Vector3(0, 1.08, 0.42);
        const to = new THREE.Vector3(0, 0.4, 2.05);
        const rope = cyl(piece, 0.012, 0.012, from.distanceTo(to), M.straw, (from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2, 5);
        rope.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), to.clone().sub(from).normalize());
        held = rope;
        break;
      }
      case "sweep": {
        // A broom: its shaft is as long as from the upper hand to the ground (set each frame).
        rod(tool, 0.014, 1, M.wood).name = "shaft";
        box(tool, 0.3, 0.05, 0.12, M.straw, 0, 0, 1).name = "head";
        break;
      }
      case "grind": {
        // A mortar on a block, and the pestle in the hand.
        cyl(piece, 0.24, 0.27, 0.6, M.dark, 0.05, 0.3, 0.53, 8);
        cyl(piece, 0.12, 0.085, 0.13, M.stone, 0.26, 0.665, 0.53, 10);
        box(piece, 0.12, 0.03, 0.08, M.green, -0.12, 0.615, 0.5);
        const pestle = cyl(tool, 0.022, 0.03, 0.2, M.stone, 0, 0, 0.1, 6);
        pestle.rotation.x = Math.PI / 2;
        break;
      }
      case "serve": {
        // A table with what is on offer: the hands set it straight.
        box(piece, 1.3, 0.05, 0.5, M.wood, 0, 0.86, 0.68);
        for (const x of [-0.6, 0.6]) for (const z of [0.48, 0.88]) box(piece, 0.05, 0.84, 0.05, M.dark, x, 0.42, z);
        cyl(piece, 0.06, 0.07, 0.14, M.clay, -0.42, 0.955, 0.74, 8);
        box(piece, 0.2, 0.08, 0.12, M.straw, 0, 0.925, 0.78);
        cyl(piece, 0.05, 0.05, 0.3, M.cloth, 0.4, 0.935, 0.76, 8).rotation.z = Math.PI / 2;
        break;
      }
      case "weed": {
        // The basket the weeds go into, at the side they are thrown to.
        cyl(piece, 0.2, 0.15, 0.2, M.straw, 0.62, 0.1, 0.25, 9);
        for (const [x, z] of [[0.58, 0.22], [0.67, 0.29]] as const) add(piece, new THREE.ConeGeometry(0.08, 0.16, 5), M.green, x, 0.24, z);
        break;
      }
      default:
        break;
    }
    const kit: Kit = { piece: piece.children.length ? piece : null, tool: tool.children.length ? tool : null, turning, held };
    if (kit.piece) group.add(kit.piece);
    if (kit.tool) group.add(kit.tool);
    return kit;
  };

  const kits = new Map<Task, Kit[]>();
  const used = new Map<Task, number>();
  const xA = new THREE.Vector3();
  const yA = new THREE.Vector3();
  const zA = new THREE.Vector3();
  const at = new THREE.Vector3();
  const to = new THREE.Vector3();
  const basis = new THREE.Matrix4();
  const UP = new THREE.Vector3(0, 1, 0);

  /** Put a tool at `at`, its length (+z) along `zA`, its flat (+x) as near `xA` as a right angle allows. */
  const lay = (tool: THREE.Group, scale: number) => {
    zA.normalize();
    yA.crossVectors(zA, xA).normalize();
    xA.crossVectors(yA, zA).normalize();
    basis.makeBasis(xA, yA, zA);
    basis.scale(to.set(scale, scale, scale));
    basis.setPosition(at);
    tool.matrix.copy(basis);
    tool.visible = true;
  };

  /** The next kit of a task this frame, its piece stood where the body is; null when the task has none left. */
  const take = (task: Task, feet: { x: number; y: number; z: number }, yaw: number, scale: number, inHand: boolean): Kit | null => {
    if (NOTHING.has(task) || (!inHand && HAND_ONLY.has(task))) return null;
    const n = used.get(task) ?? 0;
    if (n >= EACH) return null;
    let list = kits.get(task);
    if (!list) kits.set(task, (list = []));
    const kit = list[n] ?? (list[n] = build(task));
    used.set(task, n + 1);
    if (kit.piece) {
      kit.piece.position.set(feet.x, feet.y, feet.z);
      kit.piece.rotation.y = yaw;
      kit.piece.scale.setScalar(scale);
      kit.piece.visible = true;
    }
    if (kit.held) kit.held.visible = inHand;
    if (kit.tool) kit.tool.visible = false;
    return kit;
  };

  return {
    begin() {
      used.clear();
    },
    rest(task, feet, yaw, scale) {
      take(task, feet, yaw, scale, false);
    },
    put(task, feet, yaw, scale, time, grip, right, left) {
      const kit = take(task, feet, yaw, scale, true);
      if (!kit) return;
      if (kit.turning) kit.turning.rotation.y = time * 6;
      if (!kit.tool) return;
      at.copy(right);
      grip.extractBasis(xA, yA, zA);
      switch (task) {
        case "hammer":
          // Across the palm, its head out past the knuckles: it comes down as the forearm does.
          zA.negate();
          break;
        case "pick":
          // On along the forearm, as a thing swung from the shoulders is held.
          zA.copy(yA).negate();
          break;
        case "saw":
          // Level, the way the body faces: the hand goes back and forth and the blade with it.
          zA.set(Math.sin(yaw), 0, Math.cos(yaw));
          xA.set(Math.cos(yaw), 0, -Math.sin(yaw));
          break;
        case "grind":
          zA.set(0, -1, 0);
          break;
        case "sweep": {
          // From the upper hand down to the ground ahead, to the side the lower hand has gone.
          const across = (right.x - feet.x) * Math.cos(yaw) - (right.z - feet.z) * Math.sin(yaw);
          const reach = 0.95 * scale;
          const side = (across - 0.23 * scale) * 1.6;
          to.set(feet.x + Math.sin(yaw) * reach + Math.cos(yaw) * side, feet.y + 0.03, feet.z + Math.cos(yaw) * reach - Math.sin(yaw) * side);
          zA.copy(to).sub(left);
          const length = zA.length() / scale + 0.15;
          zA.normalize();
          at.copy(left).addScaledVector(zA, -0.15 * scale);
          xA.crossVectors(UP, zA);
          kit.tool.getObjectByName("shaft")!.scale.y = length;
          kit.tool.getObjectByName("shaft")!.position.z = length / 2;
          kit.tool.getObjectByName("head")!.position.z = length;
          break;
        }
        default:
          break;
      }
      lay(kit.tool, scale);
    },
    end() {
      for (const [task, list] of kits) {
        const n = used.get(task) ?? 0;
        for (let i = n; i < list.length; i++) {
          if (list[i]!.piece) list[i]!.piece!.visible = false;
          if (list[i]!.tool) list[i]!.tool!.visible = false;
        }
      }
    },
    dispose() {
      group.removeFromParent();
      for (const g of geometries) g.dispose();
      for (const m of Object.values(M)) m.dispose();
      thread.dispose();
      kits.clear();
    },
  };
}
