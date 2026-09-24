import {
  AUTO_END,
  FIELD,
  FLOWER_BLOCKS,
  FLOWER_UNLOCK,
  FLOWERS,
  GARDEN,
  HIVE_BASE,
  HIVE_POS,
  LOADING_ZONE,
  LZ_DROP,
  MATCH_LENGTH,
  MIN_LAUNCH_DIST,
  TELEOP_START,
  dist,
  flowerService,
  inRect,
  parkSpot,
  startPos,
  type Pt,
  type Rect,
} from "./field";
import { freeSpot, inflatedObstacles, insideRect, pathLength, planPath } from "./nav";
import { mulberry32, type Rng } from "./rng";
import type {
  Alliance,
  Drivetrain,
  Frame,
  GameSettings,
  Kind,
  MatchEvent,
  MatchResult,
  RobotProfile,
  RoleConfig,
  ScoreBreakdown,
  Strategy,
} from "./types";

const DT = 0.1;
/** Seconds between recorded replay frames. */
export const FRAME_DT = 0.1;
const ALLIANCES: Alliance[] = ["red", "blue"];
const GRAVITY = 32.2;
/** Elements under this height get shoved by robot frames. */
const BUMPER_HEIGHT = 0.5;
/** Extra distance past the frame edge an intake can grab from. */
const INTAKE_REACH = 0.35;
/** How hard elements that land on the HIVE footprint roll back out, ft/s². */
const HIVE_ROLL_OUT = 3;

export const BALL_R: Record<Kind, number> = { P: 0.117, R: 0.15, B: 0.15 };
export const TRACTION: Record<Drivetrain, number> = { mecanum: 0.7, tank: 1, swerve: 0.9 };
/** Extra lining-up time per trip: a tank drive has to turn instead of strafing. */
const DRIVETRAIN_ALIGN: Record<Drivetrain, number> = { mecanum: 0, tank: 0.35, swerve: 0 };

const ownNectar = (a: Alliance): Kind => (a === "red" ? "R" : "B");
const opp = (a: Alliance): Alliance => (a === "red" ? "blue" : "red");
const nectarOwner = (k: Kind): Alliance | null => (k === "R" ? "red" : k === "B" ? "blue" : null);

interface Ball {
  id: number;
  k: Kind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  claimedBy: number | null;
}

/** A launched element in the air on its way to the HIVE. */
interface Shot {
  k: Kind;
  alliance: Alliance;
  hit: boolean;
  from: Pt;
  to: Pt;
  apex: number;
  z0: number;
  z1: number;
  t0: number;
  t1: number;
}

interface FlowerState {
  stack: Kind[];
  bottom: number;
}

interface HiveState {
  cell: Kind[];
  weight: number;
  threshold: number;
  tipUntil: number;
  flips: number;
  tips: number;
  autoTips: number;
}

type Target = Pt | (() => Pt);

interface Task {
  to?: Target;
  /** How close (ft) the robot must get to `to` before the task continues. */
  reach?: number;
  dur?: number;
  started?: boolean;
  check?: () => boolean;
  then: () => void;
}

type Mode =
  | "idle"
  | "pickup"
  | "launch"
  | "flower"
  | "park"
  | "parked"
  | "defend"
  | "dead";

interface Robot {
  idx: number;
  alliance: Alliance;
  slot: 0 | 1;
  profile: RobotProfile;
  role: RoleConfig;
  hw: number;
  hl: number;
  cap: number;
  push: number;
  obs: Rect[];
  start: Pt;
  park: Pt;
  service: Pt[];
  x: number;
  y: number;
  vx: number;
  vy: number;
  cmdx: number;
  cmdy: number;
  path: Pt[];
  pathGoal: Pt | null;
  pathAt: number;
  stuckT: number;
  detour: { p: Pt; until: number } | null;
  held: Kind[];
  mode: Mode;
  task: Task | null;
  busyUntil: number;
  autoActive: boolean;
  left: boolean;
  autoParked: boolean;
  slow: number;
  defendTarget: number | null;
}

interface Scheduled {
  at: number;
  fn: () => void;
}

export interface MatchInput {
  red: Strategy;
  blue: Strategy;
  profiles: [RobotProfile, RobotProfile];
  /** Optional different robots for the blue alliance; defaults to `profiles`. */
  blueProfiles?: [RobotProfile, RobotProfile];
  settings: GameSettings;
  seed: number;
  record?: boolean;
}

const halfFt = (inches: number) => Math.min(18, Math.max(6, inches)) / 24;

