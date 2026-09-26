/**
 * Checks for picking up on the run, shot blocking, claiming FLOWER bottoms, and defense.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { simulateMatch } from "../src/lib/sim/engine";
import { FLOWER_BLOCKS, cellOpening } from "../src/lib/sim/field";
import { grabPose } from "../src/lib/sim/grab";
import { BALL_RADIUS } from "../src/lib/sim/rules";
import { planFlower } from "../src/lib/sim/flowers";
import { applyDefense, backOff } from "../src/lib/sim/defense";
import { intakeBalls } from "../src/lib/sim/intake";
import { gapBetween } from "../src/lib/sim/motion";
import { blockerOf } from "../src/lib/sim/shooting";
import { createMatch, spawnBall, type MatchState, type Robot } from "../src/lib/sim/state";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import type { Kind, RobotProfile } from "../src/lib/sim/types";

const newMatch = (profile: RobotProfile = PRESETS.Average): MatchState => {
  const m = createMatch({ red: STRATEGIES[0], blue: STRATEGIES[0], profiles: [profile, profile], settings: DEFAULT_SETTINGS, seed: 1 });
  m.balls = [];
  m.t = 50;
  return m;
};

/** Red robot 1, empty, driving along +x at `speed` in the middle of the field, collecting. */
function driving(m: MatchState, speed: number): Robot {
  const r = m.robots[0];
  Object.assign(r, { x: 3, y: 9, heading: 0, vx: speed, vy: 0, held: [] });
  r.job = { type: "wait", spot: null, until: 99, why: "test" };
  return r;
}

/** A ball of kind k just in front of the robot's intake, `side` ft off center. */
const ballAhead = (m: MatchState, r: Robot, side: number, k: Kind = "P") => spawnBall(m, k, { x: r.x + r.hl + 0.05, y: r.y + side });

describe("Picking up on the run", () => {
  test("a ball in the intake's mouth comes in while the robot keeps driving", () => {
    const m = newMatch();
    const r = driving(m, 2);
    ballAhead(m, r, 0);
    intakeBalls(m);
    assert.deepEqual(r.held, ["P"]);
    assert.equal(m.balls.length, 0);
    assert.ok(r.intakeBusyUntil > m.t, "the robot can't launch it until the intake finishes");
  });
  test("a full-width intake takes a ball near the edge of the front, a half-width one doesn't", () => {
    for (const [width, expected] of [
      [1, 1],
      [0.5, 0],
    ] as const) {
      const m = newMatch({ ...PRESETS.Average, intakeWidth: width });
      const r = driving(m, 1);
      ballAhead(m, r, r.hw * 0.8);
      intakeBalls(m);
      assert.equal(r.held.length, expected, `intake width ${width}`);
    }
  });
  test("driving into a ball faster than the intake can swallow it knocks it away", () => {
    const m = newMatch({ ...PRESETS.Rookie, driveSpeed: 8 });
    const r = driving(m, 8);
    ballAhead(m, r, 0);
    intakeBalls(m);
    assert.equal(r.held.length, 0);
  });
  test("never the opponent's NECTAR (G408), and never past capacity", () => {
    const m = newMatch();
    const r = driving(m, 1);
    ballAhead(m, r, 0, "B");
    intakeBalls(m);
    assert.equal(r.held.length, 0);
    r.held = ["P", "P", "P", "P"];
    ballAhead(m, r, 0.1);
    intakeBalls(m);
    assert.equal(r.held.length, 4);
  });
});

describe("Balls next to a FLOWER", () => {
  /** A POLLEN in the pocket between the audience-wall FLOWER and the wall. */
  function tucked(intakeWidth: number) {
    const m = newMatch({ ...PRESETS.Average, intakeWidth });
    const block = FLOWER_BLOCKS[1];
    const b = spawnBall(m, "P", { x: block.x1 + BALL_RADIUS.P + 0.01, y: BALL_RADIUS.P });
    return grabPose(m, m.robots[0], b, -Math.PI / 2);
  }
  test("a narrow intake can't get a ball tucked against a FLOWER and the wall, so the robot skips it", () => {
    assert.equal(tucked(0.5), null);
  });
  test("a full-width intake can, by lining up on it", () => {
    const pose = tucked(1);
    assert.ok(pose && !pose.open);
  });
  test("a ball out in the open can be driven straight over", () => {
    const m = newMatch();
    const b = spawnBall(m, "P", { x: 3, y: 3 });
    assert.equal(grabPose(m, m.robots[0], b, 0)?.open, true);
  });
});

