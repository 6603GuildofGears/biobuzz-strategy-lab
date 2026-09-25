import { restingPoint, settled } from "./balls";
import { chooseDefenseJob } from "./defense";
import { travelTime } from "./driving";
import { CENTER, FIELD, GARDEN, NECTAR_DROP, angleDiff, cellOpening, dist, inRect, type Pt } from "./field";
import { planFlower, topNectar } from "./flowers";
import { weightInFlight } from "./hive";
import { topSpeed, turnRateOf } from "./motion";
import { freeSpot, insideRect, pathLength } from "./nav";
import { AUTO_END, BALL_RADIUS, FLOWER_UNLOCK, MATCH_LENGTH, POINTS } from "./rules";
import { canLaunch, canShootFrom, effectiveRange, launcherHeading, shotAccuracy } from "./shooting";
import { canGrab } from "./jobs";
import { nectarOwner, opponent, ownNectar, teammate, weightOf, type Ball, type Job, type MatchState, type Robot } from "./state";
import { FLOWER_INTAKE_FACTOR, MIN_SHOT_DISTANCE } from "./tuning";
import type { Kind } from "./types";

/**
 * The robot "brain": deciding what to do next. It runs whenever a robot finishes a job.
 *
 * Almost every choice uses one idea: EXPECTED POINTS PER SECOND.
 *   - A shot is worth (chance it goes in) × (its share of a 20-point HIVE TIP).
 *   - Grab another ball only if it adds points faster than this trip is already earning them.
 *   - Shoot from the spot that earns the most points per second: close shots are more
 *     accurate, but getting closer takes time.
 */

export const inAuto = (m: MatchState) => m.t < AUTO_END;
export const timeLeft = (m: MatchState) => (inAuto(m) ? AUTO_END : MATCH_LENGTH) - m.t;

/** A tip is worth 20 points and takes about `tipThreshold` POLLEN-weights, so each unit of weight is worth a share of that. */
const pointsPerWeight = (m: MatchState) => POINTS.tip / m.settings.tipThreshold;

/** Expected points from launching element k from distance d. */
const shotValue = (m: MatchState, r: Robot, k: Kind, d: number) => shotAccuracy(r.profile, k, d) * weightOf(m, k) * pointsPerWeight(m);

const wait = (m: MatchState, secs: number, why: string, spot: Pt | null = null): Job => ({ type: "wait", spot, until: m.t + secs, why });
const shootAt = (spot: Pt): Job => ({ type: "shoot", spot, aimedAt: null, nextShot: 0, bumped: false, fired: 0 });
const visitFlower = (fi: number): Job => ({ type: "flower", fi, linedUp: false, placed: 0 });

// ---------- The main decision ----------

export function chooseJob(m: MatchState, r: Robot): Job {
  if (inAuto(m) && !r.autoWorks) return wait(m, AUTO_END - m.t, "AUTO didn't run");
  if (parkDue(m, r)) return { type: "park" };
  if (!inAuto(m) && r.role.defend) return chooseDefenseJob(m, r);
  if (inFlowerPhase(m, r) && !oneVolleyFromTip(m, r)) {
    const job = flowerJob(m, r);
    if (job) return job;
  }
  return hiveJob(m, r);
}

/** Time to head for the LOADING ZONE? Routes are rarely clear, so leave a little early. */
export function parkDue(m: MatchState, r: Robot): boolean {
  if (r.job?.type === "park" || r.job?.type === "parked") return false;
  if (inAuto(m) ? !r.autoWorks || !r.profile.autoPark : !r.role.park) return false;
  const margin = inAuto(m) ? 1 : 2.6;
  // Quick check first: routes are never more than 3× the straight line, so skip the route math when parking is far off.
  const longest = (3 * dist(r, r.parkSpot)) / topSpeed(m, r) + 2;
  if (timeLeft(m) > longest * 1.15 + margin) return false;
  return timeLeft(m) <= travelTime(m, r, r.parkSpot) * 1.15 + margin;
}

const parkReserve = (m: MatchState, r: Robot) => (!inAuto(m) && r.role.park ? travelTime(m, r, r.parkSpot) + 1.5 : 0);

// ---------- HIVE ----------

interface ShotPlan {
  spot: Pt;
  d: number;
  /** Seconds to get there, turn, aim, and fire everything. */
  time: number;
  points: number;
  /** False when every good spot is taken by another robot (this is the best of the taken ones). */
  free: boolean;
}

/** A tank drive turns in place. Mecanum and swerve can turn while they drive. */
function turnTime(m: MatchState, r: Robot, heading: number, driveSecs: number) {
  const secs = Math.abs(angleDiff(heading, r.heading)) / turnRateOf(m, r);
  return r.profile.drivetrain === "tank" ? secs : Math.max(0, secs - driveSecs);
}

