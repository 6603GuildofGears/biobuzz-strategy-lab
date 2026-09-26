import { atan2, cos, sin } from "./mathx";
import { CENTER, FIELD, OBSTACLES, angleDiff, len, type Rect } from "./field";
import { AUTO_END } from "./rules";
import type { MatchState, Robot } from "./state";
import { INTAKE_DEPTH, STRAFE_SPEED, TURN_RATE } from "./tuning";

/**
 * Robot physics: how a robot actually moves once the driver has said where to go
 * (cmdx, cmdy) and which way to face (face). Drivetrains differ:
 *   - mecanum and swerve can drive in any direction while turning (mecanum is slower sideways)
 *   - tank can only drive the way it's pointing, so it has to turn first
 */

/** A parked robot holds its brakes, so it is much harder to push. */
const PARKED_BRAKE = 40;

const inAuto = (m: MatchState) => m.t < AUTO_END;

export const topSpeed = (m: MatchState, r: Robot) =>
  Math.max(0.3, r.profile.driveSpeed * (inAuto(m) ? r.profile.autoSpeed : 1) * (1 - r.slow));
export const accelOf = (m: MatchState, r: Robot) => Math.max(0.5, r.profile.acceleration * (inAuto(m) ? r.profile.autoSpeed : 1));
export const turnRateOf = (m: MatchState, r: Robot) =>
  ((TURN_RATE[r.profile.drivetrain] * Math.PI) / 180) * (inAuto(m) ? r.profile.autoSpeed : 1);

/** Fastest (ft/s) the robot can drive over a ball and still pull it in. */
export const intakeSpeed = (m: MatchState, r: Robot) =>
  Math.min(topSpeed(m, r), Math.max(0.8, (INTAKE_DEPTH / r.profile.intakeTime) * (inAuto(m) ? r.profile.autoSpeed : 1) * (1 - r.slow)));

/** cos and sin of the robot's heading. They're needed many times a step, so they're worked out once per heading. */
export function headingTrig(r: Robot) {
  if (r.trig.h !== r.heading) r.trig = { h: r.heading, c: cos(r.heading), s: sin(r.heading) };
  return r.trig;
}

/** Half-size of the box the robot covers on the FIELD, which grows when it's turned at an angle. */
export function footprint(r: Robot) {
  const t = headingTrig(r);
  const c = Math.abs(t.c);
  const s = Math.abs(t.s);
  return { x: c * r.hl + s * r.hw, y: s * r.hl + c * r.hw };
}

function turnToward(m: MatchState, r: Robot, target: number) {
  const step = turnRateOf(m, r) * m.dt;
  const d = angleDiff(target, r.heading);
  r.heading += Math.abs(d) <= step ? d : Math.sign(d) * step;
}

export function moveRobots(m: MatchState) {
  for (const r of m.robots) {
    const want = len(r.cmdx, r.cmdy);
    let tx = r.cmdx;
    let ty = r.cmdy;
    if (r.profile.drivetrain === "tank") {
      if (want > 0.05) {
        // Drive forward or backward, whichever needs less turning (and ends facing the right way).
        const travel = atan2(r.cmdy, r.cmdx);
        const ref = r.face ?? r.heading;
        const heading = Math.abs(angleDiff(travel, ref)) <= Math.PI / 2 ? travel : travel + Math.PI;
        turnToward(m, r, heading);
        // It can only move along its length: keep just the part of the command that points that way.
        const { c, s } = headingTrig(r);
        const along = r.cmdx * c + r.cmdy * s;
        tx = c * along;
        ty = s * along;
      } else if (r.face !== null) turnToward(m, r, r.face);
    } else {
      if (r.face !== null) turnToward(m, r, r.face);
      else if (want > 0.3) turnToward(m, r, atan2(r.cmdy, r.cmdx));
      if (want > 0.05) {
        const sideways = Math.abs(sin(atan2(r.cmdy, r.cmdx) - r.heading));
        const scale = 1 - (1 - STRAFE_SPEED[r.profile.drivetrain]) * sideways;
        tx *= scale;
        ty *= scale;
      }
    }
    // Speed changes by at most `acceleration` per second.
    const maxChange = accelOf(m, r) * m.dt;
    let ax = tx - r.vx;
    let ay = ty - r.vy;
    const change = len(ax, ay);
    if (change > maxChange) {
      ax *= maxChange / change;
      ay *= maxChange / change;
    }
    r.vx += ax;
    r.vy += ay;
    r.x += r.vx * m.dt;
    r.y += r.vy * m.dt;
  }
}

