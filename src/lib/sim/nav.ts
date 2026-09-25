import { FIELD, OBSTACLES, dist, inflate, type Pt, type Rect } from "./field";

/**
 * Route planning. The trick: grow every obstacle by the robot's half size. Then the robot
 * can be treated as a single point, and a route is clear if the straight line misses
 * every grown obstacle.
 */

const EPS = 1e-3;

/** True if the segment a→b passes through the inside of `r`. */
export function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  // Quick reject: the segment's bounding box doesn't even touch the rectangle.
  if (Math.max(a.x, b.x) <= r.x0 || Math.min(a.x, b.x) >= r.x1 || Math.max(a.y, b.y) <= r.y0 || Math.min(a.y, b.y) >= r.y1) return false;
  const x0 = r.x0 + EPS;
  const y0 = r.y0 + EPS;
  const x1 = r.x1 - EPS;
  const y1 = r.y1 - EPS;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
  // Clip the segment against each side of the box (Liang–Barsky).
  const clip = (p: number, q: number) => {
    if (Math.abs(p) < 1e-12) return q >= 0;
    const t = q / p;
    if (p < 0) {
      if (t > t1) return false;
      if (t > t0) t0 = t;
    } else {
      if (t < t0) return false;
      if (t < t1) t1 = t;
    }
    return true;
  };
  return clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y) && t0 < t1;
}

export const insideRect = (p: Pt, r: Rect) => p.x > r.x0 && p.x < r.x1 && p.y > r.y0 && p.y < r.y1;

/** Obstacles grown by the robot's half size. */
export const inflatedObstacles = (half: number): Rect[] => OBSTACLES.map((o) => inflate(o, half + 0.03));

const blocked = (a: Pt, b: Pt, obs: Rect[]) => obs.some((r) => segHitsRect(a, b, r));

/** Move a target to the nearest place a robot of this half size can actually sit. */
export function freeSpot(p: Pt, half: number, obs: Rect[]): Pt {
  let x = Math.min(FIELD - half, Math.max(half, p.x));
  let y = Math.min(FIELD - half, Math.max(half, p.y));
  for (let pass = 0; pass < 2; pass++) {
    for (const r of obs) {
      if (!insideRect({ x, y }, r)) continue;
      const options = [
        { d: x - r.x0, x: r.x0 - 0.02, y },
        { d: r.x1 - x, x: r.x1 + 0.02, y },
        { d: y - r.y0, x, y: r.y0 - 0.02 },
        { d: r.y1 - y, x, y: r.y1 + 0.02 },
      ].filter((o) => o.x >= half && o.x <= FIELD - half && o.y >= half && o.y <= FIELD - half);
      options.sort((a, b) => a.d - b.d);
      if (options[0]) ({ x, y } = options[0]);
    }
  }
  return { x, y };
}

/** Obstacle corners, and the straight-line distance between every pair of corners that can see each other. */
interface CornerGraph {
  corners: Pt[];
  links: number[][];
}
/** The obstacles never move, so each robot's corner graph is built once and reused. */
const cornerGraphs = new WeakMap<Rect[], CornerGraph>();

function cornerGraph(half: number, obs: Rect[]): CornerGraph {
  const cached = cornerGraphs.get(obs);
  if (cached) return cached;
  const corners: Pt[] = [];
  for (const r of obs) {
    for (const c of [
      { x: r.x0 - 0.05, y: r.y0 - 0.05 },
      { x: r.x1 + 0.05, y: r.y0 - 0.05 },
      { x: r.x1 + 0.05, y: r.y1 + 0.05 },
      { x: r.x0 - 0.05, y: r.y1 + 0.05 },
    ]) {
      if (c.x < half || c.x > FIELD - half || c.y < half || c.y > FIELD - half) continue;
      if (obs.some((o) => insideRect(c, o))) continue;
      corners.push(c);
    }
  }
  const links = corners.map((a) => corners.map((b) => (a === b || blocked(a, b, obs) ? Infinity : dist(a, b))));
  const graph = { corners, links };
  cornerGraphs.set(obs, graph);
  return graph;
}

/**
 * Shortest route from `from` to `to` around the obstacles. The only places a shortest route
 * ever bends are obstacle corners, so we search a graph of corners (Dijkstra's algorithm).
 * Returns the waypoints after `from`.
 */
export function planPath(from: Pt, to: Pt, half: number, obs: Rect[]): Pt[] {
  if (!blocked(from, to, obs)) return [to];
  const { corners, links } = cornerGraph(half, obs);
  const n = corners.length;
  const toGoal = corners.map((c) => (blocked(c, to, obs) ? Infinity : dist(c, to)));
  const best = corners.map((c) => (blocked(from, c, obs) ? Infinity : dist(from, c)));
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  let finish = -1;
  let finishCost = Infinity;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || best[u] === Infinity || best[u] >= finishCost) break;
    done[u] = true;
    if (best[u] + toGoal[u] < finishCost) {
      finishCost = best[u] + toGoal[u];
      finish = u;
    }
    for (let v = 0; v < n; v++) {
      const w = best[u] + links[u][v];
      if (!done[v] && w < best[v]) {
        best[v] = w;
        prev[v] = u;
      }
    }
  }
  if (finish < 0) return [to];
  const path: Pt[] = [to];
  for (let v = finish; v >= 0; v = prev[v]) path.unshift(corners[v]);
  return path;
}

/** Quick route-length estimate for planning decisions: straight line, or around one obstacle. */
export function pathLength(from: Pt, to: Pt, obs: Rect[]): number {
  const direct = dist(from, to);
  const hit = obs.find((r) => segHitsRect(from, to, r));
  if (!hit) return direct;
  const corners = [
    { x: hit.x0, y: hit.y0 },
    { x: hit.x1, y: hit.y0 },
    { x: hit.x1, y: hit.y1 },
    { x: hit.x0, y: hit.y1 },
  ];
  let best = Infinity;
  for (const c of corners) best = Math.min(best, dist(from, c) + dist(c, to));
  for (let i = 0; i < 4; i++) {
    const a = corners[i];
    const b = corners[(i + 1) % 4];
    best = Math.min(best, dist(from, a) + dist(a, b) + dist(b, to), dist(from, b) + dist(b, a) + dist(a, to));
  }
  return Math.max(direct, Math.min(best, direct * 3));
}