describe("Shot blocking", () => {
  /** Red robot 1 lined up 3 ft in front of its upward CELL, and blue robot 1 somewhere. */
  function setup(blockerHeightIn: number, place: "front" | "beside" | "far") {
    const m = newMatch({ ...PRESETS.Average, heightIn: blockerHeightIn });
    const shooter = m.robots[0];
    const opening = cellOpening("red", m.hives.red.up);
    const out = m.hives.red.up === "north" ? 1 : -1;
    Object.assign(shooter, { x: opening.x, y: opening.y + out * 3, heading: -out * (Math.PI / 2) });
    const d = m.robots.find((o) => o.alliance === "blue")!;
    const gap = shooter.hl + d.hl + 0.05;
    const spots = {
      front: { x: shooter.x, y: shooter.y - out * gap },
      beside: { x: shooter.x + shooter.hw + d.hw + 0.3, y: shooter.y },
      far: { x: shooter.x, y: shooter.y - out * (gap + 1.5) },
    };
    Object.assign(d, spots[place], { heading: out * (Math.PI / 2) });
    for (const o of m.robots) if (o !== shooter && o !== d) Object.assign(o, { x: 11, y: 1 });
    return { m, shooter, d };
  }
  test("a 29 in robot pressed against the shooter's front blocks the shot", () => {
    const { m, shooter, d } = setup(29, "front");
    assert.equal(blockerOf(m, shooter, shooter), d);
  });
  test("a robot too short to reach the ball's path doesn't", () => {
    const { m, shooter } = setup(12, "front");
    assert.equal(blockerOf(m, shooter, shooter), null);
  });
  test("a higher launcher clears a 24 in blocker that stops a 14.5 in one", () => {
    const { m, shooter, d } = setup(24, "front");
    assert.equal(blockerOf(m, shooter, shooter), d);
    shooter.profile = { ...shooter.profile, launchHeightIn: 28 };
    assert.equal(blockerOf(m, shooter, shooter), null);
  });
  test("a robot beside the shooter, or farther out along the shot, doesn't", () => {
    for (const place of ["beside", "far"] as const) {
      const { m, shooter } = setup(29, place);
      assert.equal(blockerOf(m, shooter, shooter), null, place);
    }
  });
});

describe("Claiming FLOWER bottoms", () => {
  test("claim mode only places NECTAR where there is none yet, worth the bottom bonus plus owning it", () => {
    const m = newMatch();
    m.flowers[0].volume = ["P", "P"];
    m.flowers[1].volume = ["B", "P"];
    assert.deepEqual(planFlower(m, "red", 0, ["R", "R"], "claim"), { value: 5 + 2 * 3, used: 1 });
    assert.deepEqual(planFlower(m, "red", 1, ["R", "R"], "claim"), { value: 0, used: 0 });
  });
});

describe("Robots bumping", () => {
  test("two robots turned 45° corner to corner aren't touching just because their bounding boxes overlap", () => {
    const m = newMatch();
    const [a, b] = m.robots;
    Object.assign(a, { x: 3, y: 3, heading: Math.PI / 4 });
    // Their field-aligned bounding boxes overlap, but the frames themselves are apart.
    Object.assign(b, { x: 3 + a.hl * 2.2, y: 3 + a.hl * 2.2, heading: Math.PI / 4 });
    assert.ok(gapBetween(a, b) > 0.1);
  });
});

describe("PINS (G421)", () => {
  /** Red robot 1 pushing blue robot 1 against the audience wall (or, with `open`, out in the middle of the field). */
  function pinSetup(open = false) {
    const m = newMatch();
    const p = m.robots[0];
    const v = m.robots.find((o) => o.alliance === "blue")!;
    for (const o of m.robots) if (o !== p && o !== v) Object.assign(o, { x: o.alliance === "red" ? 1 : 11, y: 11 });
    const y0 = open ? 3 : 0;
    Object.assign(v, { x: 3, y: y0 + v.hl, heading: Math.PI / 2, vx: 0, vy: 0, cmdx: 0, cmdy: 2 }); // wants to drive away from the wall, into p
    Object.assign(p, { x: 3, y: y0 + v.hl * 2 + p.hl + 0.02, heading: -Math.PI / 2, vx: 0, vy: 0, cmdx: 0, cmdy: -2 });
    p.job = { type: "wait", spot: null, until: 999, why: "test" };
    return { m, p, v };
  }
  const hold = (m: MatchState) => {
    for (let i = 0; i < 32; i++) {
      m.t += m.dt;
      applyDefense(m);
    }
  };
  test("holding an opponent against the wall for over 3 s is a MAJOR FOUL", () => {
    const { m, p } = pinSetup();
    hold(m);
    assert.equal(m.stats.red.fouls, 1);
    assert.equal(m.foulCredit.blue, 20);
    assert.equal(p.pinVictim?.alliance, "blue");
  });
  test("shoving in the open isn't a PIN (the other robot can turn aside)", () => {
    const { m } = pinSetup(true);
    hold(m);
    assert.equal(m.stats.red.fouls + m.stats.blue.fouls, 0);
  });
  test("a robot backs off before its PIN count reaches 3 s", () => {
    const { m, p } = pinSetup();
    p.pinVictim = m.robots.find((o) => o.alliance === "blue")!;
    p.pinTime = 2.4;
    assert.equal(backOff(m, p), true);
  });
});

describe("Defense", () => {
  test("a tall defender costs the opponent points", () => {
    const hiveOnly = STRATEGIES.find((s) => s.id === "hive-only")!;
    const withDefender = STRATEGIES.find((s) => s.id === "hive-defense")!;
    let open = 0;
    let defended = 0;
    for (const seed of [1, 2, 3, 4]) {
      const play = (red: typeof hiveOnly) => simulateMatch({ red, blue: hiveOnly, profiles: [PRESETS.Elite, PRESETS.Elite], settings: DEFAULT_SETTINGS, seed });
      open += play(hiveOnly).blue.total;
      defended += play(withDefender).blue.total;
    }
    assert.ok(defended < open * 0.8, `defended ${defended} vs open ${open}`);
  });
});
