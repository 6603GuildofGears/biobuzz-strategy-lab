import { GARDEN, FLOWERS, START_OPEN_END, flowerSpot, parkSpot, startPose, type HiveEnd, type Pt, type Rect } from "./field";
import { inflatedObstacles } from "./nav";
import { mulberry32, type Rng } from "./rng";
import { BALL_RADIUS, MAX_HELD, NECTAR_IN_ALLIANCE_AREA, NECTAR_IN_CELL, POLLEN_PER_FLOWER, POLLEN_PER_GARDEN, PRELOAD_PER_ROBOT } from "./rules";
import { ACTION_TIME_JITTER, DT, FLOWER_BELOW_SLOTS, TRACTION } from "./tuning";
import type { Alliance, Frame, GameSettings, Kind, MatchEvent, PlayStats, RobotProfile, RoleConfig, Strategy } from "./types";

/**
 * The whole match lives in one MatchState object, usually called `m`.
 * Every other file has functions that read and change it.
 */

export const ALLIANCES: Alliance[] = ["red", "blue"];
export const ownNectar = (a: Alliance): Kind => (a === "red" ? "R" : "B");
export const opponent = (a: Alliance): Alliance => (a === "red" ? "blue" : "red");
/** Which alliance a NECTAR belongs to (null for POLLEN). */
export const nectarOwner = (k: Kind): Alliance | null => (k === "R" ? "red" : k === "B" ? "blue" : null);

/** A POLLEN or NECTAR that is on the field (not held by a robot, not in a HIVE or FLOWER). */
export interface Ball {
  id: number;
  k: Kind;
  x: number;
  y: number;
  /** Height above the tiles (ft) and speeds (ft/s). */
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** A robot on the way to pick this ball up. Its teammate leaves it alone. */
  claimedBy: Robot | null;
}

/** A launched ball in the air on its way to a CELL. */
export interface Shot {
  k: Kind;
  alliance: Alliance;
  /** Decided at launch: will it go in if the CELL is still there when it arrives? */
  hit: boolean;
  from: Pt;
  to: Pt;
  t0: number;
  t1: number;
  /** Which end was open when the shot was fired. */
  end: HiveEnd;
}

export interface Hive {
  /** Which end the upward CELL faces. It swaps every tip. */
  up: HiveEnd;
  /** Elements in the upward CELL, and their weight in POLLEN units. */
  cell: Kind[];
  weight: number;
  /** This HIVE's tip weight. It is re-rolled after every tip. */
  threshold: number;
  /** While the HIVE is rotating, shots bounce off. */
  tippingUntil: number;
  tips: number;
  autoTips: number;
}

/** A FLOWER is a tube. Balls stack from the bottom. NECTAR is too big to pass the middle ring. */
export interface FlowerTube {
  /** POLLEN sitting below the middle ring (not scoring, can be pulled out the bottom). */
  below: number;
  /** Elements in the scoring volume, bottom to top. */
  volume: Kind[];
}

/**
 * A job is what a robot is working on right now. Each job has a place to drive to and
 * something to do once it gets there. jobs.ts carries them out, brain.ts picks them.
 */
export type Job =
  | { type: "collect"; ball: Ball }
  | { type: "collectFlower"; fi: number }
  /**
   * `aimedAt`: where the robot finished lining up (null until then). `nextShot`: when it can fire next.
   * `bumped`: it got knocked off its aim, so its next shot is a little less accurate.
   */
  | { type: "shoot"; spot: Pt; aimedAt: Pt | null; nextShot: number; bumped: boolean; fired: number }
  | { type: "flower"; fi: number; linedUp: boolean; placed: number }
  | { type: "park" }
  | { type: "parked" }
  /** Guard the opponent's shooting lane, or push on one `target` robot that came to shoot. */
  | { type: "defend"; target: Robot | null; until: number }
  | { type: "wait"; spot: Pt | null; until: number; why: string };

export interface Robot {
  idx: number;
  alliance: Alliance;
  slot: 0 | 1;
  profile: RobotProfile;
  role: RoleConfig;
  /** Half the frame width and length, in ft. */
  hw: number;
  hl: number;
  /** How many elements it can hold. */
  cap: number;
  /** Pushing strength: weight times traction. */
  push: number;
  /** Obstacles grown by the robot's size, so the planner can treat the robot as a point. */
  obs: Rect[];
  parkSpot: Pt;
  flowerSpots: Pt[];

