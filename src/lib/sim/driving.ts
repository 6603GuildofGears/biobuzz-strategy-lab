import { dist, len, type Pt } from "./field";
import { freeSpot, pathLength, planPath } from "./nav";
import { accelOf, topSpeed } from "./motion";
import type { MatchState, Robot } from "./state";

/**
 * Steering: how the driver gets the robot to a spot. It follows a planned route around the
 * FIELD elements, swerves around other robots, and backs out when it gets jammed.
 * It only sets the robot's commanded velocity. motion.ts does the physics.
 */

/** Plan a new route this often (seconds), since robots move around. */
const REPLAN_EVERY = 1.2;
/** Commanded speed but barely moving for this long means we're jammed. */
const STUCK_AFTER = 0.7;
/** Within this distance (ft) of its goal, a tank drive slows down and stops trying to line up its heading. */
const TANK_CAREFUL = 1.2;

/**
 * Seconds to drive from the robot to p: route length at top speed, plus the time lost speeding up
 * and slowing down (v/a for a full-speed trip, less for a short hop).
 */
export function travelTime(m: MatchState, r: Robot, p: Pt) {
  const v = topSpeed(m, r);
  const a = accelOf(m, r);
  const len = pathLength(r, p, r.obs);
  return len / v + (v / a) * Math.min(1, (len * a) / (v * v));
}

/**
 * Drive toward `goal`, stopping within `tol` ft. Returns how long the robot has been jammed,
 * so the caller can give up if it's hopeless. `ignore` is a robot not to steer around (a defender's target).
 */
export function driveTo(m: MatchState, r: Robot, goal: Pt, tol: number, ignore?: Robot): number {
  if (!r.pathGoal || dist(r.pathGoal, goal) > 1.2 || m.t - r.pathAt > REPLAN_EVERY) {
    r.path = planPath(r, goal, Math.max(r.hw, r.hl), r.obs);
    r.pathGoal = goal;
    r.pathAt = m.t;
  }
  r.path[r.path.length - 1] = goal;
  while (r.path.length > 1 && dist(r, r.path[0]) < 0.3) r.path.shift();

  let waypoint = r.path[0] ?? goal;
  let remaining = dist(r, waypoint);
  for (let i = 1; i < r.path.length; i++) remaining += dist(r.path[i - 1], r.path[i]);
  if (r.detour) {
    if (m.t < r.detour.until && dist(r, r.detour.p) > 0.2) {
      waypoint = r.detour.p;
      remaining = Math.max(remaining, dist(r, waypoint) + 1);
    } else r.detour = null;
  }

  const d = Math.max(1e-6, dist(r, waypoint));
  let dx = (waypoint.x - r.x) / d;
  let dy = (waypoint.y - r.y) / d;

  // Swerve around robots that are in the way ahead.
  const size = Math.max(r.hw, r.hl);
  let steer = 0;
  for (const o of m.robots) {
    if (o === r || o === ignore) continue;
    const ox = o.x - r.x;
    const oy = o.y - r.y;
    const ahead = ox * dx + oy * dy;
    if (ahead <= 0 || ahead > 2.4 || ahead > remaining + 0.5) continue;
    const side = -ox * dy + oy * dx;
    const clear = size + Math.max(o.hw, o.hl) + 0.1;
    if (Math.abs(side) >= clear) continue;
    steer += (side >= 0 ? -1 : 1) * (1 - ahead / 2.4) * (1 - Math.abs(side) / clear) * 1.4;
  }
  if (steer !== 0) {
    const nx = dx - dy * steer;
    const ny = dy + dx * steer;
    const n = len(nx, ny);
    dx = nx / n;
    dy = ny / n;
  }

  // Go as fast as possible while still being able to brake in time: v = √(2·a·distance).
  const vmax = topSpeed(m, r);
  let speed = Math.min(vmax, Math.sqrt(2 * accelOf(m, r) * Math.max(0, remaining - tol * 0.5)) + 0.25);
  if (r.profile.drivetrain === "tank" && remaining < TANK_CAREFUL) {
    // Close in, a tank creeps and keeps the way it's pointing. It turns to face the right way once it's there.
    speed = Math.min(speed, 0.3 + 1.5 * remaining);
    r.face = null;
  }
  r.cmdx = dx * speed;
  r.cmdy = dy * speed;

  // Jammed? Back off sideways for a moment. (A tank drive turning to face its route isn't jammed.)
  const moving = len(r.vx, r.vy);
  const along = Math.abs(Math.cos(Math.atan2(dy, dx) - r.heading));
  const tankTurning = r.profile.drivetrain === "tank" && along < 0.9;
  if (speed > 0.8 && moving < 0.3 * Math.min(speed, vmax) && !tankTurning) r.stuckTime += m.dt;
  else r.stuckTime = Math.max(0, r.stuckTime - m.dt * 0.5);
  if (r.stuckTime > STUCK_AFTER && !r.detour && !ignore) {
    const s = m.rng() < 0.5 ? -1 : 1;
    r.detour = { p: freeSpot({ x: r.x - dy * s * 1.5 - dx * 0.4, y: r.y + dx * s * 1.5 - dy * 0.4 }, size, r.obs), until: m.t + 1.2 };
    r.pathAt = -Infinity;
  }
  return r.stuckTime;
}

/** Forget the current route (used when a robot starts something new). */
export function resetRoute(r: Robot) {
  r.pathGoal = null;
  r.stuckTime = 0;
  r.detour = null;
}
