import { CENTER, CELL_OPENING_HEIGHT, cellOpening, cellTarget, dist, facesOpening, type Pt } from "./field";
import { ownNectar, type MatchState, type Robot } from "./state";
import { ACCURACY_AT_MAX_RANGE, LAUNCH_HEIGHT, MIN_SHOT_DISTANCE } from "./tuning";
import type { Kind, RobotProfile } from "./types";
import { AUTO_END } from "./rules";

/**
 * Launching physics. A launched ball is a projectile: gravity pulls it down at 32.2 ft/s².
 */
const GRAVITY = 32.2;
/** How far the ball has to climb, from the launcher up to the middle of the CELL opening. */
const RISE = CELL_OPENING_HEIGHT - LAUNCH_HEIGHT;

/**
 * The farthest (ft) a ball launched at `speed` ft/s can be from the CELL and still get up to it,
 * using the best launch angle. From projectile motion, the highest a ball can be at horizontal
 * distance d is  h = v²/2g − g·d²/2v².  Setting h = RISE and solving for d gives the formula below.
 * If the speed is too low to ever climb that high, the answer is 0.
 */
export function physicsReach(speed: number): number {
  const s = speed * speed - 2 * GRAVITY * RISE;
  return s <= 0 ? 0 : (speed / GRAVITY) * Math.sqrt(s);
}

/** The robot's real range: the shorter of what its launcher is built for and what physics allows. */
export const effectiveRange = (p: RobotProfile) => Math.min(p.launchRange, physicsReach(p.shotSpeed));

/**
 * Seconds a shot spends in the air, using the flatter of the two angles that reach the CELL.
 * (Any distance within range can be hit with a high lob or a flatter shot. Robots use the flatter one.)
 */
export function flightTime(d: number, speed: number): number {
  const v2 = speed * speed;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * RISE * v2);
  if (disc < 0) return Infinity;
  const tan = (v2 - Math.sqrt(disc)) / (GRAVITY * d);
  const cos = 1 / Math.sqrt(1 + tan * tan);
  return d / (speed * cos);
}

/** Height (ft) of a shot `tau` seconds after launch, for a shot that takes `total` seconds to arrive. */
export function shotHeight(tau: number, total: number): number {
  const up = (RISE + 0.5 * GRAVITY * total * total) / total;
  return LAUNCH_HEIGHT + up * tau - 0.5 * GRAVITY * tau * tau;
}

/** Chance a shot from distance d goes in. Full accuracy up close, fading to ACCURACY_AT_MAX_RANGE at the longest range. */
export function shotAccuracy(p: RobotProfile, k: Kind, d: number): number {
  const rated = k === "P" ? p.pollenAccuracy : p.nectarAccuracy;
  const range = effectiveRange(p);
  const far = range > MIN_SHOT_DISTANCE ? Math.min(1, Math.max(0, (d - MIN_SHOT_DISTANCE) / (range - MIN_SHOT_DISTANCE))) : 0;
  return rated * (1 - (1 - ACCURACY_AT_MAX_RANGE) * far);
}

/** Can this robot's role launch this element into the HIVE? Never the opponent's NECTAR (G408). */
export const canLaunch = (r: Robot, k: Kind) => k === "P" || (r.role.ammo === "all" && k === ownNectar(r.alliance));

/** Which way the robot must face so its launcher points from `from` at `target`. */
export const launcherHeading = (r: Robot, from: Pt, target: Pt) =>
  Math.atan2(target.y - from.y, target.x - from.x) + (r.profile.shooterOnBack ? Math.PI : 0);

/** Distance from a spot to this robot's upward CELL opening. */
export const shotDistance = (m: MatchState, r: Robot, p: Pt) => dist(p, cellOpening(r.alliance, m.hives[r.alliance].up));

/**
 * Can this robot score from spot p right now? It must be in range, in front of the
 * upward CELL, and during AUTO fully on its own half of the FIELD (G402).
 */
export function canShootFrom(m: MatchState, r: Robot, p: Pt): boolean {
  const d = shotDistance(m, r, p);
  if (d < MIN_SHOT_DISTANCE || d > effectiveRange(r.profile)) return false;
  if (m.t < AUTO_END) {
    const half = Math.max(r.hw, r.hl);
    if (r.alliance === "red" ? p.x + half > CENTER : p.x - half < CENTER) return false;
  }
  return facesOpening(r.alliance, m.hives[r.alliance].up, p);
}

/** Launch one element from where the robot is now. `steadiness` below 1 means the shot is a bit off (after a bump). */
export function launch(m: MatchState, r: Robot, k: Kind, steadiness = 1) {
  const hive = m.hives[r.alliance];
  const d = shotDistance(m, r, r);
  // A defender pushing on the robot throws the shot off.
  const acc = shotAccuracy(r.profile, k, d) * (1 - r.slow) * steadiness;
  const s = m.stats[r.alliance];
  s.shots++;
  s.shotDistance += d;
  m.shots.push({
    k,
    alliance: r.alliance,
    hit: m.rng() < acc,
    from: { x: r.x, y: r.y },
    to: cellTarget(r.alliance, hive.up),
    t0: m.t,
    t1: m.t + flightTime(d, r.profile.shotSpeed),
    end: hive.up,
  });
}