  // Where it is and how it's moving.
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Radians. 0 faces +x (toward blue). The intake is on the front. */
  heading: number;
  /** What the driver asks for this step: a velocity, and a direction to face (or null for "any"). */
  cmdx: number;
  cmdy: number;
  face: number | null;

  held: Kind[];
  job: Job | null;
  /** When the current timed action (intake, aim, launch, place) finishes, or null if not doing one. */
  busyUntil: number | null;
  /** Where the robot reached its current job's spot. Small bumps after that don't count as leaving. */
  arrivedAt: Pt | null;
  /** When the current job started or last got something done (a shot, a placement). Set on its first step. */
  progressAt: number | null;
  /** Balls this robot gave up on, and until when it ignores them (ball id → time). */
  skip: Map<number, number>;
  /** When the current collect-then-shoot trip started. */
  tripStart: number;

  // Route following (driving.ts).
  path: Pt[];
  pathGoal: Pt | null;
  pathAt: number;
  stuckTime: number;
  detour: { p: Pt; until: number } | null;

  autoWorks: boolean;
  /** LEAVE and AUTO park, decided at the end of AUTO. */
  left: boolean;
  autoParked: boolean;
  /** How much a defender is slowing this robot down right now (0 to 0.9). */
  slow: number;

  // Defense and the G421 PIN count.
  pinTime: number;
  apartTime: number;
  backOffUntil: number;
}

export interface MatchInput {
  red: Strategy;
  blue: Strategy;
  profiles: [RobotProfile, RobotProfile];
  /** Optional different robots for the blue alliance; defaults to `profiles`. */
  blueProfiles?: [RobotProfile, RobotProfile];
  settings: GameSettings;
  seed: number;
  /** Save a frame every step for the Match viewer. */
  record?: boolean;
}

export interface MatchState {
  t: number;
  dt: number;
  rng: Rng;
  settings: GameSettings;
  record: boolean;
  robots: Robot[];
  balls: Ball[];
  shots: Shot[];
  hives: Record<Alliance, Hive>;
  flowers: FlowerTube[];
  /** NECTAR still waiting in each ALLIANCE AREA. */
  nectarWaiting: Record<Alliance, number>;
  foulCredit: Record<Alliance, number>;
  stats: Record<Alliance, PlayStats>;
  events: MatchEvent[];
  frames: Frame[];
  /** Things scheduled to happen later, like a human player dropping NECTAR. */
  later: { at: number; fn: () => void }[];
  nextBallId: number;
}

// ---------- Small helpers used everywhere ----------

export const log = (m: MatchState, a: Alliance, text: string) => m.events.push({ t: m.t, alliance: a, text });

export const schedule = (m: MatchState, delay: number, fn: () => void) => m.later.push({ at: m.t + delay, fn });

/** A random duration around `secs`, because drivers aren't perfectly consistent. */
export const vary = (m: MatchState, secs: number) => secs * (1 + (m.rng() * 2 - 1) * ACTION_TIME_JITTER);

export const weightOf = (m: MatchState, k: Kind) => (k === "P" ? 1 : m.settings.nectarWeight);

export const teammate = (m: MatchState, r: Robot) => m.robots.find((o) => o.alliance === r.alliance && o !== r)!;

export function spawnBall(m: MatchState, k: Kind, p: Pt, z = 0, vx = 0, vy = 0, vz = 0): Ball {
  const b: Ball = { id: m.nextBallId++, k, x: p.x, y: p.y, z, vx, vy, vz, claimedBy: null };
  m.balls.push(b);
  return b;
}

/** Drop a ball from height `z`, rolling at a random speed between sMin and sMax, in direction `dir` (random if not given). */
export function tossBall(m: MatchState, k: Kind, p: Pt, z: number, sMin: number, sMax: number, dir?: number) {
  const angle = dir ?? m.rng() * Math.PI * 2;
  const speed = sMin + m.rng() * (sMax - sMin);
  spawnBall(m, k, p, z, Math.cos(angle) * speed, Math.sin(angle) * speed, 0);
}

const emptyStats = (): PlayStats => ({ shots: 0, hits: 0, shotDistance: 0, volleys: 0, volleyElements: 0, idleTime: 0, fouls: 0 });

/** 6 in to 18 in, converted to half-size in feet. */
const halfFt = (inches: number) => Math.min(18, Math.max(6, inches)) / 24;

// ---------- Setting up a match (10.3) ----------

