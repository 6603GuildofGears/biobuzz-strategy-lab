import {
  AUTO_END,
  FLOWER_SERVICE,
  FLOWER_UNLOCK,
  FLOWERS,
  GARDEN,
  HIVE_POS,
  LOADING_ZONE,
  LZ_DROP,
  MATCH_LENGTH,
  MIN_LAUNCH_DIST,
  PARK_SPOT,
  ROBOT_HALF,
  START_POS,
  TELEOP_START,
  clampField,
  dist,
  inRect,
  type Pt,
} from "./field";
import { mulberry32, type Rng } from "./rng";
import type {
  Alliance,
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
const FRAME_EVERY = 0.25;
const ALLIANCES: Alliance[] = ["red", "blue"];

const ownNectar = (a: Alliance): Kind => (a === "red" ? "R" : "B");
const opp = (a: Alliance): Alliance => (a === "red" ? "blue" : "red");
const nectarOwner = (k: Kind): Alliance | null => (k === "R" ? "red" : k === "B" ? "blue" : null);

interface FloorElem {
  id: number;
  k: Kind;
  x: number;
  y: number;
  readyAt: number;
  claimedBy: number | null;
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

interface Task {
  to?: Pt;
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
  x: number;
  y: number;
  held: Kind[];
  mode: Mode;
  task: Task | null;
  busyUntil: number;
  autoActive: boolean;
  left: boolean;
  autoParked: boolean;
  slowed: boolean;
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

export function simulateMatch(input: MatchInput): MatchResult {
  const { settings } = input;
  const rng: Rng = mulberry32(input.seed);
  const events: MatchEvent[] = [];
  const frames: Frame[] = [];
  let t = 0;
  let nextId = 1;

  const floor: FloorElem[] = [];
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

  const spawn = (k: Kind, p: Pt, readyDelay = 0) => {
    const c = clampField(p);
    floor.push({ id: nextId++, k, x: c.x, y: c.y, readyAt: t + readyDelay, claimedBy: null });
  };
  const scatter = (k: Kind, center: Pt, rMin: number, rMax: number, readyDelay: number) => {
    const ang = rng() * Math.PI * 2;
    const r = rMin + rng() * (rMax - rMin);
    spawn(k, { x: center.x + Math.cos(ang) * r, y: center.y + Math.sin(ang) * r }, readyDelay);
  };

  for (const a of ALLIANCES) {
    for (let i = 0; i < 3; i++) hives[a].cell.push(ownNectar(a));
    hives[a].weight = 3 * settings.nectarWeight;
    const g = GARDEN[a];
    for (let i = 0; i < 4; i++) {
      const fx = a === "red" ? g.x0 + 0.2 + i * 0.47 : g.x1 - 0.2 - i * 0.47;
      spawn("P", { x: fx, y: (g.y0 + g.y1) / 2 });
    }
  }

  const robots: Robot[] = [];
  for (const a of ALLIANCES) {
    const strat = a === "red" ? input.red : input.blue;
    const profs = a === "blue" && input.blueProfiles ? input.blueProfiles : input.profiles;
    for (const slot of [0, 1] as const) {
      const p = START_POS[a][slot];
      robots.push({
        idx: robots.length,
        alliance: a,
        slot,
        profile: profs[slot],
        role: strat.roles[slot],
        x: p.x,
        y: p.y,
        held: ["P", "P", "P", "P"],
        mode: "idle",
        task: null,
        busyUntil: 0,
        autoActive: rng() < profs[slot].autoReliability,
        left: false,
        autoParked: false,
        slowed: false,
        defendTarget: null,
      });
    }
  }

  const inAuto = () => t < AUTO_END;
  const timeLeft = () => (inAuto() ? AUTO_END - t : MATCH_LENGTH - t);
  const speedFactor = (r: Robot) =>
    (inAuto() ? r.profile.autoSpeed : 1) * (r.slowed ? 1 - settings.defenseEffect : 1);
  const travel = (r: Robot, p: Pt) => dist(r, p) / (r.profile.driveSpeed * speedFactor(r));
  const durScale = (r: Robot) => 1 / Math.max(0.2, speedFactor(r));

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
    h.tipUntil = t + 1.2;
    log(a, `HIVE TIP #${h.tips} (+20)`);
    schedule(1.0, () => {
      for (const k of contents) scatter(k, HIVE_POS[a], 1.5, 6, 1.2);
    });
    if (areaNectar[a] > 0 && t < FLOWER_UNLOCK) {
      areaNectar[a]--;
      schedule(3, () => {
        spawn(ownNectar(a), jitter(LZ_DROP[a], 0.25), 0.4);
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

  const jitter = (p: Pt, r: number): Pt => ({ x: p.x + (rng() - 0.5) * r, y: p.y + (rng() - 0.5) * r });

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
  const topNectarOf = (stack: Kind[]) => topNectar({ stack, bottom: 0 });

  // ---------- ROBOT ACTIONS ----------
  const setTask = (r: Robot, mode: Mode, task: Task) => {
    r.mode = mode;
    r.task = task;
  };

  const idle = (r: Robot, secs = 0.3) => setTask(r, r.mode === "parked" ? "parked" : "idle", { dur: secs, then: () => {} });

  const eligibleForHive = (r: Robot, ammo: RoleConfig["ammo"]) => (k: Kind) =>
    k === "P" || (ammo === "all" && k === ownNectar(r.alliance));

  type Pickup = { kind: "floor"; e: FloorElem; score: number; d: number } | { kind: "flower"; fi: number; score: number; d: number };

  const bestPickup = (r: Robot, want: (k: Kind) => boolean, valueOf: (k: Kind) => number, near?: Pt): Pickup | null => {
    let best: Pickup | null = null;
    const auto = inAuto();
    for (const e of floor) {
      if (e.readyAt > t + 0.4) continue;
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
      FLOWER_SERVICE.forEach((s, fi) => {
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

  const goPickup = (r: Robot, p: Pickup) => {
    if (p.kind === "floor") {
      const e = p.e;
      e.claimedBy = r.idx;
      const alive = () => floor.includes(e) && e.claimedBy === r.idx;
      setTask(r, "pickup", {
        to: approach(r, e, 0.55),
        dur: r.profile.intakeTime,
        check: alive,
        then: () => {
          if (!alive()) return;
          floor.splice(floor.indexOf(e), 1);
          r.held.push(e.k);
        },
      });
    } else {
      const fi = p.fi;
      setTask(r, "pickup", {
        to: FLOWER_SERVICE[fi],
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

  const approach = (from: Pt, to: Pt, stop: number): Pt => {
    const d = dist(from, to);
    if (d <= stop) return { x: from.x, y: from.y };
    const k = (d - stop) / d;
    return { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k };
  };

  const launchSpot = (r: Robot): Pt => {
    const h = HIVE_POS[r.alliance];
    const d = dist(r, h);
    const range = Math.max(MIN_LAUNCH_DIST + 0.3, r.profile.launchRange);
    if (d >= MIN_LAUNCH_DIST && d <= range) return { x: r.x, y: r.y };
    const dirx = d > 0.01 ? (r.x - h.x) / d : r.alliance === "red" ? -1 : 1;
    const diry = d > 0.01 ? (r.y - h.y) / d : 0;
    const target = d < MIN_LAUNCH_DIST ? MIN_LAUNCH_DIST + 0.2 : range - 0.2;
    return clampField({ x: h.x + dirx * target, y: h.y + diry * target }, ROBOT_HALF);
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
      if (rng() < acc) addToCell(r.alliance, k);
      else scatter(k, HIVE_POS[r.alliance], 1.5, 6, 1.2);
      if (r.held.some(eligible)) setTask(r, "launch", { dur: r.profile.launchTime, then: fire });
    };
    setTask(r, "launch", {
      to: launchSpot(r),
      dur: r.profile.alignTime + r.profile.launchTime,
      then: fire,
    });
  };

  const goPark = (r: Robot) => {
    setTask(r, "park", {
      to: PARK_SPOT[r.alliance][r.slot],
      then: () => {
        r.mode = "parked";
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
            scatter(kind, FLOWER_SERVICE[fi], 0.3, 1.5, 0.6);
          }
          placedHere++;
          placeNext();
        },
      });
    };
    setTask(r, "flower", {
      to: FLOWER_SERVICE[fi],
      dur: r.profile.alignTime,
      then: placeNext,
    });
  };

  const bestFlowerTrip = (r: Robot) => {
    let best: { fi: number; value: number; rate: number; used: number } | null = null;
    FLOWER_SERVICE.forEach((s, fi) => {
      const plan = planFlower(r.alliance, fi, r.held, r.role.flowerMode);
      if (plan.value <= 0) return;
      const time = travel(r, s) + r.profile.alignTime + plan.used * r.profile.flowerTime;
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
    const reserve = r.role.park ? travel(r, PARK_SPOT[r.alliance][r.slot]) + 1.5 : 0;
    const tl = timeLeft() - reserve;

    const trip = bestFlowerTrip(r);
    if (trip) {
      const need = travel(r, FLOWER_SERVICE[trip.fi]) + r.profile.alignTime + trip.used * r.profile.flowerTime;
      if (r.held.length >= 4 || tl < need + 3 || (mode === "cap" && heldN >= 4)) {
        goPlace(r, trip.fi);
        return true;
      }
    }

    const wantN = mode === "cap" ? 4 : heldN === 0 && flowerOpportunity(r.alliance, mode) ? 1 : 0;
    const wantP = mode === "cap" ? 0 : 4 - Math.max(heldN, wantN);
    const target = trip ? FLOWER_SERVICE[trip.fi] : undefined;

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
    const pick =
      r.held.length < 4
        ? bestPickup(r, eligible, (k) => weightOf(k), HIVE_POS[r.alliance])
        : null;
    if (launchable > 0) {
      const spot = launchSpot(r);
      const need = travel(r, spot) + r.profile.alignTime + launchable * r.profile.launchTime + 0.5;
      const reserve = !inAuto() && r.role.park ? travel(r, PARK_SPOT[r.alliance][r.slot]) + 1.5 : 0;
      const pickCost = pick ? pick.d / (r.profile.driveSpeed * speedFactor(r)) + r.profile.intakeTime : Infinity;
      if (r.held.length >= 4 || !pick || pick.d > 4.5 || timeLeft() - reserve < need + pickCost + 0.5) {
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
      to: approach(r, scorer, 1.4),
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
    const parkSpot = PARK_SPOT[r.alliance][r.slot];
    if (auto) {
      if (r.profile.autoPark && timeLeft() <= travel(r, parkSpot) + 0.8) {
        goPark(r);
        return;
      }
    } else if (r.role.park && timeLeft() <= travel(r, parkSpot) + 1.5) {
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

  const step = (r: Robot) => {
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
        const d = dist(r, task.to);
        const move = r.profile.driveSpeed * speedFactor(r) * DT;
        if (d > move) {
          r.x += ((task.to.x - r.x) / d) * move;
          r.y += ((task.to.y - r.y) / d) * move;
          return;
        }
        r.x = task.to.x;
        r.y = task.to.y;
        task.to = undefined;
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

  const liveScore = (a: Alliance, final: boolean): ScoreBreakdown => {
    const h = hives[a];
    const mine = robots.filter((r) => r.alliance === a);
    const leave = t >= AUTO_END ? mine.filter((r) => r.left).length * 3 : 0;
    const autoPark = mine.filter((r) => r.autoParked).length * 5;
    const park = final ? mine.filter((r) => inRect(r, LOADING_ZONE[a], ROBOT_HALF)).length * 5 : 0;
    let flowerBottom = 0;
    let flowerOwned = 0;
    for (const f of flowers) {
      if (bottomNectar(f) === a) flowerBottom += 5;
      if (topNectar(f) === a) flowerOwned += 2 * f.stack.length;
    }
    const garden = floor.filter((e) => inRect(e, GARDEN[a], 0.12)).length;
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
    frames.push({
      t,
      robots: robots.map((r) => ({ x: r.x, y: r.y, held: [...r.held], mode: r.mode })),
      floor: floor.map((e) => ({ x: e.x, y: e.y, k: e.k })),
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
        if (inRect(r, LOADING_ZONE[r.alliance], ROBOT_HALF)) {
          r.autoParked = true;
        }
        releaseClaims(r);
        r.task = null;
        r.mode = "idle";
      }
    }

    if (!flowersOpened && t >= FLOWER_UNLOCK) {
      flowersOpened = true;
      for (const a of ALLIANCES) {
        const n = areaNectar[a];
        areaNectar[a] = 0;
        if (n > 0) log(a, `Endgame: ${n} NECTAR entered, FLOWERS unlocked`);
        for (let i = 0; i < n; i++) {
          schedule(0.5 + i * 0.8, () => spawn(ownNectar(a), jitter(LZ_DROP[a], 0.4), 0.4));
        }
      }
    }

    const active = t < AUTO_END || (t >= TELEOP_START && t < MATCH_LENGTH);
    if (active) {
      for (const r of robots) r.slowed = false;
      if (!inAuto()) {
        for (const d of robots) {
          if (!d.role.defend || d.defendTarget === null || d.mode !== "defend") continue;
          const target = robots[d.defendTarget];
          if (dist(d, target) < 1.9 && target.mode !== "parked") {
            target.slowed = true;
            if (rng() < (settings.defenseFoulRate / 60) * DT) {
              foulCredit[target.alliance] += 20;
              log(d.alliance, "MAJOR FOUL on defense (+20 to opponent)");
            }
          }
        }
      }
      for (const r of robots) {
        step(r);
        if (inAuto() && !r.left) {
          const sp = START_POS[r.alliance][r.slot];
          if (dist(r, sp) > 0.3) r.left = true;
        }
      }
    }

    if (input.record && t - lastFrame >= FRAME_EVERY - 1e-9) {
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
    const parked = robots.filter((r) => r.alliance === a && inRect(r, LOADING_ZONE[a], ROBOT_HALF)).length;
    if (parked > 0) events.push({ t, alliance: a, text: `${parked} robot(s) parked (+${parked * 5})` });
  }
  if (input.record) record();
  events.sort((x, y) => x.t - y.t);

  return { red, blue, winner, events, frames: input.record ? frames : undefined };
}

export { opp };
