import { atan2, cos, sin } from "./mathx";
import { onFloor, settled } from "./balls";
import { driveTo, resetRoute, routeBlocked } from "./driving";
import { FLOWERS, INWARD, angleDiff, cellOpening, dist, len, type Pt } from "./field";
import { bottomNectar, placeInFlower, pullFromBottom, topNectar } from "./flowers";
import { accelOf, intakeSpeed } from "./motion";
import { fitsPose } from "./grab";
import { freeSpot } from "./nav";
import { AUTO_END, BALL_RADIUS, FLOWER_UNLOCK, POINTS } from "./rules";
import { canLaunch, canShootFrom, launch, launcherHeading } from "./shooting";
import { runDefense } from "./defense";
import { log, ownNectar, tossBall, vary, type Job, type MatchState, type Robot } from "./state";
import {
  BUMP_ACCURACY,
  BUMP_DISTANCE,
  BUMP_REAIM,
  FLOWER_INTAKE_FACTOR,
  INTAKE_REACH,
  MOVING_SHOT_ACCURACY,
  MOVING_SHOT_SPEED,
} from "./tuning";
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
export function actionTime(m: MatchState, r: Robot, secs: number) {
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

/**
 * Patience: a driver gives up on a job that has made no progress (no ball grabbed, no shot, nothing
 * placed) for this many seconds, and lets the brain choose again. A ball given up on is ignored for a while.
 */
const PATIENCE = 8;
const IGNORE_BALL_FOR = 15;
const outOfPatience = (m: MatchState, r: Robot) => m.t - (r.progressAt ?? m.t) > PATIENCE;


/** Close to the ball but not getting it for this long (seconds), and the robot tries a different ball. */
const STALLED_ON_BALL = 1.2;
/** A tucked-in ball: the robot first stops this far (ft) back from its pose, lined up, then creeps in. */
const LINE_UP_BACK = 0.8;

/**
 * Pick a ball up on the run: drive straight over it, intake first, slowing only to the speed the
 * intake can swallow it at. The pickup itself happens in intake.ts once the ball is in the mouth.
 * A ball next to a wall or FLOWER needs the robot lined up first (the pose from grab.ts).
 */
function collect(m: MatchState, r: Robot, job: Extract<Job, { type: "collect" }>) {
  const b = job.ball;
  // Picked up (by us or anyone), or knocked rolling? Let the brain decide again (it waits for rolling balls to stop).
  if (!m.balls.includes(b) || r.held.length >= r.cap || (onFloor(b) && !settled(b))) return done(r);
  const giveUp = () => {
    r.skip.set(b.id, m.t + IGNORE_BALL_FOR);
    done(r);
  };
  if (outOfPatience(m, r)) return giveUp();
  const vi = intakeSpeed(m, r);
  const mouth = r.hl + BALL_RADIUS[b.k];
  const d = dist(r, b);
  let goal: Pt;
  let limit: number;
  if (job.pose.open) {
    // Out in the open: aim a little past the ball so the robot doesn't brake before its intake gets there.
    const face = facing(r, b);
    r.face = face;
    const ux = d > 1e-6 ? (b.x - r.x) / d : cos(r.heading);
    const uy = d > 1e-6 ? (b.y - r.y) / d : sin(r.heading);
    goal = freeSpot({ x: b.x + ux * 0.15, y: b.y + uy * 0.15 }, Math.max(r.hw, r.hl), r.obs);
    // Slow down to intake speed by the time the intake reaches the ball: v² = vi² + 2·a·distance.
    // (Planned with 60% of the braking, because the robot's speed lags a moment behind the driver.)
    limit = Math.sqrt(vi * vi + 1.2 * accelOf(m, r) * Math.max(0, d - mouth - 0.15));
    // Not lined up with the mouth yet? Creep, so the side of the frame doesn't knock it away.
    const side = Math.abs(-(b.x - r.x) * sin(r.heading) + (b.y - r.y) * cos(r.heading));
    if (side > r.intakeHalf * 0.7 && d < mouth + 1) limit = Math.min(limit, 0.5);
  } else {
    // Tucked in: stop just back from the pose, facing the right way, then creep straight in.
    const { heading } = job.pose;
    const ux = cos(heading);
    const uy = sin(heading);
    if (!job.staged) {
      const back = { x: job.pose.x - ux * LINE_UP_BACK, y: job.pose.y - uy * LINE_UP_BACK };
      const along = (r.x - job.pose.x) * ux + (r.y - job.pose.y) * uy;
      const off = Math.abs(-(r.x - job.pose.x) * uy + (r.y - job.pose.y) * ux);
      const linedUp = off < 0.15 && along < -0.2 && along > -LINE_UP_BACK - 0.4 && Math.abs(angleDiff(heading, r.heading)) < 0.12;
      if (!linedUp) {
        const at = arrive(m, r, fitsPose(m, r, back.x, back.y, heading) ? back : { x: job.pose.x - ux * 0.3, y: job.pose.y - uy * 0.3 }, 0.1, heading);
        if (at === "stuck") giveUp();
        return;
      }
      job.staged = true;
      r.busyUntil = null;
    }
    r.face = heading;
    goal = { x: job.pose.x + ux * 0.1, y: job.pose.y + uy * 0.1 };
    limit = Math.min(vi, Math.max(0.5, Math.sqrt(1.2 * accelOf(m, r) * dist(r, job.pose))));
  }
  if (driveTo(m, r, goal, 0.05, undefined, limit) > GIVE_UP_WHEN_JAMMED) return giveUp();
  // Right at the ball but it isn't coming in? Try another one.
  if (d < mouth + INTAKE_REACH + 0.2 && len(r.vx, r.vy) < 0.3) {
    r.busyUntil ??= m.t + STALLED_ON_BALL;
    if (m.t >= r.busyUntil) return giveUp();
  } else r.busyUntil = null;
}

function collectFromFlower(m: MatchState, r: Robot, fi: number) {
  const f = m.flowers[fi];
  if (f.below <= 0 || r.held.length >= r.cap) return done(r);
  const at = outOfPatience(m, r) ? "stuck" : arrive(m, r, r.flowerSpots[fi], 0.15, facing(r.flowerSpots[fi], FLOWERS[fi]));
  if (at === "stuck") {
    r.avoidFlower[fi] = m.t + AVOID_FLOWER_FOR;
    return done(r);
  }
  if (at !== "there" || !timer(m, r, r.profile.intakeTime * FLOWER_INTAKE_FACTOR)) return;
  if (pullFromBottom(f)) r.held.push("P");
  done(r);
}

// ---------- Shooting ----------

/** A robot jammed this long on the way to its shooting spot picks a different spot. */
const SHOOT_SPOT_JAM = 1;
/** Not lined up after this many seconds (someone keeps getting in the way) and the robot picks a different spot. */
const SHOOT_APPROACH_PATIENCE = 4;
/** After giving up on a FLOWER because it couldn't get there, stay away from it this long (seconds). */
const AVOID_FLOWER_FOR = 6;

function shoot(m: MatchState, r: Robot, job: Extract<Job, { type: "shoot" }>) {
  const loaded = r.held.filter((k) => canLaunch(r, k));
  // If the HIVE tipped, this spot faces the wrong end now. Let the brain pick a new one right away.
  if (loaded.length === 0 || !canShootFrom(m, r, job.spot) || outOfPatience(m, r)) return done(r);
  const opening = cellOpening(r.alliance, m.hives[r.alliance].up);
  // "Shoot while driving" needs a drivetrain that can strafe.
  const onTheMove = r.profile.shootOnTheMove && r.profile.drivetrain !== "tank";

  // Step 1: get into position and line up (once per trip).
  if (!job.aimedAt) {
    if (m.t - (r.progressAt ?? m.t) > SHOOT_APPROACH_PATIENCE) return done(r);
    // Held up on the way (a robot in the path, or just slow going) but already able to score from here? Shoot from here.
    const delayed = r.stuckTime > 0.3 || m.t - (r.progressAt ?? m.t) > 2.5 || routeBlocked(m, r, job.spot);
    if (delayed && dist(r, job.spot) > 0.3 && canShootFrom(m, r, r)) job.spot = { x: r.x, y: r.y };
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
    if (!canShootFrom(m, r, r)) {
      // Stopped just short of where it can score (pushed, or a tank that can't slide over): keep closing in.
      r.arrivedAt = null;
      driveTo(m, r, job.spot, 0.05);
      return;
    }
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
  if (m.t + 1e-9 < job.nextShot || m.t + 1e-9 < r.intakeBusyUntil) return;

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
  const mode = r.role.flowerMode;
  if (mode === "claim") return bottomNectar(m.flowers[fi].volume) === null && placed === 0 && r.held.includes(own) ? own : null;
  if (owner !== r.alliance && r.held.includes(own) && !(mode === "cap" && placed > 0)) return own;
  if (owner === r.alliance && mode === "fill" && r.held.includes("P")) return "P";
  return null;
}

function placeFlower(m: MatchState, r: Robot, job: Extract<Job, { type: "flower" }>) {
  if (m.t < FLOWER_UNLOCK) return done(r); // G410: NECTAR only in the last 60 s
  const f = m.flowers[job.fi];
  const spot = r.flowerSpots[job.fi];
  const giveUp = () => {
    r.avoidFlower[job.fi] = m.t + AVOID_FLOWER_FOR;
    done(r);
  };
  if (outOfPatience(m, r)) return giveUp();
  const at = arrive(m, r, spot, 0.15, facing(spot, FLOWERS[job.fi]));
  if (at === "stuck") return giveUp();
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
      return collect(m, r, job);
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