export function createMatch(input: MatchInput): MatchState {
  const { settings } = input;
  const rng = mulberry32(input.seed);
  const sampleThreshold = () => settings.tipThreshold + (rng() * 2 - 1) * settings.tipVariance;
  const newHive = (a: Alliance): Hive => {
    const cell = Array.from({ length: NECTAR_IN_CELL }, () => ownNectar(a));
    return { up: START_OPEN_END[a], cell, weight: NECTAR_IN_CELL * settings.nectarWeight, threshold: sampleThreshold(), tippingUntil: 0, tips: 0, autoTips: 0 };
  };

  const m: MatchState = {
    t: 0,
    dt: DT,
    rng,
    settings,
    record: !!input.record,
    robots: [],
    balls: [],
    shots: [],
    hives: { red: newHive("red"), blue: newHive("blue") },
    flowers: FLOWERS.map(() => ({
      below: Math.min(FLOWER_BELOW_SLOTS, POLLEN_PER_FLOWER),
      volume: Array.from({ length: Math.max(0, POLLEN_PER_FLOWER - FLOWER_BELOW_SLOTS) }, () => "P" as Kind),
    })),
    nectarWaiting: { red: NECTAR_IN_ALLIANCE_AREA, blue: NECTAR_IN_ALLIANCE_AREA },
    foulCredit: { red: 0, blue: 0 },
    stats: { red: emptyStats(), blue: emptyStats() },
    events: [],
    frames: [],
    later: [],
    nextBallId: 1,
  };

  // GARDEN POLLEN, in a line from the corner (10.3.1).
  for (const a of ALLIANCES) {
    const g = GARDEN[a];
    for (let i = 0; i < POLLEN_PER_GARDEN; i++) {
      const x = a === "red" ? g.x0 + 0.2 + i * 0.47 : g.x1 - 0.2 - i * 0.47;
      spawnBall(m, "P", { x, y: a === "red" ? BALL_RADIUS.P : 12 - BALL_RADIUS.P });
    }
  }

  for (const a of ALLIANCES) {
    const strategy = a === "red" ? input.red : input.blue;
    const profiles = a === "blue" && input.blueProfiles ? input.blueProfiles : input.profiles;
    for (const slot of [0, 1] as const) {
      const profile = profiles[slot];
      const hw = halfFt(profile.widthIn);
      const hl = halfFt(profile.lengthIn);
      const cap = Math.max(1, Math.min(MAX_HELD, Math.round(profile.capacity)));
      const pose = startPose(a, slot, hl);
      const r: Robot = {
        idx: m.robots.length,
        alliance: a,
        slot,
        profile,
        role: strategy.roles[slot],
        hw,
        hl,
        cap,
        push: Math.max(5, profile.weightLb) * TRACTION[profile.drivetrain],
        obs: inflatedObstacles(Math.max(hw, hl)),
        parkSpot: parkSpot(a, slot, hw, hl),
        flowerSpots: FLOWERS.map((_, fi) => flowerSpot(fi, hl)),
        x: pose.x,
        y: pose.y,
        vx: 0,
        vy: 0,
        heading: pose.heading,
        cmdx: 0,
        cmdy: 0,
        face: null,
        held: [],
        job: null,
        busyUntil: null,
        arrivedAt: null,
        progressAt: null,
        skip: new Map(),
        tripStart: 0,
        path: [],
        pathGoal: null,
        pathAt: -Infinity,
        stuckTime: 0,
        detour: null,
        autoWorks: rng() < profile.autoReliability,
        left: false,
        autoParked: false,
        slow: 0,
        pinTime: 0,
        apartTime: 0,
        backOffUntil: 0,
      };
      m.robots.push(r);
      // 4 preloaded POLLEN per robot. Any it can't hold start on the tiles touching it (10.3.4).
      for (let i = 0; i < PRELOAD_PER_ROBOT; i++) {
        if (i < cap) {
          r.held.push("P");
          continue;
        }
        const side = pose.heading + Math.PI / 2;
        const off = hw + BALL_RADIUS.P + 0.02;
        const along = (i - cap - 0.5) * 0.25 * (slot === 0 ? 1 : -1);
        spawnBall(m, "P", {
          x: pose.x + Math.cos(side) * off + Math.cos(pose.heading) * along,
          y: pose.y + Math.sin(side) * off + Math.sin(pose.heading) * along,
        });
      }
    }
  }
  return m;
}
