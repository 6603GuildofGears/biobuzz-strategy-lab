import { atan2 } from "./mathx";
import { driveTo } from "./driving";
import { cellOpening, dist, len, type Pt } from "./field";
import { againstSolid, gapBetween } from "./motion";
import { freeSpot } from "./nav";
import { PIN_LIMIT, POINTS, TELEOP_START } from "./rules";
import { canLaunch, effectiveRange } from "./shooting";
import { log, opponent, type Job, type MatchState, type Robot } from "./state";
import { CONTACT_GAP, DEFENDER_REACTION, DEFENSE_COMMIT, MIN_SHOT_DISTANCE, PIN_BACK_OFF, PIN_RESET_GAP, PIN_RESET_TIME } from "./tuning";

/**
 * Defense, all in one place.
 *
 * A shot climbs steeply, so it's only low enough to block in the first foot or so after it leaves
 * the launcher. The rules let a robot extend to 29 in (R105), so a tall defender pressed against the
 * front of a shooter, between it and the CELL, can knock its shots down (shooting.ts, blockerOf).
 * Shooters hold fire when someone is in the way and look for another spot, so the defender follows.
 *
 * The defender reads where each opponent is headed to shoot and tries to get there first. With nobody
 * coming, it waits in the middle of the opponent's shooting area. Being pushed also slows a robot
 * down and throws its aim off (defenseEffect on the Game tab).
 *
 * The catch is G421: holding a robot still for more than 3 s is a PIN, a 20-point MAJOR FOUL,
 * plus another every 3 s. So the defender backs off before the count reaches 3.
 */

/** The opponent's shooting area: in front of their upward CELL, about halfway out their robots' range. */
export function guardSpot(m: MatchState, r: Robot): Pt {
  const them = opponent(r.alliance);
  const up = m.hives[them].up;
  const opening = cellOpening(them, up);
  const out = up === "north" ? 1 : -1;
  const size = Math.max(r.hw, r.hl);
  const ranges = m.robots.filter((o) => o.alliance === them && !o.role.defend).map((o) => effectiveRange(o.profile));
  const reach = ranges.length > 0 ? Math.min(...ranges) : 3;
  const along = Math.max(MIN_SHOT_DISTANCE + 0.3 + size, (MIN_SHOT_DISTANCE + reach) / 2);
  return freeSpot({ x: opening.x, y: opening.y + out * along }, size, r.obs);
}

/** Where opponent o is going to shoot from, if it's on its way to shoot (or already there). */
function shootingSpotOf(o: Robot): Pt | null {
  if (o.job?.type !== "shoot") return null;
  return o.job.aimedAt || dist(o, o.job.spot) < 1 ? { x: o.x, y: o.y } : o.job.spot;
}

/** Opponents worth guarding: carrying something they can shoot, and playing the HIVE. */
function threats(m: MatchState, r: Robot) {
  return m.robots.filter((o) => {
    if (o.alliance === r.alliance || o.role.defend) return false;
    const job = o.job?.type;
    if (job === "park" || job === "parked" || job === "flower" || job === "defend") return false;
    return o.held.some((k) => canLaunch(o, k));
  });
}

/** The brain's choice for a defender: the opponent that will shoot soonest, or nobody (guard the area). */
export function chooseDefenseJob(m: MatchState, r: Robot): Job {
  const guard = guardSpot(m, r);
  let target: Robot | null = null;
  let soonest = Infinity;
  for (const o of threats(m, r)) {
    // Seconds until it fires, roughly. Robots already headed to shoot come first.
    const spot = shootingSpotOf(o);
    const eta = spot ? dist(o, spot) / o.profile.driveSpeed : 3 + dist(o, guard) / o.profile.driveSpeed;
    if (eta - o.held.length * 0.1 < soonest) {
      soonest = eta - o.held.length * 0.1;
      target = o;
    }
  }
  return { type: "defend", target, until: m.t + (target ? DEFENSE_COMMIT : 0.5), guard: null, guardAt: -Infinity };
}

/**
 * Where to stand to block `target`: right in front of its launcher, on the line to the CELL.
 * If it isn't headed to shoot yet, wait in the shooting area.
 */
function blockSpot(m: MatchState, r: Robot, target: Robot | null): Pt {
  const spot = target && shootingSpotOf(target);
  if (!target || !spot) return guardSpot(m, r);
  const opening = cellOpening(target.alliance, m.hives[target.alliance].up);
  const d = Math.max(0.01, dist(spot, opening));
  const gap = target.hl + r.hl + 0.08;
  const p = { x: spot.x + ((opening.x - spot.x) / d) * gap, y: spot.y + ((opening.y - spot.y) / d) * gap };
  return freeSpot(p, Math.max(r.hw, r.hl), r.obs);
}

