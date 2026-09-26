/**
 * Whole-match checks: things that must always be true no matter how the robots play.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { simulateMatch } from "../src/lib/sim/engine";
import { CENTER, FIELD, OBSTACLES } from "../src/lib/sim/field";
import { AUTO_END } from "../src/lib/sim/rules";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import type { MatchResult, RobotProfile } from "../src/lib/sim/types";

const play = (seed: number, record = false, profile: RobotProfile = PRESETS.Average, red = STRATEGIES[0], blue = STRATEGIES[2]) =>
  simulateMatch({ red, blue, profiles: [profile, profile], settings: DEFAULT_SETTINGS, seed, record });

const scoresOnly = (r: MatchResult) => ({ red: r.red, blue: r.blue, winner: r.winner });

describe("Repeatable matches", () => {
  test("the same seed always gives the same match", () => {
    assert.deepEqual(scoresOnly(play(7)), scoresOnly(play(7)));
  });
  test("recording a replay doesn't change the result", () => {
    assert.deepEqual(scoresOnly(play(7, true)), scoresOnly(play(7)));
  });
  test("different seeds give different matches", () => {
    const totals = new Set([1, 2, 3, 4, 5].map((s) => play(s).red.total));
    assert.ok(totals.size > 1);
  });
});

describe("Every match", () => {
  const results = [11, 12, 13].flatMap((seed) => STRATEGIES.map((s, i) => play(seed, false, PRESETS.Average, s, STRATEGIES[(i + 3) % STRATEGIES.length])));
  test("the total is the sum of its parts", () => {
    for (const r of results)
      for (const s of [r.red, r.blue]) {
        const parts = s.leave + s.autoPark + s.autoTips + s.teleopTips + s.cell + s.flowerBottom + s.flowerOwned + s.garden + s.park + s.foulCredit;
        assert.equal(s.total, parts);
      }
  });
  test("robot points stay within what two robots can earn", () => {
    for (const r of results)
      for (const s of [r.red, r.blue]) {
        assert.ok(s.leave <= 6 && s.autoPark <= 10 && s.park <= 10);
        assert.equal(s.swarmRP, s.leave + s.autoPark + s.park >= 16);
      }
  });
  test("FLOWER points never beat what 4 FLOWERS can hold", () => {
    for (const r of results) assert.ok(r.red.flowerBottom + r.blue.flowerBottom <= 20);
  });
});

describe("Robots stay where robots can be", () => {
  test("never inside a wall, the HIVE frame, or a FLOWER", () => {
    const r = play(21, true, PRESETS.Elite, STRATEGIES[2], STRATEGIES[6]);
    for (const f of r.frames!) {
      for (const b of f.robots) {
        const slack = 0.05;
        const half = Math.min(b.hw, b.hl);
        assert.ok(b.x > half - slack && b.x < FIELD - half + slack && b.y > half - slack && b.y < FIELD - half + slack, `off the field at t=${f.t}`);
        for (const o of OBSTACLES) {
          const inside = b.x > o.x0 + slack && b.x < o.x1 - slack && b.y > o.y0 + slack && b.y < o.y1 - slack;
          assert.ok(!inside, `robot center inside an obstacle at t=${f.t}`);
        }
      }
    }
  });
});

describe("AUTO (G402)", () => {
  test("robots stay entirely on their own half until AUTO ends", () => {
    for (const seed of [21, 22, 23]) {
      const r = play(seed, true, PRESETS.Elite, STRATEGIES[0], STRATEGIES[2]);
      for (const f of r.frames!) {
        if (f.t >= AUTO_END) break;
        f.robots.forEach((b, i) => {
          const ex = Math.abs(Math.cos(b.heading)) * b.hl + Math.abs(Math.sin(b.heading)) * b.hw;
          const onOwnHalf = i < 2 ? b.x + ex <= CENTER + 0.01 : b.x - ex >= CENTER - 0.01;
          assert.ok(onOwnHalf, `robot ${i} over the center line at t=${f.t.toFixed(1)}`);
        });
      }
    }
  });
});

describe("Physics limits", () => {
  test("a launcher too slow to reach the CELL never tips the HIVE", () => {
    const weak = { ...PRESETS.Average, shotSpeed: 14 };
    const r = play(3, false, weak);
    assert.equal(r.red.tips + r.blue.tips, 0);
  });
});
