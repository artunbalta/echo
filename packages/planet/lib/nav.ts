/**
 * How a villager gets from one place to another without walking through a wall (DECISIONS C46, ⚑35).
 *
 * A VISIBILITY GRAPH, BUILT ONCE PER VILLAGE. The obstacles are what the village plan stands up:
 * every plot's house (its rectangle, grown by a body's width), the well, the mine's heap, and the
 * graveyard's wall — a circle with a gate in it, toward the green. The graph's nodes are the corners
 * of those shapes pushed a little further out, a ring round each circle, and the graveyard's gate; an
 * edge is a straight walk between two nodes that touches no obstacle. A walk from A to B is the
 * straight line when that is clear, and otherwise the shortest way round through the graph (A*).
 *
 * WHAT IT IS NOT. Not a navmesh, and not avoidance of other people: those are presentation, done in
 * the browser by the villagers layer (a step aside so nobody walks through the stranger). Fields and
 * benches are walked over; water is not modelled here, because nobody's day crosses it on foot.
 *
 * DETERMINISTIC AND THE SAME AT BOTH ENDS. The schedule routes every leg through this, so the server
 * (which asks where a villager is, for `talk/begin` and for witnesses) and every browser get the same
 * polyline from the same plan. It reads the plan and nothing else: every plot is an obstacle whether
 * or not its house is up yet, which costs a detour round an empty plot and buys a graph that does not
 * change with the day.
 *
 * Pure. Memoised per plan object (a WeakMap), because a day's plans route a few hundred legs.
 */

import type { Point, VillagePlan } from "./village.js";

/** A body's half-width, metres: how far from a wall the middle of a walking person stays. */
export const NAV = {
  bodyM: 0.35,
  /** How much further out than the body the graph's corner nodes stand. */
  cornerM: 0.55,
  /** Nodes further apart than this are not joined directly; the graph stays small and local. */
  linkM: 48,
} as const;

interface Rect {
  kind: "rect";
  x: number;
  y: number;
  /** Unit vectors along and across. */
  ux: number;
  uy: number;
  halfAlong: number;
  halfAcross: number;
}

interface Circle {
  kind: "circle";
  x: number;
  y: number;
  r: number;
  /** A gap in the wall, toward this point: whatever is inside is reached through it. */
  gate?: Point;
}

type Obstacle = Rect | Circle;

export interface NavGraph {
  obstacles: Obstacle[];
  nodes: Point[];
  adj: number[][];
}

const memo = new WeakMap<VillagePlan, NavGraph>();

const rect = (x: number, y: number, heading: number, halfAlong: number, halfAcross: number): Rect => ({
  kind: "rect",
  x,
  y,
  ux: Math.cos(heading),
  uy: Math.sin(heading),
  halfAlong,
  halfAcross,
});

/** Does the segment p→q pass within `grow` metres of the obstacle? */
function hits(o: Obstacle, p: Point, q: Point, grow: number): boolean {
  if (o.kind === "circle") {
    const dx = q.x - p.x;
    const dy = q.y - p.y;
    const len2 = dx * dx + dy * dy;
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((o.x - p.x) * dx + (o.y - p.y) * dy) / len2));
    return Math.hypot(p.x + dx * t - o.x, p.y + dy * t - o.y) < o.r + grow;
  }
  // Into the rectangle's own frame, then a slab clip against its grown half extents.
  const local = (a: Point) => {
    const rx = a.x - o.x;
    const ry = a.y - o.y;
    return { u: rx * o.ux + ry * o.uy, w: -rx * o.uy + ry * o.ux };
  };
  const a = local(p);
  const b = local(q);
  let t0 = 0;
  let t1 = 1;
  const clip = (start: number, delta: number, half: number): boolean => {
    if (Math.abs(delta) < 1e-12) return Math.abs(start) < half;
    let ta = (-half - start) / delta;
    let tb = (half - start) / delta;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta);
    t1 = Math.min(t1, tb);
    return t0 < t1;
  };
  return clip(a.u, b.u - a.u, o.halfAlong + grow) && clip(a.w, b.w - a.w, o.halfAcross + grow);
}

/** Is a point inside the obstacle (grown by the body)? */
function inside(o: Obstacle, p: Point, grow: number): boolean {
  if (o.kind === "circle") return Math.hypot(p.x - o.x, p.y - o.y) < o.r + grow;
  const rx = p.x - o.x;
  const ry = p.y - o.y;
  return Math.abs(rx * o.ux + ry * o.uy) < o.halfAlong + grow && Math.abs(-rx * o.uy + ry * o.ux) < o.halfAcross + grow;
}