/**
 * Can the robot sit at p? In AUTO it also has to be off the wall, because LEAVE (3 points) needs
 * the robot to not be touching the wall when AUTO ends.
 */
const fitsAt = (m: MatchState, r: Robot, p: Pt) => {
  const half = Math.max(r.hw, r.hl) + (inAuto(m) ? 0.15 : 0);
  return p.x >= half && p.x <= FIELD - half && p.y >= half && p.y <= FIELD - half && !r.obs.some((o) => insideRect(p, o));
};

/** How far (ft) a robot can stop off its shooting spot and still score from there. */
const SPOT_SLACK = 0.35;

/** Search spots in front of the upward CELL for the one that earns the most points per second. */
export function bestShot(m: MatchState, r: Robot, load: Kind[]): ShotPlan | null {
  const up = m.hives[r.alliance].up;
  const opening = cellOpening(r.alliance, up);
  const range = effectiveRange(r.profile);
  if (range < MIN_SHOT_DISTANCE + 0.1) return null;
  const outward = up === "north" ? 1 : -1;
  const size = Math.max(r.hw, r.hl);
  const mate = teammate(m, r);
  const mateSpot = mate.job?.type === "shoot" ? mate.job.spot : null;
  // A spot is taken if another robot is sitting on it, or the teammate is already headed there.
  const taken = (p: Pt) =>
    m.robots.some((o) => o !== r && dist(o, p) < size + Math.max(o.hw, o.hl)) ||
    (mateSpot !== null && dist(mateSpot, p) < size + Math.max(mate.hw, mate.hl));

  // Where it is now, plus a grid of spots in front of the opening: 5 distances × 7 side-to-side positions.
  const nearest = MIN_SHOT_DISTANCE + SPOT_SLACK + 0.05;
  const candidates: Pt[] = [{ x: r.x, y: r.y }];
  for (let i = 0; i <= 4; i++) {
    const along = Math.min(range, nearest + ((range - nearest) * i) / 4);
    for (let j = -3; j <= 3; j++) candidates.push({ x: opening.x + j * 0.35, y: opening.y + outward * along });
  }

  let best: (ShotPlan & { rate: number }) | null = null;
  let bestTaken: (ShotPlan & { rate: number }) | null = null;
  // A good spot still works if the robot stops a few inches off it, so drivers don't need to park perfectly.
  const workable = (p: Pt) =>
    canShootFrom(m, r, p) && [[-1, 0], [1, 0], [0, -1], [0, 1]].every(([dx, dy]) => canShootFrom(m, r, { x: p.x + dx * SPOT_SLACK, y: p.y + dy * SPOT_SLACK }));
  for (const spot of candidates) {
    if (!fitsAt(m, r, spot) || !workable(spot)) continue;
    const free = !taken(spot);
    const d = dist(spot, opening);
    const drive = travelTime(m, r, spot);
    // A robot that shoots while driving lines up on the way, so aiming overlaps the drive.
    const onTheMove = r.profile.shootOnTheMove && r.profile.drivetrain !== "tank";
    const aim = onTheMove ? Math.max(0, r.profile.alignTime - drive) : r.profile.alignTime;
    const time = drive + turnTime(m, r, launcherHeading(r, spot, opening), drive) + aim + (load.length - 1) * r.profile.launchTime;
    const points = load.reduce((sum, k) => sum + shotValue(m, r, k, d), 0);
    const plan = { spot, d, time, points, rate: points / time, free };
    if (free && (!best || plan.rate > best.rate)) best = plan;
    if (!free && (!bestTaken || plan.rate > bestTaken.rate)) bestTaken = plan;
  }
  return best ?? bestTaken;
}

interface Pickup {
  job: Job;
  value: number;
  /** Extra seconds this pickup adds to the trip. */
  extra: number;
  rate: number;
}

/** Taking a ball out of a GARDEN changes GARDEN points: -1 from yours, +1 (for you) from theirs. */
function gardenValue(r: Robot, b: Ball) {
  const pad = BALL_RADIUS[b.k];
  if (inRect(b, GARDEN[r.alliance], pad)) return -POINTS.garden;
  if (inRect(b, GARDEN[opponent(r.alliance)], pad)) return POINTS.garden;
  return 0;
}

/**
 * Pulling POLLEN out of a FLOWER's bottom can let a scoring POLLEN slide down out of the scoring
 * volume. That costs the owner 2 points. In the FLOWER phase, an unowned FLOWER is one we might
 * claim ourselves, so we count it as ours.
 */
