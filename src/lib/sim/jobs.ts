import { atan2, cos, sin } from "./mathx";
import { onFloor, settled } from "./balls";
import { driveTo, resetRoute } from "./driving";
import { FIELD, FLOWERS, INWARD, angleDiff, cellOpening, dist, len, type Pt } from "./field";
import { placeInFlower, pullFromBottom, topNectar } from "./flowers";
import { freeSpot } from "./nav";
import { AUTO_END, BALL_RADIUS, FLOWER_UNLOCK, POINTS } from "./rules";
import { canLaunch, canShootFrom, launch, launcherHeading } from "./shooting";
import { runDefense } from "./defense";
import { log, ownNectar, tossBall, vary, type Ball, type Job, type MatchState, type Robot } from "./state";
import { BUMP_ACCURACY, BUMP_DISTANCE, BUMP_REAIM, FLOWER_INTAKE_FACTOR, INTAKE_REACH, MOVING_SHOT_ACCURACY, MOVING_SHOT_SPEED } from "./tuning";
import type { Kind } from "./types";

/**
 * Carrying out jobs. Every job follows the same pattern:
 *   1. drive to a spot and turn to face the right way  (arrive)
 *   2. wait for a timed action to finish                (timer)
 *   3. do it: grab the ball, launch, place in a FLOWER  (then the job is done)
 * These functions run once per simulation step, so each one picks up where it left off.
 */

/** Start a new job (or null for none), dropping whatever the robot was doing. */
export function setJob(r: Robot, job: Job | null) {
  if (r.job?.type === "collect" && r.job.ball.claimedBy === r) r.job.ball.claimedBy = null;
  r.job = job;
  r.busyUntil = null;
  r.arrivedAt = null;
  r.progressAt = null;
  resetRoute(r);
  if (job?.type === "collect") job.ball.claimedBy = r;
}

const done = (r: Robot) => setJob(r, null);

/** How long an action really takes this time: a little random, slower in a slow AUTO or while being pushed. */
function actionTime(m: MatchState, r: Robot, secs: number) {
  const speed = (m.t < AUTO_END ? r.profile.autoSpeed : 1) * (1 - r.slow);
  return vary(m, secs) / Math.max(0.2, speed);
}

/**
 * Wait `secs` for an action. Returns true once, when it's finished. Actions are slower in
 * AUTO (if the AUTO speed slider is below 100%) and while a defender is pushing on the robot.
 */
function timer(m: MatchState, r: Robot, secs: number): boolean {
  if (r.busyUntil === null) r.busyUntil = m.t + actionTime(m, r, secs);
  if (m.t + 1e-9 < r.busyUntil) return false;
  r.busyUntil = null;
  return true;
}

type Arrival = "driving" | "turning" | "there" | "stuck";

/** Jammed this long (seconds) and the robot gives up on the job so the brain can pick something else. */
const GIVE_UP_WHEN_JAMMED = 1.5;

/** Once a robot has reached its spot, a bump smaller than this doesn't send it driving back. */
const STAY_ARRIVED = 0.5;

/** Drive to `goal` and face `face` (radians, or null for any direction). */
function arrive(m: MatchState, r: Robot, goal: Pt, tol: number, face: number | null): Arrival {
  r.face = face;
  // A tank drive can't slide sideways to fix a small miss, so it accepts stopping a little farther off.
  const close = tol + (r.profile.drivetrain === "tank" ? 0.1 : 0);
  const reached = dist(r, goal) <= close && len(r.vx, r.vy) <= 0.6;
  // Turning in place next to a wall or FLOWER can bump the robot a little. That still counts as there.
  const stillThere = r.arrivedAt !== null && dist(r, r.arrivedAt) < STAY_ARRIVED && dist(goal, r.arrivedAt) < STAY_ARRIVED;
  if (!reached && !stillThere) {
    r.arrivedAt = null;
    return driveTo(m, r, goal, tol) > GIVE_UP_WHEN_JAMMED ? "stuck" : "driving";
  }
  r.arrivedAt ??= { x: r.x, y: r.y };
  if (face !== null && Math.abs(angleDiff(face, r.heading)) > 0.1) return "turning";
  return "there";
}

const facing = (from: Pt, to: Pt) => atan2(to.y - from.y, to.x - from.x);

// ---------- Picking up ----------

const grabReach = (r: Robot, b: Ball) => Math.max(r.hw, r.hl) + BALL_RADIUS[b.k] + 0.05;

