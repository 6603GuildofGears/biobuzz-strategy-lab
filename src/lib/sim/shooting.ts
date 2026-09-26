import { atan2 } from "./mathx";
import { headingTrig } from "./motion";
import { CENTER, CELL_OPENING_HEIGHT, cellOpening, cellTarget, dist, facesOpening, type Pt } from "./field";
import { ownNectar, tossBall, type MatchState, type Robot } from "./state";
import { ACCURACY_AT_MAX_RANGE, LAUNCH_HEIGHT, MIN_SHOT_DISTANCE } from "./tuning";
import type { Kind, RobotProfile } from "./types";
import { AUTO_END, BALL_RADIUS } from "./rules";

/**
 * Launching physics. A launched ball is a projectile: gravity pulls it down at 32.2 ft/s².
 */
const GRAVITY = 32.2;
/** Height (ft) this robot's launcher releases the ball. */
export const launchHeight = (p: RobotProfile) => (p.launchHeightIn ? Math.min(28, Math.max(6, p.launchHeightIn)) / 12 : LAUNCH_HEIGHT);
/** How far the ball has to climb, from a launcher at height h (ft) up to the middle of the CELL opening. */
const riseFrom = (h: number) => CELL_OPENING_HEIGHT - h;

/**
 * The farthest (ft) a ball launched at `speed` ft/s can be from the CELL and still get up to it,
 * using the best launch angle. From projectile motion, the highest a ball can be at horizontal
 * distance d is  h = v²/2g − g·d²/2v².  Setting h = the climb and solving for d gives the formula below.
 * If the speed is too low to ever climb that high, the answer is 0.
 */
export function physicsReach(speed: number, fromHeight = LAUNCH_HEIGHT): number {
  const s = speed * speed - 2 * GRAVITY * riseFrom(fromHeight);
  return s <= 0 ? 0 : (speed / GRAVITY) * Math.sqrt(s);
}

/** The robot's real range: the shorter of what its launcher is built for and what physics allows. */
export const effectiveRange = (p: RobotProfile) => Math.min(p.launchRange, physicsReach(p.shotSpeed, launchHeight(p)));

/**
 * Seconds a shot spends in the air, using the flatter of the two angles that reach the CELL.
 * (Any distance within range can be hit with a high lob or a flatter shot. Robots use the flatter one.)
 */
export function flightTime(d: number, speed: number, fromHeight: number): number {
  const v2 = speed * speed;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * riseFrom(fromHeight) * v2);
  if (disc < 0) return Infinity;
  const tan = (v2 - Math.sqrt(disc)) / (GRAVITY * d);
  const cos = 1 / Math.sqrt(1 + tan * tan);
  return d / (speed * cos);
}

/** Height (ft) of a shot `tau` seconds after launch from height h0, for a shot that takes `total` seconds to arrive. */
export function shotHeight(tau: number, total: number, h0: number): number {
  const up = (riseFrom(h0) + 0.5 * GRAVITY * total * total) / total;
  return h0 + up * tau - 0.5 * GRAVITY * tau * tau;
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
  atan2(target.y - from.y, target.x - from.x) + (r.profile.shooterOnBack ? Math.PI : 0);

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

/**
 * Shot blocking. A shot leaves the launcher (Launcher height, about 14 in for most robots) and climbs
 * steeply toward the CELL, so it's only low enough to hit another robot in its first foot or so.
 * A robot standing right in front of the launcher, as tall as the rules allow (29 in), is in the
 * ball's path, and knocks a share of those shots down (Blocked shot slider). A taller launcher
 * clears a defender sooner. Returns the robot in the way, or null if the path is clear.
 * `opponentsOnly` ignores teammates (they talk to each other and move out of the way).
 */
export function blockerOf(m: MatchState, r: Robot, from: Pt, opponentsOnly = false): Robot | null {
  const opening = cellOpening(r.alliance, m.hives[r.alliance].up);
  const total = dist(from, opening);
  const d = total - r.hl; // from the launcher (front edge of the frame) to the opening
  if (d <= 0.1) return null;
  const ux = (opening.x - from.x) / total;
  const uy = (opening.y - from.y) / total;
  // The flatter of the two arcs that reach the CELL: height(s) = h0 + s·tan − drop·s².
  const h0 = launchHeight(r.profile);
  const v2 = r.profile.shotSpeed * r.profile.shotSpeed;
  const disc = v2 * v2 - GRAVITY * (GRAVITY * d * d + 2 * riseFrom(h0) * v2);
  if (disc < 0) return null;
  const tan = (v2 - Math.sqrt(disc)) / (GRAVITY * d);
  const drop = (GRAVITY * (1 + tan * tan)) / (2 * v2);
  const ball = BALL_RADIUS.R;
  for (const o of m.robots) {
    if (o === r || o.height + ball <= h0 || (opponentsOnly && o.alliance === r.alliance)) continue;
    if (dist(o, from) > r.hl + 2.5 + Math.max(o.hw, o.hl)) continue; // too far away to matter
    const { c, s } = headingTrig(o);
    for (let t = 0; t <= d; t += 0.05) {
      if (h0 + t * tan - drop * t * t > o.height + ball) break; // above this robot from here on
      const dx = from.x + ux * (r.hl + t) - o.x;
      const dy = from.y + uy * (r.hl + t) - o.y;
      if (Math.abs(dx * c + dy * s) <= o.hl + ball && Math.abs(-dx * s + dy * c) <= o.hw + ball) return o;
    }
  }
  return null;
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
  const h0 = launchHeight(r.profile);
  // Only opponents: drivers don't fire into their own partner.
  const blocker = blockerOf(m, r, r, true);
  if (blocker && m.rng() < m.settings.blockChance) {
    // Knocked down: it glances off the blocker and bounces away to one side, not straight back into the shooter's intake.
    s.blocked++;
    const back = atan2(r.y - blocker.y, r.x - blocker.x);
    const side = (m.rng() < 0.5 ? -1 : 1) * (1.1 + m.rng() * 0.6);
    const at = { x: r.x + (blocker.x - r.x) * 0.5, y: r.y + (blocker.y - r.y) * 0.5 };
    tossBall(m, k, at, Math.min(blocker.height, h0 + 0.5), 2, 4, back + side);
    return;
  }
  m.shots.push({
    k,
    alliance: r.alliance,
    hit: m.rng() < acc,
    from: { x: r.x, y: r.y },
    to: cellTarget(r.alliance, hive.up),
    t0: m.t,
    t1: m.t + flightTime(d, r.profile.shotSpeed, h0),
    end: hive.up,
    h0,
  });
}