function flowerPullValue(m: MatchState, r: Robot, fi: number) {
  const f = m.flowers[fi];
  if (f.volume[0] !== "P") return 0;
  const owner = topNectar(f.volume) ?? (inFlowerPhase(m, r) ? r.alliance : null);
  return owner === r.alliance ? -POINTS.ownedFlowerElement : owner ? POINTS.ownedFlowerElement : 0;
}

/** During AUTO a robot stays on its own half (G402). */
const onOwnHalf = (m: MatchState, r: Robot, p: Pt) => !inAuto(m) || (r.alliance === "red" ? p.x < CENTER : p.x > CENTER);

/**
 * A ball this robot is allowed to go after: not the opponent's NECTAR, not already claimed by the
 * teammate, and not one it recently gave up on.
 */
const available = (m: MatchState, r: Robot, b: Ball) => {
  const owner = nectarOwner(b.k);
  if (owner && owner !== r.alliance) return false;
  if ((r.skip.get(b.id) ?? 0) > m.t) return false;
  return !b.claimedBy || b.claimedBy === r || b.claimedBy.alliance !== r.alliance;
};

/**
 * The best ball to grab on the way to `spot`, scored by points per extra second.
 * `valueOf` says what an element is worth to this robot (0 = don't want it).
 */
function bestPickup(m: MatchState, r: Robot, valueOf: (k: Kind) => number, spot: Pt): Pickup | null {
  const speed = topSpeed(m, r);
  const direct = pathLength(r, spot, r.obs);
  let best: Pickup | null = null;
  const consider = (job: Job, at: Pt, value: number, handling: number) => {
    if (value <= 0 || !onOwnHalf(m, r, at)) return;
    const extra = (pathLength(r, at, r.obs) + pathLength(at, spot, r.obs) - direct) / speed + handling;
    const rate = value / Math.max(0.3, extra);
    if (!best || rate > best.rate) best = { job, value, extra, rate };
  };
  for (const b of m.balls) {
    if (!settled(b) || !available(m, r, b) || !canGrab(r, b)) continue;
    const v = valueOf(b.k);
    if (v > 0) consider({ type: "collect", ball: b }, b, v + gardenValue(r, b), r.profile.intakeTime + r.profile.launchTime);
  }
  const pollen = valueOf("P");
  if (pollen > 0) {
    m.flowers.forEach((f, fi) => {
      if (f.below <= 0) return;
      const handling = r.profile.intakeTime * FLOWER_INTAKE_FACTOR + r.profile.launchTime;
      consider({ type: "collectFlower", fi }, r.flowerSpots[fi], pollen + flowerPullValue(m, r, fi), handling);
    });
  }
  return best;
}

function hiveJob(m: MatchState, r: Robot): Job {
  const loaded = r.held.filter((k) => canLaunch(r, k));
  const plan = bestShot(m, r, loaded.length > 0 ? loaded : ["P"]);
  if (!plan) return wait(m, 0.5, "can't reach the CELL from anywhere");

  const spare = timeLeft(m) - parkReserve(m, r) - plan.time;
  const pick = r.held.length < r.cap ? bestPickup(m, r, (k) => (canLaunch(r, k) ? shotValue(m, r, k, plan.d) : 0), plan.spot) : null;
  const canPick = pick !== null && pick.extra < spare;
  // Shoot now if full, or if the best ball out there adds points more slowly than this trip is already earning them.
  const tripRate = plan.points / (m.t - r.tripStart + plan.time);
  const shootNow = loaded.length > 0 && (loaded.length >= r.cap || !canPick || pick.rate <= tripRate);
  if (!shootNow) return canPick ? pick.job : idleJob(m, r);
  if (plan.free) return shootAt(plan.spot);
  // Every good spot is taken: keep collecting if there's room, otherwise line up just behind the spot.
  if (canPick) return pick.job;
  const out = m.hives[r.alliance].up === "north" ? 1 : -1;
  const queue = { x: plan.spot.x, y: plan.spot.y + out * 2 * Math.max(r.hw, r.hl) };
  return wait(m, 0.5, "waiting for a shooting spot", freeSpot(queue, Math.max(r.hw, r.hl), r.obs));
}

/** Nothing to pick up: head to where the nearest rolling ball will stop. */
function idleJob(m: MatchState, r: Robot): Job {
  let target: Pt | null = null;
  let bestD = Infinity;
  for (const b of m.balls) {
    if (settled(b) || !available(m, r, b) || !canLaunch(r, b.k)) continue;
    const p = restingPoint(m, b);
    if (!onOwnHalf(m, r, p)) continue;
    const d = dist(r, p);
    if (d < bestD) {
      bestD = d;
      target = p;
    }
  }
  if (target) return wait(m, 0.5, "heading to a rolling ball", freeSpot(target, Math.max(r.hw, r.hl), r.obs));
  return wait(m, 0.4, "nothing to pick up");
}

