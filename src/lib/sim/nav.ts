import { FIELD, OBSTACLES, dist, inflate, type Pt, type Rect } from "./field";

const EPS = 1e-3;

/** True if segment a→b passes through the interior of `r`. */
export function segHitsRect(a: Pt, b: Pt, r: Rect): boolean {
  const x0 = r.x0 + EPS;
  const y0 = r.y0 + EPS;
  const x1 = r.x1 - EPS;
  const y1 = r.y1 - EPS;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let t0 = 0;
  let t1 = 1;
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

/** Obstacles grown by the robot's half extents, so the robot can be treated as a point. */
export const inflatedObstacles = (hw: number, hl: number): Rect[] => OBSTACLES.map((o) => inflate(o, hw + 0.03, hl + 0.03));

/** Nudge a target so a robot with these half extents can actually sit there. */
export function freeSpot(p: Pt, hw: number, hl: number, obs: Rect[]): Pt {
  let x = Math.min(FIELD - hw, Math.max(hw, p.x));
  let y = Math.min(FIELD - hl, Math.max(hl, p.y));
  for (let pass = 0; pass < 2; pass++) {
    for (const r of obs) {
      if (!insideRect({ x, y }, r)) continue;
      const opts = [
        { d: x - r.x0, x: r.x0 - 0.02, y },
        { d: r.x1 - x, x: r.x1 + 0.02, y },
        { d: y - r.y0, x, y: r.y0 - 0.02 },
        { d: r.y1 - y, x, y: r.y1 + 0.02 },
      ].filter((o) => o.x >= hw && o.x <= FIELD - hw && o.y >= hl && o.y <= FIELD - hl);
      opts.sort((a, b) => a.d - b.d);
      if (opts[0]) {
        x = opts[0].x;
        y = opts[0].y;
      }
    }
  }
  return { x, y };
}

const blocked = (a: Pt, b: Pt, obs: Rect[]) => obs.some((r) => segHitsRect(a, b, r));

/**
 * Shortest route from `from` to `to` around the (inflated) obstacles, using a
 * visibility graph over obstacle corners. Returns the waypoints after `from`.
 */
export function planPath(from: Pt, to: Pt, hw: number, hl: number, obs: Rect[]): Pt[] {
  if (!blocked(from, to, obs)) return [to];
  const nodes: Pt[] = [from, to];
  for (const r of obs) {
    for (const c of [
      { x: r.x0 - 0.05, y: r.y0 - 0.05 },
      { x: r.x1 + 0.05, y: r.y0 - 0.05 },
      { x: r.x1 + 0.05, y: r.y1 + 0.05 },
      { x: r.x0 - 0.05, y: r.y1 + 0.05 },
    ]) {
      if (c.x < hw || c.x > FIELD - hw || c.y < hl || c.y > FIELD - hl) continue;
      if (obs.some((o) => insideRect(c, o))) continue;
      nodes.push(c);
    }
  }
  const n = nodes.length;
  const best = new Array<number>(n).fill(Infinity);
  const prev = new Array<number>(n).fill(-1);
  const done = new Array<boolean>(n).fill(false);
  best[0] = 0;
  for (let it = 0; it < n; it++) {
    let u = -1;
    for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || best[i] < best[u])) u = i;
    if (u < 0 || best[u] === Infinity) break;
    if (u === 1) break;
    done[u] = true;
    for (let v = 0; v < n; v++) {
      if (done[v] || v === u) continue;
      const w = best[u] + dist(nodes[u], nodes[v]);
      if (w >= best[v]) continue;
      if (blocked(nodes[u], nodes[v], obs)) continue;
      best[v] = w;
      prev[v] = u;
    }
  }
  if (prev[1] < 0) return [to];
  const path: Pt[] = [];
  for (let v = 1; v !== 0 && v >= 0; v = prev[v]) path.unshift(nodes[v]);
  return path;
}

/** Cheap path-length estimate for planning decisions (one corner detour at most). */
export function pathLength(from: Pt, to: Pt, obs: Rect[]): number {
  const direct = dist(from, to);
  let hit: Rect | null = null;
  for (const r of obs) {
    if (segHitsRect(from, to, r)) {
      hit = r;
      break;
    }
  }
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
