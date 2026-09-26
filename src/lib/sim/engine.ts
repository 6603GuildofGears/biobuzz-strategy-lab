import { moveBalls, onFloor } from "./balls";
import { chooseJob, parkDue } from "./brain";
import { applyDefense, backOff } from "./defense";
import { LOADING_ZONE, len } from "./field";
import { dropNectar, landShots } from "./hive";
import { intakeBalls } from "./intake";
import { runJob, setJob } from "./jobs";
import { collideRobots, moveRobots } from "./motion";
import { AUTO_END, FLOWER_UNLOCK, MATCH_LENGTH, POINTS, TELEOP_START } from "./rules";
import { finalScores, partlyIn, scoreAlliance, touchingWall } from "./scoring";
import { shotHeight } from "./shooting";
import { ALLIANCES, createMatch, log, schedule, type MatchInput, type MatchState, type Robot } from "./state";
import { DT, MAX_SETTLE_TIME } from "./tuning";
import type { MatchResult } from "./types";

export type { MatchInput };
/** Seconds between replay frames. */
export const FRAME_DT = DT;

/**
 * Plays one whole match and returns the score. This is the main loop:
 *
 *   every 0.1 s:  things that were scheduled happen (spills, NECTAR drops)
 *                 each robot decides what to do and steers   (brain.ts, jobs.ts, driving.ts)
 *                 robots and balls move, intakes pull balls in (motion.ts, intake.ts, balls.ts)
 *                 shots that arrive land in the CELL or bounce (hive.ts)
 *   at the end:   wait for everything to come to rest, then score (scoring.ts)
 */
export function simulateMatch(input: MatchInput): MatchResult {
  const m = createMatch(input);
  let autoOver = false;
  let teleopStarted = false;
  let nectarReleased = false;

  const steps = Math.round(MATCH_LENGTH / m.dt);
  for (let s = 0; s < steps; s++) {
    m.t = s * m.dt;
    runScheduled(m);
    if (!autoOver && m.t >= AUTO_END - 1e-9) {
      autoOver = true;
      endAuto(m);
    }
    if (!teleopStarted && m.t >= TELEOP_START - 1e-9) {
      teleopStarted = true;
      for (const r of m.robots) r.tripStart = m.t;
    }
    if (!nectarReleased && m.t >= FLOWER_UNLOCK - 1e-9) {
      nectarReleased = true;
      releaseAllNectar(m);
    }

    const powered = m.t < AUTO_END || m.t >= TELEOP_START;
    if (powered) {
      applyDefense(m);
      for (const r of m.robots) updateRobot(m, r);
    } else for (const r of m.robots) stop(r); // G403: no powered movement between AUTO and TELEOP
    physics(m, powered);
    if (m.record) recordFrame(m);
  }

  settle(m);
  const { red, blue, winner } = finalScores(m);
  for (const a of ALLIANCES) {
    const parked = m.robots.filter((r) => r.alliance === a && partlyIn(r, LOADING_ZONE[a])).length;
    if (parked > 0) log(m, a, `${parked} robot(s) parked (+${parked * POINTS.park})`);
  }
  if (m.record) recordFrame(m);
  m.events.sort((x, y) => x.t - y.t);
  return { red, blue, winner, events: m.events, stats: m.stats, frames: m.record ? m.frames : undefined };
}

function runScheduled(m: MatchState) {
  const due = m.later.filter((e) => e.at <= m.t + 1e-9);
  m.later = m.later.filter((e) => e.at > m.t + 1e-9);
  for (const e of due) e.fn();
}

/** `powered`: robots are running, so their intakes pull in balls they drive over. */
function physics(m: MatchState, powered: boolean) {
  moveRobots(m);
  collideRobots(m);
  if (powered) intakeBalls(m);
  landShots(m);
  moveBalls(m);
}

function stop(r: Robot) {
  r.cmdx = 0;
  r.cmdy = 0;
  r.face = null;
}

/** One robot's turn: pick a job if it has none, then work on it. */
function updateRobot(m: MatchState, r: Robot) {
  stop(r);
  if (parkDue(m, r)) setJob(r, { type: "park" });
  if (backOff(m, r)) return; // about to be called for a PIN: back off first (G421)
  // If a job finishes right away, start the next one in the same step so no time is wasted.
  for (let i = 0; i < 3; i++) {
    if (!r.job) setJob(r, chooseJob(m, r));
    const job = r.job;
    runJob(m, r);
    if (r.job === job) break;
  }
}

/** LEAVE and AUTO park are judged the moment AUTO ends (10.5.F). */
function endAuto(m: MatchState) {
  for (const r of m.robots) {
    r.left = !touchingWall(r);
    r.autoParked = partlyIn(r, LOADING_ZONE[r.alliance]);
    r.obs = r.teleopObs; // the whole FIELD is open in TELEOP
    setJob(r, null);
    stop(r);
  }
}

/** With 60 s left, human players can enter all their remaining NECTAR (G426). */
function releaseAllNectar(m: MatchState) {
  for (const a of ALLIANCES) {
    const n = m.nectarWaiting[a];
    m.nectarWaiting[a] = 0;
    if (n > 0) log(m, a, `Endgame: FLOWERS unlocked, ${n} NECTAR coming in`);
    for (let i = 0; i < n; i++) schedule(m, 0.5 + i * 0.8, () => dropNectar(m, a));
  }
}

/** After the buzzer, robots coast to a stop, shots land, and balls roll to rest. Then we score (10.5). */
function settle(m: MatchState) {
  for (const r of m.robots) stop(r);
  const end = m.t + MAX_SETTLE_TIME;
  while (m.t < end) {
    m.t += m.dt;
    runScheduled(m);
    physics(m, false);
    if (m.record) recordFrame(m);
    const calm =
      m.shots.length === 0 &&
      m.later.length === 0 &&
      m.balls.every((b) => onFloor(b) && len(b.vx, b.vy) < 0.1) &&
      m.robots.every((r) => len(r.vx, r.vy) < 0.1);
    if (calm) break;
  }
}

function recordFrame(m: MatchState) {
  const inAir = m.shots.map((s) => {
    const u = Math.min(1, Math.max(0, (m.t - s.t0) / (s.t1 - s.t0)));
    return { x: s.from.x + (s.to.x - s.from.x) * u, y: s.from.y + (s.to.y - s.from.y) * u, z: shotHeight(m.t - s.t0, s.t1 - s.t0, s.h0), k: s.k };
  });
  m.frames.push({
    t: m.t,
    robots: m.robots.map((r) => ({ x: r.x, y: r.y, hw: r.hw, hl: r.hl, held: [...r.held], mode: r.job?.type ?? "idle", heading: r.heading })),
    floor: [...m.balls.map((b) => ({ x: b.x, y: b.y, z: Math.max(0, b.z), k: b.k })), ...inAir],
    cells: { red: [...m.hives.red.cell], blue: [...m.hives.blue.cell] },
    hiveUp: { red: m.hives.red.up, blue: m.hives.blue.up },
    flowers: m.flowers.map((f) => ({ volume: [...f.volume], below: f.below })),
    score: { red: scoreAlliance(m, "red", false).total, blue: scoreAlliance(m, "blue", false).total },
  });
}