/**
 * Is the straight walk from p to q clear? An obstacle that holds either end is ignored — a door step
 * is outside its house, but a person leaving a seat on a bench, or a grave inside the wall, starts
 * where they start — and so is a gated wall whose inside one end is in, which the router handles.
 */
export function clearWalk(g: NavGraph, p: Point, q: Point): boolean {
  for (const o of g.obstacles) {
    if (inside(o, p, NAV.bodyM) || inside(o, q, NAV.bodyM)) continue;
    if (hits(o, p, q, NAV.bodyM)) return false;
  }
  return true;
}

/** The village's graph: built once per plan. */
export function navGraph(plan: VillagePlan): NavGraph {
  const known = memo.get(plan);
  if (known) return known;
  const obstacles: Obstacle[] = [];
  for (const plot of plan.plots) obstacles.push(rect(plot.x, plot.y, plot.facing, plot.depthM / 2 + 0.2, plot.widthM / 2 + 0.2));
  obstacles.push({ kind: "circle", x: plan.centre.x, y: plan.centre.y, r: 1.1 });
  if (plan.mine) {
    const m = plan.mine;
    obstacles.push(rect(m.x - Math.cos(m.heading) * 2.6, m.y - Math.sin(m.heading) * 2.6, m.heading, 1.7, 3.2));
  }
  if (plan.graveyard) {
    const y = plan.graveyard;
    const toGreen = Math.atan2(plan.centre.y - y.y, plan.centre.x - y.x);
    obstacles.push({ kind: "circle", x: y.x, y: y.y, r: y.radiusM, gate: { x: y.x + Math.cos(toGreen) * (y.radiusM + 1.6), y: y.y + Math.sin(toGreen) * (y.radiusM + 1.6) } });
  }

  const nodes: Point[] = [];
  const out = NAV.bodyM + NAV.cornerM;
  for (const o of obstacles) {
    if (o.kind === "rect") {
      for (const [sa, sw] of [[1, 1], [1, -1], [-1, -1], [-1, 1]] as const) {
        const a = sa * (o.halfAlong + out);
        const w = sw * (o.halfAcross + out);
        nodes.push({ x: o.x + o.ux * a - o.uy * w, y: o.y + o.uy * a + o.ux * w });
      }
    } else {
      const n = Math.max(8, Math.ceil((2 * Math.PI * (o.r + out)) / 6));
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        nodes.push({ x: o.x + Math.cos(a) * (o.r + out) / Math.cos(Math.PI / n), y: o.y + Math.sin(a) * (o.r + out) / Math.cos(Math.PI / n) });
      }
      if (o.gate) nodes.push(o.gate);
    }
  }
  // A node that landed inside another obstacle is useless and is dropped.
  const usable = nodes.filter((p) => !obstacles.some((o) => inside(o, p, NAV.bodyM)));
  const g: NavGraph = { obstacles, nodes: usable, adj: usable.map(() => []) };
  for (let i = 0; i < usable.length; i++) {
    for (let j = i + 1; j < usable.length; j++) {
      const d = Math.hypot(usable[i].x - usable[j].x, usable[i].y - usable[j].y);
      if (d > NAV.linkM) continue;
      if (clearWalk(g, usable[i], usable[j])) {
        g.adj[i].push(j);
        g.adj[j].push(i);
      }
    }
  }
  joinIslands(g);
  memo.set(plan, g);
  return g;
}

/**
 * Join the graph into one piece. Links are local ({@link NAV}.linkM), and the mine stands far enough
 * past the houses that its corners and the nearest house's are further apart than that: the first
 * graph had the mine as an island, and a miner walking home found no way and went straight through
 * the village. Each smaller piece is joined to the rest by its shortest clear link, at any length.
 */
