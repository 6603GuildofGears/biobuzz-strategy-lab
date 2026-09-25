import { driveTo } from "./driving";
import { cellOpening, dist, len, type Pt } from "./field";
import { gapBetween } from "./motion";
import { freeSpot } from "./nav";
import { PIN_LIMIT, POINTS, TELEOP_START } from "./rules";
import { log, opponent, type Job, type MatchState, type Robot } from "./state";
import { CONTACT_GAP, DEFENSE_COMMIT, MIN_SHOT_DISTANCE, PIN_BACK_OFF, PIN_RESET_GAP, PIN_RESET_TIME } from "./tuning";

/**
 * Defense, all in one place.
 *
 * Zone defense: the best place to shoot from is right in front of the upward CELL, so the defender
 * stands there. When an opponent comes to shoot, the defender pushes on it. A robot being pushed
 * moves slower, has to correct its aim, and shoots less accurately (defenseEffect on the Game tab).
 *
 * The catch is G421: holding a robot still for more than 3 s is a PIN, a 20-point MAJOR FOUL,
 * plus another every 3 s. So the defender backs off before the count reaches 3.
 */

/** The spot right in front of the opponent's upward CELL. */
export function laneSpot(m: MatchState, r: Robot): Pt {
  const them = opponent(r.alliance);
  const up = m.hives[them].up;
  const opening = cellOpening(them, up);
  const out = up === "north" ? 1 : -1;
  const size = Math.max(r.hw, r.hl);
  return freeSpot({ x: opening.x, y: opening.y + out * (MIN_SHOT_DISTANCE + 0.3 + size) }, size, r.obs);
}

/** The brain's choice for a defender: guard the lane, or push on an opponent that came to shoot. */
export function chooseDefenseJob(m: MatchState, r: Robot): Job {
  const lane = laneSpot(m, r);
  const threats = m.robots.filter(
    (o) =>
      o.alliance !== r.alliance &&
      !o.role.defend &&
      o.held.length > 0 &&
      o.job?.type !== "park" &&
      o.job?.type !== "parked" &&
      dist(o, lane) < 3,
  );
  if (threats.length === 0) return { type: "defend", target: null, until: m.t + 0.5 };
  threats.sort((a, b) => dist(a, lane) - dist(b, lane));
  return { type: "defend", target: threats[0], until: m.t + DEFENSE_COMMIT };
}

/** Carry out a defend job for one step. Returns true when the job is over. */
export function runDefense(m: MatchState, r: Robot, job: Extract<Job, { type: "defend" }>): boolean {
  const target = job.target;
  if (m.t >= job.until || target?.job?.type === "park" || target?.job?.type === "parked") return true;
  const size = Math.max(r.hw, r.hl);
  if (!target) {
    const lane = laneSpot(m, r);
    if (dist(r, lane) > 0.3) driveTo(m, r, lane, 0.3);
    return false;
  }
  if (r.pinTime > PIN_BACK_OFF) r.backOffUntil = m.t + PIN_RESET_TIME + 0.3;
  if (m.t < r.backOffUntil) {
    // Back off 2 ft so the PIN count resets.
    const d = Math.max(0.01, dist(r, target));
    const away = PIN_RESET_GAP + size + Math.max(target.hw, target.hl) + 0.4;
    const spot = { x: target.x + ((r.x - target.x) / d) * away, y: target.y + ((r.y - target.y) / d) * away };
    driveTo(m, r, freeSpot(spot, size, r.obs), 0.3, target);
    return false;
  }
  // Push on the target: drive at where it will be half a second from now.
  const lead = { x: target.x + target.vx * 0.5, y: target.y + target.vy * 0.5 };
  driveTo(m, r, freeSpot(lead, size, r.obs), 0.1, target);
  return false;
}

/** Each step: work out who is being pushed (and how hard), and run the G421 PIN count. */
export function applyDefense(m: MatchState) {
  for (const r of m.robots) r.slow = 0;
  if (m.t < TELEOP_START) return;
  for (const d of m.robots) {
    if (d.job?.type !== "defend" || !d.job.target) continue;
    const target = d.job.target;
    const gap = gapBetween(d, target);
    if (gap < CONTACT_GAP && target.job?.type !== "parked") {
      // A heavier, grippier defender pushes harder.
      const leverage = Math.min(1.5, Math.max(0.5, d.push / target.push));
      target.slow = Math.max(target.slow, Math.min(0.9, m.settings.defenseEffect * leverage));
    }
    const tryingToMove = len(target.cmdx, target.cmdy) > 1;
    if (gap < 0.1 && tryingToMove && len(target.vx, target.vy) < 0.5) d.pinTime += m.dt;
    if (gap >= PIN_RESET_GAP) {
      d.apartTime += m.dt;
      if (d.apartTime >= PIN_RESET_TIME) d.pinTime = 0;
    } else d.apartTime = 0;
    if (d.pinTime >= PIN_LIMIT) {
      d.pinTime -= PIN_LIMIT;
      m.foulCredit[target.alliance] += POINTS.majorFoul;
      m.stats[d.alliance].fouls++;
      log(m, d.alliance, `MAJOR FOUL: PIN over 3 s (+${POINTS.majorFoul} to ${target.alliance})`);
    }
  }
}