/** Where the robot stops to intake ball b: just short of it, coming from where the robot is now. */
export function grabSpot(r: Robot, b: Ball): Pt {
  const d = dist(r, b);
  const reach = grabReach(r, b);
  const k = d <= reach ? 0 : (d - reach) / d;
  const spot = freeSpot({ x: r.x + (b.x - r.x) * k, y: r.y + (b.y - r.y) * k }, Math.max(r.hw, r.hl), r.obs);
  // Facing the ball at an angle makes the robot take up more room, so it can't get as close to a wall.
  const face = facing(spot, b);
  const c = Math.abs(cos(face));
  const s = Math.abs(sin(face));
  const ex = c * r.hl + s * r.hw;
  const ey = s * r.hl + c * r.hw;
  return { x: Math.min(FIELD - ex, Math.max(ex, spot.x)), y: Math.min(FIELD - ey, Math.max(ey, spot.y)) };
}

/**
 * Patience: a driver gives up on a job that has made no progress (no ball grabbed, no shot, nothing
 * placed) for this many seconds, and lets the brain choose again. A ball given up on is ignored for a while.
 */
const PATIENCE = 8;
const IGNORE_BALL_FOR = 15;
const outOfPatience = (m: MatchState, r: Robot) => m.t - (r.progressAt ?? m.t) > PATIENCE;

/** Can the intake reach this ball at all? (Not if it's jammed against a FLOWER, for example.) */
export const canGrab = (r: Robot, b: Ball) => dist(grabSpot(r, b), b) <= grabReach(r, b) + INTAKE_REACH;

function collect(m: MatchState, r: Robot, b: Ball) {
  // Gone, or knocked rolling? Let the brain decide again (it waits for rolling balls to stop).
  if (!m.balls.includes(b) || r.held.length >= r.cap || (onFloor(b) && !settled(b))) return done(r);
  const giveUp = () => {
    r.skip.set(b.id, m.t + IGNORE_BALL_FOR);
    done(r);
  };
  if (outOfPatience(m, r)) return giveUp();
  const at = arrive(m, r, grabSpot(r, b), 0.15, facing(r, b));
  if (at === "stuck") return giveUp();
  if (at !== "there" || !timer(m, r, r.profile.intakeTime)) return;
  if (!onFloor(b) || !canGrab(r, b)) return giveUp();
  m.balls.splice(m.balls.indexOf(b), 1);
  r.held.push(b.k);
  done(r);
}

function collectFromFlower(m: MatchState, r: Robot, fi: number) {
  const f = m.flowers[fi];
  if (f.below <= 0 || r.held.length >= r.cap || outOfPatience(m, r)) return done(r);
  const at = arrive(m, r, r.flowerSpots[fi], 0.15, facing(r.flowerSpots[fi], FLOWERS[fi]));
  if (at === "stuck") return done(r);
  if (at !== "there" || !timer(m, r, r.profile.intakeTime * FLOWER_INTAKE_FACTOR)) return;
  if (pullFromBottom(f)) r.held.push("P");
  done(r);
}

// ---------- Shooting ----------

/** A robot jammed this long on the way to its shooting spot picks a different spot. */
const SHOOT_SPOT_JAM = 1;

function shoot(m: MatchState, r: Robot, job: Extract<Job, { type: "shoot" }>) {
  const loaded = r.held.filter((k) => canLaunch(r, k));
  // If the HIVE tipped, this spot faces the wrong end now. Let the brain pick a new one right away.
  if (loaded.length === 0 || !canShootFrom(m, r, job.spot) || outOfPatience(m, r)) return done(r);
  const opening = cellOpening(r.alliance, m.hives[r.alliance].up);
  // "Shoot while driving" needs a drivetrain that can strafe.
  const onTheMove = r.profile.shootOnTheMove && r.profile.drivetrain !== "tank";

  // Step 1: get into position and line up (once per trip).
  if (!job.aimedAt) {
    const at = arrive(m, r, job.spot, 0.2, launcherHeading(r, job.spot, opening));
    if (at === "stuck" || (at === "driving" && r.stuckTime > SHOOT_SPOT_JAM)) return done(r);
    if (onTheMove) {
      // Lines up while still driving, as soon as it could score from here and is pointed at the CELL.
      const pointed = Math.abs(angleDiff(launcherHeading(r, r, opening), r.heading)) < 0.2;
      if (at !== "there" && !(pointed && canShootFrom(m, r, r))) {
        r.busyUntil = null;
        return;
      }
    } else if (at !== "there") return;
    if (!canShootFrom(m, r, r)) return done(r); // pick a spot it can actually score from
    if (!timer(m, r, r.profile.alignTime)) return;
    job.aimedAt = { x: r.x, y: r.y };
    job.nextShot = m.t;
  }

  // Step 2: fire everything, one element every `launchTime`.
  if (onTheMove) {
    // Keeps driving onto its spot while firing. It aims the whole time, so a bump doesn't throw it off.
    if (dist(r, job.spot) > 0.2) driveTo(m, r, job.spot, 0.2);
    job.aimedAt = { x: r.x, y: r.y };
  }
  r.face = launcherHeading(r, r, opening);
  if (!canShootFrom(m, r, r)) {
    // Shoved somewhere it can't score from: drive back and line up again.
    job.aimedAt = null;
    return;
  }
  if (dist(r, job.aimedAt) > BUMP_DISTANCE) {
    // Bumped: a quick correction, and the next shot is a little less sure.
    job.aimedAt = { x: r.x, y: r.y };
    job.nextShot = Math.max(job.nextShot, m.t + actionTime(m, r, r.profile.alignTime * BUMP_REAIM));
    job.bumped = true;
  }
  if (m.t + 1e-9 < job.nextShot) return;

  if (job.fired === 0) {
    m.stats[r.alliance].volleys++;
    m.stats[r.alliance].volleyElements += loaded.length;
  }
  const k = loaded[0];
  r.held.splice(r.held.indexOf(k), 1);
  const moving = len(r.vx, r.vy) > MOVING_SHOT_SPEED;
  launch(m, r, k, (job.bumped ? BUMP_ACCURACY : 1) * (moving ? MOVING_SHOT_ACCURACY : 1));
  job.bumped = false;
  job.fired++;
  // Schedule from when this shot was due (not from the step it happened on), so the average
  // spacing matches the launch time exactly instead of rounding up to the next 0.1 s step.
  job.nextShot = Math.max(job.nextShot, m.t - m.dt) + actionTime(m, r, r.profile.launchTime);
  r.progressAt = m.t;
  if (loaded.length === 1) {
    r.tripStart = m.t;
    done(r);
  }
}