function joinIslands(g: NavGraph): void {
  const n = g.nodes.length;
  for (let guard = 0; guard < n; guard++) {
    const piece = new Array<number>(n).fill(-1);
    let pieces = 0;
    for (let i = 0; i < n; i++) {
      if (piece[i] >= 0) continue;
      const stack = [i];
      piece[i] = pieces;
      while (stack.length) {
        const k = stack.pop()!;
        for (const j of g.adj[k]) if (piece[j] < 0) (piece[j] = pieces), stack.push(j);
      }
      pieces++;
    }
    if (pieces <= 1) return;
    // The smallest piece, and its shortest clear link to anything outside it.
    const size = new Array<number>(pieces).fill(0);
    for (const c of piece) size[c]++;
    const small = size.indexOf(Math.min(...size));
    let best: [number, number, number] | null = null;
    for (let i = 0; i < n; i++) {
      if (piece[i] !== small) continue;
      for (let j = 0; j < n; j++) {
        if (piece[j] === small) continue;
        const d = Math.hypot(g.nodes[i].x - g.nodes[j].x, g.nodes[i].y - g.nodes[j].y);
        if ((!best || d < best[2]) && clearWalk(g, g.nodes[i], g.nodes[j])) best = [i, j, d];
      }
    }
    if (!best) return; // walled off entirely; the router walks straight rather than strand anyone
    g.adj[best[0]].push(best[1]);
    g.adj[best[1]].push(best[0]);
  }
}

const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The walled obstacle `p` is inside, if any: the router goes through its gate. */
const walledIn = (g: NavGraph, p: Point): Circle | null => {
  for (const o of g.obstacles) if (o.kind === "circle" && o.gate && inside(o, p, 0)) return o;
  return null;
};

/**
 * The way from `a` to `b`, as the points in between (neither end included): empty when the straight
 * walk is clear. Always returns something walkable as far as the graph knows; when the graph has no
 * way at all it gives up and walks straight, rather than leave a person standing still all day.
 */
export function route(g: NavGraph, a: Point, b: Point): Point[] {
  // Into or out of the graveyard: by its gate.
  const wa = walledIn(g, a);
  const wb = walledIn(g, b);
  if (wa !== wb) {
    if (wb?.gate) return [...route(g, a, wb.gate), wb.gate];
    if (wa?.gate) return [wa.gate, ...route(g, wa.gate, b)];
  }
  if (clearWalk(g, a, b)) return [];

  // A* over the graph, with a and b joined to every node they can see.
  const n = g.nodes.length;
  const A = n;
  const B = n + 1;
  const point = (i: number) => (i === A ? a : i === B ? b : g.nodes[i]);
  // Near nodes first; and when an end is far from every obstacle (a field out past the houses, the
  // mine, the road out) and so has none near it, any node it can see. The first version joined only
  // near ones, found no way to such an end, and walked the person straight through the village.
  const seen = (p: Point, limit: number) => {
    const out: number[] = [];
    for (let i = 0; i < n; i++) if (dist(g.nodes[i], p) <= limit && clearWalk(g, p, g.nodes[i])) out.push(i);
    return out;
  };
  let fromA = seen(a, NAV.linkM);
  if (fromA.length === 0) fromA = seen(a, Infinity);
  let near = seen(b, NAV.linkM);
  if (near.length === 0) near = seen(b, Infinity);
  const toB = new Set(near);
  const neighbours = (i: number): number[] => {
    if (i === A) return fromA;
    const out = [...g.adj[i]];
    if (toB.has(i)) out.push(B);
    return out;
  };
  const best = new Map<number, number>([[A, 0]]);
  const prev = new Map<number, number>();
  const open: { i: number; f: number }[] = [{ i: A, f: dist(a, b) }];
  const closed = new Set<number>();
  while (open.length > 0) {
    let k = 0;
    for (let j = 1; j < open.length; j++) if (open[j].f < open[k].f) k = j;
    const { i } = open.splice(k, 1)[0];
    if (i === B) break;
    if (closed.has(i)) continue;
    closed.add(i);
    for (const j of neighbours(i)) {
      if (closed.has(j)) continue;
      const cost = best.get(i)! + dist(point(i), point(j));
      if (cost < (best.get(j) ?? Infinity)) {
        best.set(j, cost);
        prev.set(j, i);
        open.push({ i: j, f: cost + dist(point(j), b) });
      }
    }
  }
  if (!prev.has(B)) return [];
  const via: Point[] = [];
  for (let i = prev.get(B)!; i !== A; i = prev.get(i)!) via.unshift(g.nodes[i]);
  return via;
}

/** The length of a walk through these points. */
export function pathLength(points: readonly Point[]): number {
  let s = 0;
  for (let i = 1; i < points.length; i++) s += dist(points[i - 1], points[i]);
  return s;
}