export function simulateMatch(input: MatchInput): MatchResult {
  const { settings } = input;
  const rng: Rng = mulberry32(input.seed);
  const events: MatchEvent[] = [];
  const frames: Frame[] = [];
  let t = 0;
  let nextId = 1;

  const floor: Ball[] = [];
  const shots: Shot[] = [];
  const flowers: FlowerState[] = FLOWERS.map(() => ({ stack: [], bottom: 4 }));
  const sampleThreshold = () =>
    settings.tipThreshold + (rng() * 2 - 1) * settings.tipVariance;
  const hives: Record<Alliance, HiveState> = {
    red: { cell: [], weight: 0, threshold: sampleThreshold(), tipUntil: 0, flips: 0, tips: 0, autoTips: 0 },
    blue: { cell: [], weight: 0, threshold: sampleThreshold(), tipUntil: 0, flips: 0, tips: 0, autoTips: 0 },
  };
  const areaNectar: Record<Alliance, number> = { red: 5, blue: 5 };
  const foulCredit: Record<Alliance, number> = { red: 0, blue: 0 };
  const scheduled: Scheduled[] = [];

  const weightOf = (k: Kind) => (k === "P" ? 1 : settings.nectarWeight);
  const log = (alliance: Alliance, text: string) => events.push({ t, alliance, text });
  const schedule = (delay: number, fn: () => void) => scheduled.push({ at: t + delay, fn });
  const jitter = (p: Pt, r: number): Pt => ({ x: p.x + (rng() - 0.5) * r, y: p.y + (rng() - 0.5) * r });

  // ---------- ELEMENTS ----------
  const spawn = (k: Kind, p: Pt, z = 0, vx = 0, vy = 0, vz = 0) => {
    const r = BALL_R[k];
    floor.push({
      id: nextId++,
      k,
      x: Math.min(FIELD - r, Math.max(r, p.x)),
      y: Math.min(FIELD - r, Math.max(r, p.y)),
      z,
      vx,
      vy,
      vz,
      claimedBy: null,
    });
  };
  /** Drop an element from height `z` with a random horizontal speed in [sMin, sMax]. */
  const toss = (k: Kind, p: Pt, z: number, sMin: number, sMax: number, dir?: number) => {
    const ang = dir ?? rng() * Math.PI * 2;
    const sp = sMin + rng() * (sMax - sMin);
    spawn(k, p, z, Math.cos(ang) * sp, Math.sin(ang) * sp, 0);
  };
  const grounded = (b: Ball) => b.z <= 0 && b.vz === 0;
  const settled = (b: Ball) => grounded(b) && b.vx * b.vx + b.vy * b.vy < 2.25 && !insideRect(b, HIVE_BASE);

  for (const a of ALLIANCES) {
    for (let i = 0; i < 3; i++) hives[a].cell.push(ownNectar(a));
    hives[a].weight = 3 * settings.nectarWeight;
    const g = GARDEN[a];
    for (let i = 0; i < 4; i++) {
      const fx = a === "red" ? g.x0 + 0.2 + i * 0.47 : g.x1 - 0.2 - i * 0.47;
      spawn("P", { x: fx, y: (g.y0 + g.y1) / 2 });
    }
  }

  // ---------- ROBOTS ----------
  const robots: Robot[] = [];
  for (const a of ALLIANCES) {
    const strat = a === "red" ? input.red : input.blue;
    const profs = a === "blue" && input.blueProfiles ? input.blueProfiles : input.profiles;
    for (const slot of [0, 1] as const) {
      const prof = profs[slot];
      const mate = profs[slot === 0 ? 1 : 0];
      const hw = halfFt(prof.widthIn);
      const hl = halfFt(prof.lengthIn);
      const cap = Math.max(1, Math.min(4, Math.round(prof.capacity)));
      const p = startPos(a, slot, hw);
      robots.push({
        idx: robots.length,
        alliance: a,
        slot,
        profile: prof,
        role: strat.roles[slot],
        hw,
        hl,
        cap,
        push: Math.max(5, prof.weightLb) * TRACTION[prof.drivetrain],
        obs: inflatedObstacles(hw, hl),
        start: p,
        park: parkSpot(a, slot, hw, hl, halfFt(mate.lengthIn)),
        service: FLOWERS.map((_, fi) => flowerService(fi, hl)),
        x: p.x,
        y: p.y,
        vx: 0,
        vy: 0,
        cmdx: 0,
        cmdy: 0,
        path: [],
        pathGoal: null,
        pathAt: -Infinity,
        stuckT: 0,
        detour: null,
        held: Array.from({ length: cap }, () => "P" as Kind),
        mode: "idle",
        task: null,
        busyUntil: 0,
        autoActive: rng() < prof.autoReliability,
        left: false,
        autoParked: false,
        slow: 0,
        defendTarget: null,
      });
      // Preloads a smaller robot can't carry start on the tiles next to it.
      for (let i = cap; i < 4; i++) {
        const dx = a === "red" ? hw + 0.35 : -hw - 0.35;
        spawn("P", { x: p.x + dx, y: p.y + (i - 2.5) * 0.3 });
      }
    }
  }

  const inAuto = () => t < AUTO_END;
  const timeLeft = () => (inAuto() ? AUTO_END - t : MATCH_LENGTH - t);
  const speedFactor = (r: Robot) => (inAuto() ? r.profile.autoSpeed : 1) * (1 - r.slow);
  const topSpeed = (r: Robot) => Math.max(0.3, r.profile.driveSpeed * speedFactor(r));
  const accelOf = (r: Robot) => Math.max(0.5, r.profile.acceleration * (inAuto() ? r.profile.autoSpeed : 1));
  const travel = (r: Robot, p: Pt) => {
    const v = topSpeed(r);
    return pathLength(r, p, r.obs) / v + v / accelOf(r);
  };
  const durScale = (r: Robot) => 1 / Math.max(0.2, speedFactor(r));
  const alignOf = (r: Robot) => r.profile.alignTime + DRIVETRAIN_ALIGN[r.profile.drivetrain];
  const inZone = (r: Robot, z: Rect) =>
    r.x >= z.x0 - r.hw && r.x <= z.x1 + r.hw && r.y >= z.y0 - r.hl && r.y <= z.y1 + r.hl;
  const rectGap = (a: Robot, b: Robot) =>
    Math.max(Math.abs(a.x - b.x) - a.hw - b.hw, Math.abs(a.y - b.y) - a.hl - b.hl, 0);

  // ---------- HIVE ----------
  const tip = (a: Alliance) => {
    const h = hives[a];
    h.tips++;
    if (t < TELEOP_START) h.autoTips++;
    h.flips++;
    const contents = h.cell;
    h.cell = [];
    h.weight = 0;
    h.threshold = sampleThreshold();
    h.tipUntil = t + settings.tipSpinTime + 0.3;
    log(a, `HIVE TIP #${h.tips} (+20)`);
    contents.forEach((k, i) => {
      schedule(settings.tipSpinTime + i * 0.06, () => toss(k, jitter(HIVE_POS[a], 0.4), settings.cellHeight, 0.8, 2.5));
    });
    if (areaNectar[a] > 0 && t < FLOWER_UNLOCK) {
      areaNectar[a]--;
      schedule(settings.tipSpinTime + 2, () => {
        toss(ownNectar(a), jitter(LZ_DROP[a], 0.25), 1, 0.2, 0.8);
        log(a, "Human player entered a NECTAR");
      });
    }
  };

  const addToCell = (a: Alliance, k: Kind) => {
    const h = hives[a];
    h.cell.push(k);
    h.weight += weightOf(k);
    if (h.weight >= h.threshold) tip(a);
  };

  /** A shot that bounced off the HIVE and fell back to the tiles. */
  const bounceOff = (k: Kind, a: Alliance, from: Pt) => {
    const h = HIVE_POS[a];
    const back = Math.atan2(from.y - h.y, from.x - h.x);
    toss(k, jitter(h, 0.5), settings.cellHeight * 0.8, 1.5, 5, back + (rng() - 0.5) * Math.PI * 1.4);
  };

  // ---------- FLOWERS ----------
  const topNectar = (f: FlowerState): Alliance | null => {
    for (let i = f.stack.length - 1; i >= 0; i--) {
      const o = nectarOwner(f.stack[i]);
      if (o) return o;
    }
    return null;
  };
  const bottomNectar = (f: FlowerState): Alliance | null => {
    for (const k of f.stack) {
      const o = nectarOwner(k);
      if (o) return o;
    }
    return null;
  };
  const topNectarOf = (stack: Kind[]) => topNectar({ stack, bottom: 0 });

  /** Simulate a FLOWER trip, returning points gained and elements used. */
  const planFlower = (a: Alliance, fi: number, held: Kind[], mode: RoleConfig["flowerMode"]) => {
    const f = flowers[fi];
    const stack = [...f.stack];
    let n = held.filter((k) => k === ownNectar(a)).length;
    let p = held.filter((k) => k === "P").length;
    let value = 0;
    let used = 0;
    let nectarUsed = 0;
    while (stack.length < settings.flowerCapacity) {
      const owner = topNectarOf(stack);
      if (owner !== a && n > 0) {
        if (owner === null) value += 5 + 2;
        else value += 2 + 4 * stack.length;
        stack.push(ownNectar(a));
        n--;
        used++;
        nectarUsed++;
        if (mode === "cap") break;
      } else if (owner === a && p > 0 && mode === "fill") {
        value += 2;
        stack.push("P");
        p--;
        used++;
      } else break;
    }
    return { value, used, nectarUsed };
  };

  // ---------- ROBOT ACTIONS ----------
  const setTask = (r: Robot, mode: Mode, task: Task) => {
    r.mode = mode;
    r.task = task;
  };

  const idle = (r: Robot, secs = 0.3) => setTask(r, r.mode === "parked" ? "parked" : "idle", { dur: secs, then: () => {} });

  const eligibleForHive = (r: Robot, ammo: RoleConfig["ammo"]) => (k: Kind) =>
    k === "P" || (ammo === "all" && k === ownNectar(r.alliance));

  type Pickup = { kind: "floor"; e: Ball; score: number; d: number } | { kind: "flower"; fi: number; score: number; d: number };

  const bestPickup = (r: Robot, want: (k: Kind) => boolean, valueOf: (k: Kind) => number, near?: Pt): Pickup | null => {
    let best: Pickup | null = null;
    const auto = inAuto();
    for (const e of floor) {
      if (!settled(e)) continue;
      if (e.claimedBy !== null && e.claimedBy !== r.idx) continue;
      if (!want(e.k)) continue;
      if (e.k !== "P" && e.k !== ownNectar(r.alliance)) continue;
      if (auto && (r.alliance === "red" ? e.x > 6 : e.x < 6)) continue;
      const d = dist(r, e);
      const extra = near ? dist(e, near) * 0.35 : 0;
      const score = (d + extra + 0.5) / valueOf(e.k);
      if (!best || score < best.score) best = { kind: "floor", e, score, d };
    }
    if (want("P")) {
      r.service.forEach((s, fi) => {
        if (flowers[fi].bottom <= 0) return;
        if (auto && (r.alliance === "red" ? s.x > 6 : s.x < 6)) return;
        const d = dist(r, s);
        const extra = near ? dist(s, near) * 0.35 : 0;
        const score = (d + extra + 1.2) / valueOf("P");
        if (!best || score < best.score) best = { kind: "flower", fi, score, d };
      });
    }
    return best;
  };

  const approach = (from: Pt, to: Pt, stop: number): Pt => {
    const d = dist(from, to);
    if (d <= stop) return { x: from.x, y: from.y };
    const k = (d - stop) / d;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };

  const goPickup = (r: Robot, p: Pickup) => {
    if (p.kind === "floor") {
      const e = p.e;
      e.claimedBy = r.idx;
      const reach = Math.max(r.hw, r.hl) + BALL_R[e.k] + 0.05;
      const alive = () => floor.includes(e) && e.claimedBy === r.idx;
      setTask(r, "pickup", {
        to: () => freeSpot(approach(r, e, reach), r.hw, r.hl, r.obs),
        reach: 0.15,
        dur: r.profile.intakeTime,
        check: alive,
        then: () => {
          if (!alive()) return;
          if (!grounded(e) || dist(r, e) > reach + INTAKE_REACH) {
            e.claimedBy = null;
            return;
          }
          floor.splice(floor.indexOf(e), 1);
          r.held.push(e.k);
        },
      });
    } else {
      const fi = p.fi;
      setTask(r, "pickup", {
        to: r.service[fi],
        dur: r.profile.intakeTime * 1.3,
        check: () => flowers[fi].bottom > 0,
        then: () => {
          if (flowers[fi].bottom <= 0) return;
          flowers[fi].bottom--;
          r.held.push("P");
        },
      });
    }
  };

  const releaseClaims = (r: Robot) => {
    for (const e of floor) if (e.claimedBy === r.idx) e.claimedBy = null;
  };

  const validSpot = (r: Robot, p: Pt) =>
    p.x >= r.hw && p.x <= FIELD - r.hw && p.y >= r.hl && p.y <= FIELD - r.hl && !r.obs.some((o) => insideRect(p, o));

  /** Pick a legal spot in launch range that is quickest to reach and not on a teammate. */
  const launchSpot = (r: Robot): Pt => {
    const h = HIVE_POS[r.alliance];
    const d = dist(r, h);
    const range = Math.max(MIN_LAUNCH_DIST + 0.3, r.profile.launchRange);
    const mate = robots.find((o) => o.alliance === r.alliance && o !== r);
    const clearOfMate = (p: Pt) => !mate || Math.abs(p.x - mate.x) > r.hw + mate.hw + 0.1 || Math.abs(p.y - mate.y) > r.hl + mate.hl + 0.1;
    const auto = inAuto();
    const ownHalf = (p: Pt) => !auto || (r.alliance === "red" ? p.x <= 6 - r.hw : p.x >= 6 + r.hw);
    if (d >= MIN_LAUNCH_DIST && d <= range && ownHalf(r)) return { x: r.x, y: r.y };
    const radii = [Math.min(range - 0.2, Math.max(MIN_LAUNCH_DIST + 0.2, d)), range - 0.2, MIN_LAUNCH_DIST + 0.2];
    let best: Pt | null = null;
    let bestCost = Infinity;
    for (const rad of radii) {
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2;
        const p = { x: h.x + Math.cos(ang) * rad, y: h.y + Math.sin(ang) * rad };
        if (!validSpot(r, p) || !ownHalf(p)) continue;
        const cost = pathLength(r, p, r.obs) + (clearOfMate(p) ? 0 : 3);
        if (cost < bestCost) {
          bestCost = cost;
          best = p;
        }
      }
      if (best) break;
    }
    return best ?? freeSpot(approach(r, h, MIN_LAUNCH_DIST + 0.2), r.hw, r.hl, r.obs);
  };

  const goLaunch = (r: Robot, ammo: RoleConfig["ammo"]) => {
    const eligible = eligibleForHive(r, ammo);
    const fire = () => {
      const i = r.held.findIndex(eligible);
      if (i < 0) return;
      const h = hives[r.alliance];
      if (h.tipUntil > t) {
        setTask(r, "launch", { dur: h.tipUntil - t, then: fire });
        return;
      }
      const k = r.held.splice(i, 1)[0];
      const acc = k === "P" ? r.profile.pollenAccuracy : r.profile.nectarAccuracy;
      const to = HIVE_POS[r.alliance];
      const d = dist(r, to);
      const flight = Math.max(0.25, d / (0.72 * Math.max(4, r.profile.shotSpeed)));
      shots.push({
        k,
        alliance: r.alliance,
        hit: rng() < acc,
        from: { x: r.x, y: r.y },
        to,
        apex: 0.6 + d * 0.18,
        z0: 1,
        z1: settings.cellHeight,
        t0: t,
        t1: t + flight,
      });
      if (r.held.some(eligible)) setTask(r, "launch", { dur: r.profile.launchTime, then: fire });
    };
    setTask(r, "launch", {
      to: launchSpot(r),
      reach: 0.2,
      dur: alignOf(r) + r.profile.launchTime,
      then: fire,
    });
  };

  const goPark = (r: Robot) => {
    setTask(r, "park", {
      to: r.park,
      reach: 0.2,
      then: () => {
        r.task = { dur: 999, then: () => {} };
        r.mode = "parked";
      },
    });
  };

  const goPlace = (r: Robot, fi: number) => {
    const mode = r.role.flowerMode;
    let placedHere = 0;
    const placeNext = () => {
      if (t < FLOWER_UNLOCK) return;
      const f = flowers[fi];
      if (f.stack.length >= settings.flowerCapacity) return;
      const owner = topNectar(f);
      const own = ownNectar(r.alliance);
      let k: Kind | null = null;
      if (owner !== r.alliance && r.held.includes(own) && !(mode === "cap" && placedHere > 0)) k = own;
      else if (owner === r.alliance && mode === "fill" && r.held.includes("P")) k = "P";
      if (!k) return;
      const kind = k;
      setTask(r, "flower", {
        dur: r.profile.flowerTime,
        then: () => {
          r.held.splice(r.held.indexOf(kind), 1);
          const fl = flowers[fi];
          if (rng() < r.profile.flowerAccuracy && fl.stack.length < settings.flowerCapacity) {
            const before = topNectar(fl);
            if (kind === "P" && bottomNectar(fl) === null) fl.bottom++;
            else fl.stack.push(kind);
            if (kind !== "P") {
              if (before === null) log(r.alliance, `Claimed FLOWER ${fi + 1} (bottom NECTAR +5)`);
              else if (before !== r.alliance) log(r.alliance, `Stole FLOWER ${fi + 1} from ${before}`);
            }
          } else {
            const fl0 = FLOWERS[fi];
            const out = fl0.y < 6 ? Math.PI / 2 : -Math.PI / 2;
            toss(kind, { x: fl0.x + (rng() - 0.5) * 0.6, y: fl0.y < 6 ? fl0.y + 0.5 : fl0.y - 0.5 }, 1.6, 0.4, 1.6, out + (rng() - 0.5) * 2);
          }
          placedHere++;
          placeNext();
        },
      });
    };
    setTask(r, "flower", {
      to: r.service[fi],
      reach: 0.15,
      dur: alignOf(r),
      then: placeNext,
    });
  };

  const bestFlowerTrip = (r: Robot) => {
    let best: { fi: number; value: number; rate: number; used: number } | null = null;
    r.service.forEach((s, fi) => {
      const plan = planFlower(r.alliance, fi, r.held, r.role.flowerMode);
      if (plan.value <= 0) return;
      const time = travel(r, s) + alignOf(r) + plan.used * r.profile.flowerTime;
      const rate = plan.value / (time + 1);
      if (!best || rate > best.rate) best = { fi, value: plan.value, rate, used: plan.used };
    });
    return best as { fi: number; value: number; rate: number; used: number } | null;
  };

  const flowerOpportunity = (a: Alliance, mode: RoleConfig["flowerMode"]) =>
    flowers.some((_, fi) => planFlower(a, fi, [ownNectar(a)], mode).value >= 5);

  const decideFlower = (r: Robot): boolean => {
    const own = ownNectar(r.alliance);
    const mode = r.role.flowerMode;
    const heldN = r.held.filter((k) => k === own).length;
    const heldP = r.held.filter((k) => k === "P").length;
    const reserve = r.role.park ? travel(r, r.park) + 1.5 : 0;
    const tl = timeLeft() - reserve;

    const trip = bestFlowerTrip(r);
    if (trip) {
      const need = travel(r, r.service[trip.fi]) + alignOf(r) + trip.used * r.profile.flowerTime;
      if (r.held.length >= r.cap || tl < need + 3 || (mode === "cap" && heldN >= r.cap)) {
        goPlace(r, trip.fi);
        return true;
      }
    }

    const wantN = mode === "cap" ? r.cap : heldN === 0 && flowerOpportunity(r.alliance, mode) ? 1 : 0;
    const wantP = mode === "cap" ? 0 : r.cap - Math.max(heldN, wantN);
    const target = trip ? r.service[trip.fi] : undefined;

    if (heldN < wantN) {
      const p = bestPickup(r, (k) => k === own, () => 1, target);
      if (p && p.d / r.profile.driveSpeed < tl - 4) {
        goPickup(r, p);
        return true;
      }
    }
    const ownsSpace = flowers.some((f) => topNectar(f) === r.alliance && f.stack.length < settings.flowerCapacity);
    if (heldP < wantP && (heldN > 0 || ownsSpace)) {
      const p = bestPickup(r, (k) => k === "P", () => 1, target);
      if (p && p.d / r.profile.driveSpeed < tl - 4) {
        goPickup(r, p);
        return true;
      }
    }
    if (trip) {
      goPlace(r, trip.fi);
      return true;
    }
    return false;
  };

  const decideHive = (r: Robot, ammo: RoleConfig["ammo"]) => {
    const eligible = eligibleForHive(r, ammo);
    const launchable = r.held.filter(eligible).length;
    const pick = r.held.length < r.cap ? bestPickup(r, eligible, (k) => weightOf(k), HIVE_POS[r.alliance]) : null;
    if (launchable > 0) {
      const spot = launchSpot(r);
      const need = travel(r, spot) + alignOf(r) + launchable * r.profile.launchTime + 0.5;
      const reserve = !inAuto() && r.role.park ? travel(r, r.park) + 1.5 : 0;
      const pickCost = pick ? pick.d / topSpeed(r) + r.profile.intakeTime : Infinity;
      if (r.held.length >= r.cap || !pick || pick.d > 4.5 || timeLeft() - reserve < need + pickCost + 0.5) {
        goLaunch(r, ammo);
        return;
      }
    }
    if (pick) {
      goPickup(r, pick);
      return;
    }
    idle(r, 0.4);
  };

  const decideDefend = (r: Robot) => {
    const targets = robots.filter((o) => o.alliance !== r.alliance && o.mode !== "parked" && o.mode !== "park");
    if (targets.length === 0) {
      idle(r, 0.5);
      return;
    }
    targets.sort((a, b) => dist(r, a) - dist(r, b));
    const scorer = targets.find((o) => !o.role.defend) ?? targets[0];
    r.defendTarget = scorer.idx;
    setTask(r, "defend", {
      to: () => freeSpot(approach(r, scorer, Math.max(r.hw, r.hl) + Math.max(scorer.hw, scorer.hl)), r.hw, r.hl, r.obs),
      reach: 0.3,
      dur: 0.1,
      then: () => {},
    });
  };

  const decide = (r: Robot) => {
    if (r.mode === "parked") {
      idle(r, 1);
      return;
    }
    const auto = inAuto();
    if (auto && !r.autoActive) {
      r.mode = "dead";
      r.task = { dur: AUTO_END - t + 0.01, then: () => {} };
      return;
    }
    if (parkDue(r)) {
      goPark(r);
      return;
    }
    if (!auto && r.role.defend) {
      decideDefend(r);
      return;
    }
    const tl = timeLeft();
    const flowerMode = !auto && r.role.flowerStart !== null && tl <= Math.min(60, r.role.flowerStart);
    if (flowerMode && decideFlower(r)) return;
    decideHive(r, r.role.ammo);
  };

  const parkDue = (r: Robot) => {
    if (r.mode === "park" || r.mode === "parked" || r.mode === "dead") return false;
    const wantsPark = inAuto() ? r.profile.autoPark : r.role.park;
    if (!wantsPark) return false;
    // Real driving is slower than the straight-line estimate once robots have to
    // route around the HIVE and each other, so leave a few seconds early.
    return timeLeft() <= travel(r, r.park) * 1.2 + (inAuto() ? 1 : 4.5);
  };

  // ---------- DRIVING ----------
  const resolve = (to: Target): Pt => (typeof to === "function" ? to() : to);

  const giveUp = (r: Robot) => {
    releaseClaims(r);
    r.task = null;
    if (r.mode !== "parked") r.mode = "idle";
    r.stuckT = 0;
    r.detour = null;
  };

  /** Set the robot's commanded velocity toward `goal`, routing around obstacles and other robots. */
  const drive = (r: Robot, goal: Pt, tol: number) => {
    if (!r.pathGoal || dist(r.pathGoal, goal) > 1 || t - r.pathAt > 1.2) {
      r.path = planPath(r, goal, r.hw, r.hl, r.obs);
      r.pathGoal = goal;
      r.pathAt = t;
    }
    r.path[r.path.length - 1] = goal;
    while (r.path.length > 1 && dist(r, r.path[0]) < 0.3) r.path.shift();
    let wp = r.path[0] ?? goal;
    let remaining = dist(r, wp);
    for (let i = 1; i < r.path.length; i++) remaining += dist(r.path[i - 1], r.path[i]);
    if (r.detour) {
      if (t < r.detour.until && dist(r, r.detour.p) > 0.2) {
        wp = r.detour.p;
        remaining = Math.max(remaining, dist(r, wp) + 1);
      } else r.detour = null;
    }

    const d = Math.max(1e-6, dist(r, wp));
    let dx = (wp.x - r.x) / d;
    let dy = (wp.y - r.y) / d;

    const reach = Math.max(r.hw, r.hl);
    let steer = 0;
    for (const o of robots) {
      if (o === r) continue;
      if (r.mode === "defend" && o.idx === r.defendTarget) continue;
      const rx = o.x - r.x;
      const ry = o.y - r.y;
      const along = rx * dx + ry * dy;
      if (along <= 0 || along > 2.4 || along > remaining + 0.5) continue;
      const lat = -rx * dy + ry * dx;
      const clear = reach + Math.max(o.hw, o.hl) + 0.1;
      if (Math.abs(lat) >= clear) continue;
      const w = (1 - along / 2.4) * (1 - Math.abs(lat) / clear);
      steer += (lat >= 0 ? -1 : 1) * w * 1.4;
    }
    if (steer !== 0) {
      const nx = dx - dy * steer;
      const ny = dy + dx * steer;
      const n = Math.hypot(nx, ny);
      dx = nx / n;
      dy = ny / n;
    }

    const vmax = topSpeed(r);
    const a = accelOf(r);
    const speed = Math.min(vmax, Math.sqrt(2 * a * Math.max(0, remaining - tol * 0.5)) + 0.25);
    r.cmdx = dx * speed;
    r.cmdy = dy * speed;

    if (r.mode === "defend") return;
    const actual = Math.hypot(r.vx, r.vy);
    if (r.mode === "park") {
      if (speed > 0.6 && actual < 0.35 * Math.min(speed, vmax)) r.stuckT += DT;
      else r.stuckT = Math.max(0, r.stuckT - DT);
      if (r.stuckT > 0.45 && !r.detour) {
        const side = rng() < 0.5 ? -1 : 1;
        r.detour = {
          p: freeSpot({ x: r.x - dy * side * 1.4, y: r.y + dx * side * 1.4 }, r.hw, r.hl, r.obs),
          until: t + 0.7,
        };
        r.stuckT = 0;
        r.pathAt = -Infinity;
      }
      return;
    }
    if (speed > 0.8 && actual < 0.3 * Math.min(speed, vmax)) r.stuckT += DT;
    else r.stuckT = Math.max(0, r.stuckT - DT * 0.5);
    if (r.stuckT > 0.8 && !r.detour) {
      const side = rng() < 0.5 ? -1 : 1;
      const p = freeSpot({ x: r.x - dy * side * 1.5 - dx * 0.4, y: r.y + dx * side * 1.5 - dy * 0.4 }, r.hw, r.hl, r.obs);
      r.detour = { p, until: t + 1.2 };
    }
    if (r.stuckT > 3) giveUp(r);
  };

  const step = (r: Robot) => {
    r.cmdx = 0;
    r.cmdy = 0;
    if (parkDue(r)) {
      releaseClaims(r);
      goPark(r);
    }
    if (!r.task) decide(r);
    for (let guard = 0; guard < 6 && r.task; guard++) {
      const task: Task = r.task;
      if (task.check && !task.check()) {
        releaseClaims(r);
        r.task = null;
        decide(r);
        continue;
      }
      if (task.to) {
        const goal = resolve(task.to);
        const tol = task.reach ?? 0.12;
        if (dist(r, goal) > tol) {
          drive(r, goal, tol);
          return;
        }
        task.to = undefined;
        r.stuckT = 0;
        r.detour = null;
      }
      if (!task.started) {
        task.started = true;
        r.busyUntil = t + (task.dur ?? 0) * durScale(r);
      }
      if (t + 1e-9 < r.busyUntil) return;
      r.task = null;
      task.then();
      const next = r.task as Task | null;
      if (!next) decide(r);
      else if (next.to || (next.dur ?? 0) > 0) return;
    }
  };

  // ---------- PHYSICS ----------
  const moveRobots = () => {
    for (const r of robots) {
      const a = accelOf(r) * DT;
      let ax = r.cmdx - r.vx;
      let ay = r.cmdy - r.vy;
      const m = Math.hypot(ax, ay);
      if (m > a) {
        ax = (ax / m) * a;
        ay = (ay / m) * a;
      }
      r.vx += ax;
      r.vy += ay;
      r.x += r.vx * DT;
      r.y += r.vy * DT;
    }
  };

  /** Push a robot (as a point) out of an inflated obstacle, killing velocity into it. */
  const pushOutOf = (r: Robot, o: Rect) => {
    if (!insideRect(r, o)) return;
    const opts = [
      { d: r.x - o.x0, ax: "x" as const, v: o.x0 },
      { d: o.x1 - r.x, ax: "x" as const, v: o.x1 },
      { d: r.y - o.y0, ax: "y" as const, v: o.y0 },
      { d: o.y1 - r.y, ax: "y" as const, v: o.y1 },
    ].sort((p, q) => p.d - q.d);
    const e = opts[0];
    if (e.ax === "x") {
      r.x = e.v;
      r.vx = 0;
    } else {
      r.y = e.v;
      r.vy = 0;
    }
  };

  const collideRobots = () => {
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < robots.length; i++) {
        for (let j = i + 1; j < robots.length; j++) {
          const a = robots[i];
          const b = robots[j];
          const ox = a.hw + b.hw - Math.abs(b.x - a.x);
          const oy = a.hl + b.hl - Math.abs(b.y - a.y);
          if (ox <= 0 || oy <= 0) continue;
          const pa = a.mode === "parked" ? a.push * 40 : a.push;
          const pb = b.mode === "parked" ? b.push * 40 : b.push;
          const shareA = pb / (pa + pb);
          const shareB = 1 - shareA;
          if (ox < oy) {
            const s = b.x >= a.x ? 1 : -1;
            a.x -= s * ox * shareA;
            b.x += s * ox * shareB;
            if ((b.vx - a.vx) * s < 0) {
              const v = (a.push * a.vx + b.push * b.vx) / (a.push + b.push);
              a.vx = v;
              b.vx = v;
            }
          } else {
            const s = b.y >= a.y ? 1 : -1;
            a.y -= s * oy * shareA;
            b.y += s * oy * shareB;
            if ((b.vy - a.vy) * s < 0) {
              const v = (a.push * a.vy + b.push * b.vy) / (a.push + b.push);
              a.vy = v;
              b.vy = v;
            }
          }
        }
      }
      for (const r of robots) {
        for (const o of OBSTACLE_CACHE.get(r)!) pushOutOf(r, o);
        if (r.x < r.hw) (r.x = r.hw), (r.vx = Math.max(0, r.vx));
        if (r.x > FIELD - r.hw) (r.x = FIELD - r.hw), (r.vx = Math.min(0, r.vx));
        if (r.y < r.hl) (r.y = r.hl), (r.vy = Math.max(0, r.vy));
        if (r.y > FIELD - r.hl) (r.y = FIELD - r.hl), (r.vy = Math.min(0, r.vy));
      }
    }
  };
  const OBSTACLE_CACHE = new Map<Robot, Rect[]>(
    robots.map((r) => [r, [HIVE_BASE, ...FLOWER_BLOCKS].map((o) => ({ x0: o.x0 - r.hw, y0: o.y0 - r.hl, x1: o.x1 + r.hw, y1: o.y1 + r.hl }))]),
  );

  const landShots = () => {
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i];
      if (s.t1 > t + 1e-9) continue;
      shots.splice(i, 1);
      if (s.hit && hives[s.alliance].tipUntil <= t) addToCell(s.alliance, s.k);
      else bounceOff(s.k, s.alliance, s.from);
    }
  };

  const bounceWall = (b: Ball, r: number) => {
    if (b.x < r) (b.x = r), (b.vx = Math.abs(b.vx) * 0.4);
    if (b.x > FIELD - r) (b.x = FIELD - r), (b.vx = -Math.abs(b.vx) * 0.4);
    if (b.y < r) (b.y = r), (b.vy = Math.abs(b.vy) * 0.4);
    if (b.y > FIELD - r) (b.y = FIELD - r), (b.vy = -Math.abs(b.vy) * 0.4);
  };

  /** Resolve a ball against a solid box, returning the push-out normal if they touched. */
  const boxOut = (b: Ball, x0: number, y0: number, x1: number, y1: number): [number, number] | null => {
    if (b.x <= x0 || b.x >= x1 || b.y <= y0 || b.y >= y1) return null;
    const l = b.x - x0;
    const rr = x1 - b.x;
    const d = b.y - y0;
    const u = y1 - b.y;
    const m = Math.min(l, rr, d, u);
    if (m === l) return (b.x = x0), [-1, 0];
    if (m === rr) return (b.x = x1), [1, 0];
    if (m === d) return (b.y = y0), [0, -1];
    return (b.y = y1), [0, 1];
  };

  const moveBalls = () => {
    for (const b of floor) {
      const br = BALL_R[b.k];
      const airborne = b.z > 0 || b.vz !== 0;
      const moving = airborne || b.vx !== 0 || b.vy !== 0;
      if (airborne) {
        b.vz -= GRAVITY * DT;
        b.z += b.vz * DT;
        if (b.z <= 0) {
          b.z = 0;
          if (b.vz < -6) {
            b.vz = -b.vz * 0.25;
            b.vx *= 0.8;
            b.vy *= 0.8;
          } else {
            b.vz = 0;
            b.vx *= 0.85;
            b.vy *= 0.85;
          }
        }
      }
      if (moving) {
        b.x += b.vx * DT;
        b.y += b.vy * DT;
      }
      if (b.z <= 0 && b.vz === 0) {
        if (insideRect(b, HIVE_BASE)) {
          const ex = b.x < 6 ? -(b.x - HIVE_BASE.x0) : HIVE_BASE.x1 - b.x;
          const ey = b.y < 6 ? -(b.y - HIVE_BASE.y0) : HIVE_BASE.y1 - b.y;
          if (Math.abs(ex) < Math.abs(ey)) b.vx += Math.sign(ex) * HIVE_ROLL_OUT * DT;
          else b.vy += Math.sign(ey) * HIVE_ROLL_OUT * DT;
          if (Math.hypot(b.vx, b.vy) < 0.6) {
            if (Math.abs(ex) < Math.abs(ey)) b.vx = Math.sign(ex) * 0.6;
            else b.vy = Math.sign(ey) * 0.6;
          }
        } else if (moving) {
          const sp = Math.hypot(b.vx, b.vy);
          const ns = sp - settings.ballFriction * DT;
          if (ns <= 0.05) {
            b.vx = 0;
            b.vy = 0;
          } else {
            b.vx *= ns / sp;
            b.vy *= ns / sp;
          }
        }
      }
      bounceWall(b, br);
      if (b.z < 1.2) {
        for (const f of FLOWER_BLOCKS) {
          const n = boxOut(b, f.x0 - br, f.y0 - br, f.x1 + br, f.y1 + br);
          if (!n) continue;
          if (n[0] !== 0 && b.vx * n[0] < 0) b.vx = -b.vx * 0.4;
          if (n[1] !== 0 && b.vy * n[1] < 0) b.vy = -b.vy * 0.4;
        }
      }
      if (b.z < BUMPER_HEIGHT) {
        for (const r of robots) {
          if (b.claimedBy === r.idx && r.mode === "pickup") continue;
          const n = boxOut(b, r.x - r.hw - br, r.y - r.hl - br, r.x + r.hw + br, r.y + r.hl + br);
          if (!n) continue;
          // Bulldozed: the element picks up the robot's speed along the contact normal.
          if (n[0] !== 0) {
            const push = r.vx * n[0];
            if (b.vx * n[0] < push + 0.2) b.vx = n[0] * (Math.max(0, push) * 1.15 + 0.2);
          } else {
            const push = r.vy * n[1];
            if (b.vy * n[1] < push + 0.2) b.vy = n[1] * (Math.max(0, push) * 1.15 + 0.2);
          }
        }
        bounceWall(b, br);
      }
    }
  };

  // ---------- SCORING ----------
  const liveScore = (a: Alliance, final: boolean): ScoreBreakdown => {
    const h = hives[a];
    const mine = robots.filter((r) => r.alliance === a);
    const leave = t >= AUTO_END ? mine.filter((r) => r.left).length * 3 : 0;
    const autoPark = mine.filter((r) => r.autoParked).length * 5;
    const park = final ? mine.filter((r) => inZone(r, LOADING_ZONE[a])).length * 5 : 0;
    let flowerBottom = 0;
    let flowerOwned = 0;
    for (const f of flowers) {
      if (bottomNectar(f) === a) flowerBottom += 5;
      if (topNectar(f) === a) flowerOwned += 2 * f.stack.length;
    }
    const garden = floor.filter((e) => e.z <= 0 && inRect(e, GARDEN[a], 0.12)).length;
    const cell = h.cell.length * 2;
    const autoTips = h.autoTips * 20;
    const teleopTips = (h.tips - h.autoTips) * 20;
    const total =
      leave + autoPark + park + flowerBottom + flowerOwned + garden + cell + autoTips + teleopTips + foulCredit[a];
    const swarm = leave + autoPark + park >= 16;
    return {
      leave,
      autoPark,
      autoTips,
      teleopTips,
      cell,
      flowerBottom,
      flowerOwned,
      garden,
      park,
      foulCredit: foulCredit[a],
      total,
      tips: h.tips,
      rp: 0,
      swarmRP: final && swarm,
      pollinator1: h.tips >= 4,
      pollinator2: h.tips >= 7,
    };
  };

  const record = () => {
    const air = shots.map((s) => {
      const u = Math.min(1, Math.max(0, (t - s.t0) / (s.t1 - s.t0)));
      return {
        x: s.from.x + (s.to.x - s.from.x) * u,
        y: s.from.y + (s.to.y - s.from.y) * u,
        z: s.z0 + (s.z1 - s.z0) * u + 4 * s.apex * u * (1 - u),
        k: s.k,
      };
    });
    frames.push({
      t,
      robots: robots.map((r) => ({ x: r.x, y: r.y, hw: r.hw, hl: r.hl, held: [...r.held], mode: r.mode })),
      floor: [...floor.map((e) => ({ x: e.x, y: e.y, z: Math.max(0, e.z), k: e.k })), ...air],
      cells: { red: [...hives.red.cell], blue: [...hives.blue.cell] },
      hiveFlip: { red: hives.red.flips, blue: hives.blue.flips },
      flowers: flowers.map((f) => ({ stack: [...f.stack], bottom: f.bottom })),
      score: { red: liveScore("red", false).total, blue: liveScore("blue", false).total },
    });
  };

  // ---------- MAIN LOOP ----------
  const steps = Math.round(MATCH_LENGTH / DT);
  let autoClosed = false;
  let flowersOpened = false;
  let lastFrame = -Infinity;
  for (let s = 0; s <= steps; s++) {
    t = s * DT;

    for (let i = scheduled.length - 1; i >= 0; i--) {
      if (scheduled[i].at <= t + 1e-9) {
        const ev = scheduled.splice(i, 1)[0];
        ev.fn();
      }
    }

    if (!autoClosed && t >= AUTO_END) {
      autoClosed = true;
      for (const r of robots) {
        if (inZone(r, LOADING_ZONE[r.alliance])) r.autoParked = true;
        releaseClaims(r);
        r.task = null;
        r.mode = "idle";
        r.detour = null;
        r.stuckT = 0;
      }
    }

    if (!flowersOpened && t >= FLOWER_UNLOCK) {
      flowersOpened = true;
      for (const a of ALLIANCES) {
        const n = areaNectar[a];
        areaNectar[a] = 0;
        if (n > 0) log(a, `Endgame: ${n} NECTAR entered, FLOWERS unlocked`);
        for (let i = 0; i < n; i++) {
          schedule(0.5 + i * 0.8, () => toss(ownNectar(a), jitter(LZ_DROP[a], 0.4), 1, 0.2, 0.8));
        }
      }
    }

    const active = t < AUTO_END || (t >= TELEOP_START && t < MATCH_LENGTH);
    if (active) {
      for (const r of robots) r.slow = 0;
      if (!inAuto()) {
        for (const d of robots) {
          if (!d.role.defend || d.defendTarget === null || d.mode !== "defend") continue;
          const target = robots[d.defendTarget];
          if (rectGap(d, target) < 0.35 && target.mode !== "parked") {
            const leverage = Math.min(1.5, Math.max(0.5, d.push / target.push));
            target.slow = Math.min(0.9, Math.max(target.slow, settings.defenseEffect * leverage));
            if (rng() < (settings.defenseFoulRate / 60) * DT) {
              foulCredit[target.alliance] += 20;
              log(d.alliance, "MAJOR FOUL on defense (+20 to opponent)");
            }
          }
        }
      }
      for (const r of robots) step(r);
    } else {
      for (const r of robots) {
        r.cmdx = 0;
        r.cmdy = 0;
      }
    }
    moveRobots();
    collideRobots();
    if (inAuto()) {
      for (const r of robots) if (!r.left && dist(r, r.start) > 0.3) r.left = true;
    }

    landShots();
    moveBalls();

    if (input.record && t - lastFrame >= FRAME_DT - 1e-9) {
      record();
      lastFrame = t;
    }
  }

  t = MATCH_LENGTH;
  const red = liveScore("red", true);
  const blue = liveScore("blue", true);
  const winner: MatchResult["winner"] = red.total > blue.total ? "red" : blue.total > red.total ? "blue" : "tie";
  for (const [a, sc] of [["red", red], ["blue", blue]] as const) {
    sc.rp =
      (winner === a ? 3 : winner === "tie" ? 1 : 0) +
      (sc.swarmRP ? 1 : 0) +
      (sc.pollinator1 ? 1 : 0) +
      (sc.pollinator2 ? 1 : 0);
    const parked = robots.filter((r) => r.alliance === a && inZone(r, LOADING_ZONE[a])).length;
    if (parked > 0) events.push({ t, alliance: a, text: `${parked} robot(s) parked (+${parked * 5})` });
  }
  if (input.record) record();
  events.sort((x, y) => x.t - y.t);

  return { red, blue, winner, events, frames: input.record ? frames : undefined };
}

export { opp };