/** If what this robot is carrying will probably tip the HIVE, finish that before going to FLOWERS. */
function oneVolleyFromTip(m: MatchState, r: Robot) {
  const loaded = r.held.filter((k) => canLaunch(r, k));
  const h = m.hives[r.alliance];
  const most = loaded.reduce((w, k) => w + weightOf(m, k), 0);
  if (loaded.length === 0 || h.weight + weightInFlight(m, r.alliance) + most < m.settings.tipThreshold) return false;
  const plan = bestShot(m, r, loaded);
  if (!plan || plan.time > timeLeft(m) - parkReserve(m, r)) return false;
  const expected = loaded.reduce((w, k) => w + shotAccuracy(r.profile, k, plan.d) * weightOf(m, k), 0);
  return h.weight + weightInFlight(m, r.alliance) + expected >= m.settings.tipThreshold;
}

// ---------- FLOWERS ----------

const inFlowerPhase = (m: MatchState, r: Robot) =>
  !inAuto(m) && r.role.flowerStart !== null && timeLeft(m) <= Math.min(MATCH_LENGTH - FLOWER_UNLOCK, r.role.flowerStart);

/** The FLOWER visit that earns the most points per second with what the robot holds now. */
function bestFlowerTrip(m: MatchState, r: Robot) {
  let best: { fi: number; rate: number; time: number } | null = null;
  const mateJob = teammate(m, r).job;
  for (let fi = 0; fi < r.flowerSpots.length; fi++) {
    if (mateJob?.type === "flower" && mateJob.fi === fi) continue; // the teammate is already working this FLOWER
    const plan = planFlower(m, r.alliance, fi, r.held, r.role.flowerMode);
    if (plan.value <= 0) continue;
    const time = travelTime(m, r, r.flowerSpots[fi]) + r.profile.alignTime + plan.used * r.profile.flowerTime;
    const rate = plan.value / (time + 1);
    if (!best || rate > best.rate) best = { fi, rate, time };
  }
  return best;
}

function flowerJob(m: MatchState, r: Robot): Job | null {
  const own = ownNectar(r.alliance);
  const cap = r.role.flowerMode === "cap";
  const heldN = r.held.filter((k) => k === own).length;
  const heldP = r.held.filter((k) => k === "P").length;
  const spare = timeLeft(m) - parkReserve(m, r);

  const trip = bestFlowerTrip(m, r);
  if (trip && (r.held.length >= r.cap || spare < trip.time + 3 || (cap && heldN >= r.cap))) return visitFlower(trip.fi);

  // What to carry: capping takes only NECTAR. Building takes one NECTAR to claim, then POLLEN to fill.
  const claimable = m.flowers.some((_, fi) => planFlower(m, r.alliance, fi, [own], r.role.flowerMode).value >= POINTS.bottomNectar);
  const wantN = cap ? r.cap : heldN === 0 && claimable ? 1 : 0;
  const wantP = cap ? 0 : r.cap - Math.max(heldN, wantN);
  const toward = trip ? r.flowerSpots[trip.fi] : r;
  // Full, but not with what it needs? Returning null sends it to the HIVE to shoot the rest and make room.
  if (r.held.length >= r.cap) return trip ? visitFlower(trip.fi) : null;

  if (heldN < wantN) {
    // About what claiming an empty FLOWER is worth: the bottom bonus plus owning a few elements.
    const claimValue = POINTS.bottomNectar + 3 * POINTS.ownedFlowerElement;
    const pick = bestPickup(m, r, (k) => (k === own ? claimValue : 0), toward);
    if (pick && pick.extra < spare - 4) return pick.job;
    if (!pick && m.nectarWaiting[r.alliance] + m.balls.filter((b) => b.k === own).length > 0 && !trip) {
      const drop = NECTAR_DROP[r.alliance];
      const nearDrop = { x: drop.x + (r.alliance === "red" ? 1.6 : -1.6), y: drop.y };
      return wait(m, 0.5, "waiting for NECTAR", freeSpot(nearDrop, Math.max(r.hw, r.hl), r.obs));
    }
  }
  const ownsRoom = m.flowers.some((f) => topNectar(f.volume) === r.alliance && f.volume.length < m.settings.flowerCapacity);
  if (heldP < wantP && (heldN > 0 || ownsRoom)) {
    const pick = bestPickup(m, r, (k) => (k === "P" ? POINTS.ownedFlowerElement : 0), toward);
    if (pick && pick.extra < spare - 4) return pick.job;
  }
  return trip ? visitFlower(trip.fi) : null;
}
