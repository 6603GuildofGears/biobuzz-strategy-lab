import { atan2, cos, sin } from "./mathx";
import { FIELD, OBSTACLES, angleDiff, len, type Rect } from "./field";
import { AUTO_END } from "./rules";
import type { MatchState, Robot } from "./state";
import { STRAFE_SPEED, TURN_RATE } from "./tuning";

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

/** Half-size of the box the robot covers on the FIELD, which grows when it's turned at an angle. */
export function footprint(r: Robot) {
  const c = Math.abs(cos(r.heading));
  const s = Math.abs(sin(r.heading));
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
        const along = r.cmdx * cos(r.heading) + r.cmdy * sin(r.heading);
        tx = cos(r.heading) * along;
        ty = sin(r.heading) * along;
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

/** Push a robot out of a solid box it overlaps, stopping its motion into the box. */
function pushOut(r: Robot, o: Rect) {
  if (r.x <= o.x0 || r.x >= o.x1 || r.y <= o.y0 || r.y >= o.y1) return;
  const options = [
    { d: r.x - o.x0, axis: "x", to: o.x0 },
    { d: o.x1 - r.x, axis: "x", to: o.x1 },
    { d: r.y - o.y0, axis: "y", to: o.y0 },
    { d: o.y1 - r.y, axis: "y", to: o.y1 },
  ].sort((p, q) => p.d - q.d);
  const e = options[0];
  if (e.axis === "x") {
    r.x = e.to;
    r.vx = 0;
  } else {
    r.y = e.to;
    r.vy = 0;
  }
}

/**
 * Robots can't overlap each other, the FIELD elements, or the walls.
 * When two robots overlap, both get pushed apart. The stronger pusher moves less.
 */
export function collideRobots(m: MatchState) {
  const robots = m.robots;
  // Footprints depend only on heading, which doesn't change here.
  const boxes = robots.map(footprint);
  for (let pass = 0; pass < 3; pass++) {
    for (let i = 0; i < robots.length; i++) {
      for (let j = i + 1; j < robots.length; j++) {
        const a = robots[i];
        const b = robots[j];
        const ea = boxes[i];
        const eb = boxes[j];
        const ox = ea.x + eb.x - Math.abs(b.x - a.x);
        const oy = ea.y + eb.y - Math.abs(b.y - a.y);
        if (ox <= 0 || oy <= 0) continue;
        const pa = a.job?.type === "parked" ? a.push * PARKED_BRAKE : a.push;
        const pb = b.job?.type === "parked" ? b.push * PARKED_BRAKE : b.push;
        const aMoves = pb / (pa + pb);
        const bMoves = 1 - aMoves;
        // Separate along whichever direction they overlap least, and share their speed that way.
        if (ox < oy) {
          const s = b.x >= a.x ? 1 : -1;
          a.x -= s * ox * aMoves;
          b.x += s * ox * bMoves;
          if ((b.vx - a.vx) * s < 0) a.vx = b.vx = (a.push * a.vx + b.push * b.vx) / (a.push + b.push);
        } else {
          const s = b.y >= a.y ? 1 : -1;
          a.y -= s * oy * aMoves;
          b.y += s * oy * bMoves;
          if ((b.vy - a.vy) * s < 0) a.vy = b.vy = (a.push * a.vy + b.push * b.vy) / (a.push + b.push);
        }
      }
    }
    robots.forEach((r, i) => {
      const e = boxes[i];
      for (const o of OBSTACLES) pushOut(r, { x0: o.x0 - e.x, y0: o.y0 - e.y, x1: o.x1 + e.x, y1: o.y1 + e.y });
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
    });
  }
}

/** Rectangle-to-rectangle gap between two robots (0 when touching). */
export function gapBetween(a: Robot, b: Robot) {
  const ea = footprint(a);
  const eb = footprint(b);
  return Math.max(Math.abs(a.x - b.x) - ea.x - eb.x, Math.abs(a.y - b.y) - ea.y - eb.y, 0);
}