/**
 * A rectangle that can be turned: center, direction of its length (c, s) = (cos, sin), and half
 * length / half width. Robots are boxes turned to their heading; FIELD elements are unturned boxes.
 */
export interface Box {
  x: number;
  y: number;
  c: number;
  s: number;
  hl: number;
  hw: number;
}

export const robotBox = (r: Robot): Box => ({ x: r.x, y: r.y, c: headingTrig(r).c, s: headingTrig(r).s, hl: r.hl, hw: r.hw });
export const rectBox = (o: Rect): Box => ({ x: (o.x0 + o.x1) / 2, y: (o.y0 + o.y1) / 2, c: 1, s: 0, hl: (o.x1 - o.x0) / 2, hw: (o.y1 - o.y0) / 2 });

/** How far box b reaches from its center along the unit direction (ax, ay). */
const reach = (b: Box, ax: number, ay: number) => b.hl * Math.abs(b.c * ax + b.s * ay) + b.hw * Math.abs(-b.s * ax + b.c * ay);

/**
 * Separating axis test: two boxes overlap only if they overlap along all four of their edge
 * directions. Returns how deep they overlap along the shallowest of those, and that direction
 * (pointing from a to b), or null if they don't overlap. `gap` is the distance between them along
 * the direction that separates them most (0 if they overlap).
 */
export function boxContact(a: Box, b: Box): { depth: number; nx: number; ny: number; gap: number } {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  let depth = Infinity;
  let nx = 0;
  let ny = 0;
  let gap = 0;
  for (let k = 0; k < 4; k++) {
    const ax = k === 0 ? a.c : k === 1 ? -a.s : k === 2 ? b.c : -b.s;
    const ay = k === 0 ? a.s : k === 1 ? a.c : k === 2 ? b.s : b.c;
    const d = dx * ax + dy * ay;
    const overlap = reach(a, ax, ay) + reach(b, ax, ay) - Math.abs(d);
    gap = Math.max(gap, -overlap);
    if (overlap < depth) {
      depth = overlap;
      nx = d >= 0 ? ax : -ax;
      ny = d >= 0 ? ay : -ay;
    }
  }
  return { depth, nx, ny, gap };
}

const SOLIDS = OBSTACLES.map(rectBox);

/** Quick check before the exact one: do the field-aligned boxes around them (half sizes ea, eb) come within `pad`? */
const near = (ax: number, ay: number, ea: { x: number; y: number }, bx: number, by: number, bw: number, bh: number, pad = 0) =>
  Math.abs(bx - ax) < ea.x + bw + pad && Math.abs(by - ay) < ea.y + bh + pad;

/**
 * Robots can't overlap each other, the FIELD elements, or the walls. Robots are turned boxes, so a
 * robot at an angle only takes up the room its frame really does.
 * When two robots overlap, both get pushed apart. The stronger pusher moves less.
 */
