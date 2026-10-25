/**
 * Random starting robots: near Average, inside the sliders, and different each time.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { RANDOM_LIMIT, ROBOT_RANGES, randomRobot } from "../src/lib/sim/random-robot";
import { mulberry32 } from "../src/lib/sim/rng";
import { launchHeight, physicsReach } from "../src/lib/sim/shooting";
import { PRESETS } from "../src/lib/sim/strategies";

const avg = PRESETS.Average;
const keys = Object.keys(ROBOT_RANGES) as (keyof typeof ROBOT_RANGES)[];
const rng = mulberry32(1);
const robots = Array.from({ length: 2000 }, () => randomRobot(rng));

describe("Random robots", () => {
  test("every value is on a slider step inside the slider's range", () => {
    for (const p of robots)
      for (const k of keys) {
        const { min, max, step } = ROBOT_RANGES[k];
        assert.ok(p[k] >= min && p[k] <= max, `${k} = ${p[k]}`);
        const steps = (p[k] - min) / step;
        assert.ok(Math.abs(steps - Math.round(steps)) < 1e-6, `${k} = ${p[k]} is off the slider steps`);
      }
  });
  test("never more than 50% from Average (plus one slider step of rounding)", () => {
    for (const p of robots)
      for (const k of keys) assert.ok(Math.abs(p[k] - avg[k]) <= avg[k] * RANDOM_LIMIT + ROBOT_RANGES[k].step, `${k} = ${p[k]}`);
  });
  test("most values stay close to Average", () => {
    const dev = robots.map((p) => Math.abs(p.pollenAccuracy - avg.pollenAccuracy) / avg.pollenAccuracy);
    const within20 = dev.filter((d) => d <= 0.2).length / dev.length;
    const past40 = dev.filter((d) => d > 0.4).length / dev.length;
    assert.ok(within20 > 0.6 && within20 < 0.8, `within 20%: ${within20}`);
    assert.ok(past40 < 0.08, `past 40%: ${past40}`);
  });
  test("every robot can throw as far as its launch range, like the presets", () => {
    for (const p of [...Object.values(PRESETS), ...robots]) assert.ok(physicsReach(p.shotSpeed, launchHeight(p)) >= p.launchRange);
  });
  test("drivetrain and switches stay as in Average", () => {
    for (const p of robots.slice(0, 50)) {
      assert.equal(p.drivetrain, avg.drivetrain);
      assert.equal(p.autoPark, avg.autoPark);
      assert.equal(p.shooterOnBack, avg.shooterOnBack);
      assert.equal(p.shootOnTheMove, avg.shootOnTheMove);
    }
  });
  test("two robots differ", () => {
    assert.notDeepEqual(randomRobot(), randomRobot());
  });
});