/** Carry out a defend job for one step. Returns true when the job is over. */
export function runDefense(m: MatchState, r: Robot, job: Extract<Job, { type: "defend" }>): boolean {
  const target = job.target;
  if (m.t >= job.until || target?.job?.type === "park" || target?.job?.type === "parked") return true;
  // Drivers react a moment late, so the spot only updates every DEFENDER_REACTION seconds.
  if (!job.guard || m.t - job.guardAt >= DEFENDER_REACTION) {
    job.guard = blockSpot(m, r, target);
    job.guardAt = m.t;
  }
  // Face the robot being blocked, so the whole width of the frame (and its blocker) is in the way.
  r.face = target ? atan2(target.y - r.y, target.x - r.x) : null;
  if (dist(r, job.guard) > 0.08) driveTo(m, r, job.guard, 0.08, target ?? undefined);
  return false;
}

/**
 * Is `p` PINNING `v` right now (G421)? `v` is trapped: it's pressed against a wall or FIELD element,
 * trying to drive out past `p`, and can't move. And `p` is pushing on it (driving into it, or a
 * defender holding its ground on it). In the open a robot can just turn aside, so that isn't a PIN.
 */
function pinning(p: Robot, v: Robot, gap: number): boolean {
  if (gap >= 0.1 || len(v.vx, v.vy) >= 0.5 || !againstSolid(v)) return false;
  const d = Math.max(0.01, dist(p, v));
  const vWant = len(v.cmdx, v.cmdy);
  const vInto = (p.x - v.x) * v.cmdx + (p.y - v.y) * v.cmdy > 0.5 * vWant * d;
  if (vWant <= 1 || !vInto) return false;
  if (p.job?.type === "defend" && p.job.target === v) return true;
  const pWant = len(p.cmdx, p.cmdy);
  return pWant > 0.3 && (v.x - p.x) * p.cmdx + (v.y - p.y) * p.cmdy > 0.3 * pWant * d;
}

/**
 * A robot whose PIN count is getting close to 3 s backs off 2 ft so the count can reset, whatever it
 * was doing (defending, or just shoving to get somewhere). Returns true while it's backing off.
 */
export function backOff(m: MatchState, r: Robot): boolean {
  const v = r.pinVictim;
  if (!v) return false;
  if (r.pinTime > PIN_BACK_OFF) r.backOffUntil = m.t + PIN_RESET_TIME + 0.3;
  if (m.t >= r.backOffUntil) return false;
  const size = Math.max(r.hw, r.hl);
  const d = Math.max(0.01, dist(r, v));
  const away = PIN_RESET_GAP + size + Math.max(v.hw, v.hl) + 0.4;
  const spot = { x: v.x + ((r.x - v.x) / d) * away, y: v.y + ((r.y - v.y) / d) * away };
  driveTo(m, r, freeSpot(spot, size, r.obs), 0.3, v);
  return true;
}

/** Each step: work out who a defender is slowing down, and run the G421 PIN count for every robot. */
export function applyDefense(m: MatchState) {
  for (const r of m.robots) r.slow = 0;
  if (m.t < TELEOP_START) return;
  for (const d of m.robots) {
    if (d.job?.type !== "defend" || !d.job.target) continue;
    const target = d.job.target;
    if (gapBetween(d, target) < CONTACT_GAP && target.job?.type !== "parked") {
      // A heavier, grippier defender pushes harder.
      const leverage = Math.min(1.5, Math.max(0.5, d.push / target.push));
      target.slow = Math.max(target.slow, Math.min(0.9, m.settings.defenseEffect * leverage));
    }
  }

  for (const p of m.robots) {
    for (const v of m.robots) {
      if (v.alliance === p.alliance) continue;
      const gap = gapBetween(p, v);
      // Both trapped and shoving each other: neither is pinning the other (G421.C).
      if (!pinning(p, v, gap) || pinning(v, p, gap)) continue;
      if (p.pinVictim !== v || !p.pinFrom) {
        p.pinVictim = v;
        p.pinFrom = { target: { x: v.x, y: v.y }, defender: { x: p.x, y: p.y } };
        p.pinTime = 0;
        p.apartTime = 0;
      }
      p.pinTime += m.dt;
    }
    const v = p.pinVictim;
    if (!v || !p.pinFrom) continue;
    // The count ends once the robots have been 2 ft apart for 3 s (G421.A), or either robot has been
    // 2 ft from where the PIN started for 3 s (G421.B).
    const moved = dist(v, p.pinFrom.target) >= PIN_RESET_GAP || dist(p, p.pinFrom.defender) >= PIN_RESET_GAP;
    if (gapBetween(p, v) >= PIN_RESET_GAP || moved) {
      p.apartTime += m.dt;
      if (p.apartTime >= PIN_RESET_TIME) {
        p.pinTime = 0;
        p.pinFrom = null;
        p.pinVictim = null;
      }
    } else p.apartTime = 0;
    if (p.pinTime >= PIN_LIMIT) {
      p.pinTime -= PIN_LIMIT;
      m.foulCredit[v.alliance] += POINTS.majorFoul;
      m.stats[p.alliance].fouls++;
      log(m, p.alliance, `MAJOR FOUL: PIN over 3 s (+${POINTS.majorFoul} to ${v.alliance})`);
    }
  }
}