export function collideRobots(m: MatchState) {
  const robots = m.robots;
  // Footprints depend only on heading, which doesn't change here.
  const extents = robots.map(footprint);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < robots.length; i++) {
      for (let j = i + 1; j < robots.length; j++) {
        const a = robots[i];
        const b = robots[j];
        if (!near(a.x, a.y, extents[i], b.x, b.y, extents[j].x, extents[j].y)) continue;
        const hit = boxContact(robotBox(a), robotBox(b));
        if (hit.depth <= 0) continue;
        const pa = a.job?.type === "parked" ? a.push * PARKED_BRAKE : a.push;
        const pb = b.job?.type === "parked" ? b.push * PARKED_BRAKE : b.push;
        const aMoves = pb / (pa + pb);
        const bMoves = 1 - aMoves;
        // Separate along the shallowest overlap, and share their speed that way if they're closing.
        a.x -= hit.nx * hit.depth * aMoves;
        a.y -= hit.ny * hit.depth * aMoves;
        b.x += hit.nx * hit.depth * bMoves;
        b.y += hit.ny * hit.depth * bMoves;
        const va = a.vx * hit.nx + a.vy * hit.ny;
        const vb = b.vx * hit.nx + b.vy * hit.ny;
        if (vb - va < 0) {
          const shared = (a.push * va + b.push * vb) / (a.push + b.push);
          a.vx += (shared - va) * hit.nx;
          a.vy += (shared - va) * hit.ny;
          b.vx += (shared - vb) * hit.nx;
          b.vy += (shared - vb) * hit.ny;
        }
      }
    }
    robots.forEach((r, i) => {
      const e = extents[i];
      for (const o of SOLIDS) {
        if (!near(r.x, r.y, e, o.x, o.y, o.hl, o.hw)) continue;
        const hit = boxContact(robotBox(r), o);
        if (hit.depth <= 0) continue;
        r.x -= hit.nx * hit.depth;
        r.y -= hit.ny * hit.depth;
        // Stop its motion into the element.
        const into = r.vx * hit.nx + r.vy * hit.ny;
        if (into > 0) {
          r.vx -= into * hit.nx;
          r.vy -= into * hit.ny;
        }
      }
      // Walls: stop the robot at the wall and cancel any speed into it.
      if (r.x < e.x) {
        r.x = e.x;
        r.vx = Math.max(0, r.vx);
      }
      if (r.x > FIELD - e.x) {
        r.x = FIELD - e.x;
        r.vx = Math.min(0, r.vx);
      }
      if (r.y < e.y) {
        r.y = e.y;
        r.vy = Math.max(0, r.vy);
      }
      if (r.y > FIELD - e.y) {
        r.y = FIELD - e.y;
        r.vy = Math.min(0, r.vy);
      }
      // AUTO programs keep the robot on its own half (G402), so the center line acts like a wall.
      if (inAuto(m)) {
        if (r.alliance === "red" && r.x > CENTER - e.x) {
          r.x = CENTER - e.x;
          r.vx = Math.min(0, r.vx);
        }
        if (r.alliance === "blue" && r.x < CENTER + e.x) {
          r.x = CENTER + e.x;
          r.vx = Math.max(0, r.vx);
        }
      }
    });
  }
}

/** Is the robot pressed against a wall, the HIVE frame or a FLOWER? */
export function againstSolid(r: Robot) {
  const e = footprint(r);
  const margin = 0.05;
  if (r.x - e.x < margin || r.x + e.x > FIELD - margin || r.y - e.y < margin || r.y + e.y > FIELD - margin) return true;
  const box = robotBox(r);
  return SOLIDS.some((o) => near(r.x, r.y, e, o.x, o.y, o.hl, o.hw, margin) && boxContact(box, o).gap < margin);
}

/** Gap between two robots' frames (0 when touching). */
export function gapBetween(a: Robot, b: Robot) {
  // Far apart? The gap between their field-aligned boxes is close enough (and never more than the real gap).
  const ea = footprint(a);
  const eb = footprint(b);
  const rough = Math.max(Math.abs(a.x - b.x) - ea.x - eb.x, Math.abs(a.y - b.y) - ea.y - eb.y);
  return rough > 2.5 ? rough : boxContact(robotBox(a), robotBox(b)).gap;
}