// ---------- FLOWERS ----------

/** The next element to place: our NECTAR if we don't own the FLOWER yet, POLLEN on top if we do. */
function nextForFlower(m: MatchState, r: Robot, fi: number, placed: number): Kind | null {
  const owner = topNectar(m.flowers[fi].volume);
  const own = ownNectar(r.alliance);
  const cap = r.role.flowerMode === "cap";
  if (owner !== r.alliance && r.held.includes(own) && !(cap && placed > 0)) return own;
  if (owner === r.alliance && !cap && r.held.includes("P")) return "P";
  return null;
}

function placeFlower(m: MatchState, r: Robot, job: Extract<Job, { type: "flower" }>) {
  if (m.t < FLOWER_UNLOCK || outOfPatience(m, r)) return done(r); // G410: NECTAR only in the last 60 s
  const f = m.flowers[job.fi];
  const spot = r.flowerSpots[job.fi];
  const at = arrive(m, r, spot, 0.15, facing(spot, FLOWERS[job.fi]));
  if (at === "stuck") return done(r);
  if (at !== "there") return;
  if (!job.linedUp) {
    if (!timer(m, r, r.profile.alignTime)) return;
    job.linedUp = true;
  }
  const k = nextForFlower(m, r, job.fi, job.placed);
  if (!k || f.volume.length >= m.settings.flowerCapacity) return done(r);
  if (!timer(m, r, r.profile.flowerTime)) return;

  r.held.splice(r.held.indexOf(k), 1);
  job.placed++;
  r.progressAt = m.t;
  if (m.rng() < r.profile.flowerAccuracy) {
    const before = topNectar(f.volume);
    const empty = !f.volume.some((e) => e !== "P");
    placeInFlower(f, k, m.settings.flowerCapacity);
    if (k !== "P" && empty) log(m, r.alliance, `Claimed FLOWER ${job.fi + 1} (bottom NECTAR +${POINTS.bottomNectar})`);
    else if (k !== "P" && before && before !== r.alliance) log(m, r.alliance, `Stole FLOWER ${job.fi + 1} from ${before}`);
  } else {
    // A miss bounces off the top of the FLOWER onto the tiles.
    const fl = FLOWERS[job.fi];
    const out = atan2(fl.out.y, fl.out.x);
    tossBall(m, k, { x: fl.x + fl.out.x * 0.5, y: fl.y + fl.out.y * 0.5 }, 1.6, 0.4, 1.6, out + (m.rng() - 0.5) * 2);
  }
}

// ---------- Running the current job ----------

export function runJob(m: MatchState, r: Robot) {
  const job = r.job;
  if (!job) return;
  r.progressAt ??= m.t;
  switch (job.type) {
    case "collect":
      return collect(m, r, job.ball);
    case "collectFlower":
      return collectFromFlower(m, r, job.fi);
    case "shoot":
      return shoot(m, r, job);
    case "flower":
      return placeFlower(m, r, job);
    case "park":
      if (arrive(m, r, r.parkSpot, 0.2, INWARD[r.alliance]) === "there") setJob(r, { type: "parked" });
      return;
    case "parked":
      r.face = INWARD[r.alliance];
      return;
    case "defend":
      if (runDefense(m, r, job)) done(r);
      return;
    case "wait":
      if (job.spot) arrive(m, r, job.spot, 0.3, null);
      if (m.t >= AUTO_END && job.why !== "AUTO didn't run") m.stats[r.alliance].idleTime += m.dt;
      if (m.t >= job.until) done(r);
      return;
  }
}
