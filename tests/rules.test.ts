/**
 * Checks that the simulator follows the Competition Manual.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { placeInFlower, pullFromBottom } from "../src/lib/sim/flowers";
import { addToCell } from "../src/lib/sim/hive";
import { scoreAlliance } from "../src/lib/sim/scoring";
import { physicsReach } from "../src/lib/sim/shooting";
import { createMatch, type MatchState } from "../src/lib/sim/state";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import type { Kind } from "../src/lib/sim/types";

const newMatch = (settings = DEFAULT_SETTINGS): MatchState =>
  createMatch({ red: STRATEGIES[0], blue: STRATEGIES[0], profiles: [PRESETS.Average, PRESETS.Average], settings, seed: 1 });

/** Score one FLOWER holding `volume` (bottom to top) and nothing else. */
function flowerPoints(volume: Kind[]) {
  const m = newMatch();
  m.flowers = [{ below: 0, volume }, { below: 0, volume: [] }, { below: 0, volume: [] }, { below: 0, volume: [] }];
  m.balls = [];
  const red = scoreAlliance(m, "red", false);
  const blue = scoreAlliance(m, "blue", false);
  return { red: red.flowerBottom + red.flowerOwned, blue: blue.flowerBottom + blue.flowerOwned };
}

describe("FLOWER scoring (10.5.2, Figure 10-5)", () => {
  const P: Kind = "P";
  test("A: blue NECTAR on the bottom and top, 5 POLLEN between: blue gets 5 + 2×7", () => {
    assert.deepEqual(flowerPoints(["B", P, P, P, P, P, "B"]), { red: 0, blue: 19 });
  });
  test("B: one blue NECTAR is both top and bottom: blue gets 5 + 2×6", () => {
    assert.deepEqual(flowerPoints(["B", P, P, P, P, P]), { red: 0, blue: 17 });
  });
  test("C: blue on the bottom, red on top: blue gets the bottom bonus, red owns all 6", () => {
    assert.deepEqual(flowerPoints(["B", P, P, P, P, "R"]), { red: 12, blue: 5 });
  });
  test("D: a red NECTAR on top of 7 POLLEN: red gets 5 + 2×8", () => {
    assert.deepEqual(flowerPoints([P, P, P, P, P, P, P, "R"]), { red: 21, blue: 0 });
  });
  test("POLLEN alone scores for nobody", () => {
    assert.deepEqual(flowerPoints([P, P, P]), { red: 0, blue: 0 });
  });
});

describe("FLOWER tube", () => {
  test("starts with 4 POLLEN: 2 below the middle ring and 2 in the scoring volume", () => {
    const f = newMatch().flowers[0];
    assert.equal(f.below, 2);
    assert.deepEqual(f.volume, ["P", "P"]);
  });
  test("pulling POLLEN from the bottom lets the POLLEN above slide down", () => {
    const f = { below: 2, volume: ["P", "P"] as Kind[] };
    assert.equal(pullFromBottom(f), true);
    assert.deepEqual(f, { below: 2, volume: ["P"] });
  });
  test("NECTAR caught on the middle ring holds everything above it", () => {
    const f = { below: 2, volume: ["R", "P"] as Kind[] };
    pullFromBottom(f);
    assert.deepEqual(f, { below: 1, volume: ["R", "P"] });
  });
  test("POLLEN dropped into an empty tube falls to the bottom section", () => {
    const f = { below: 0, volume: [] as Kind[] };
    placeInFlower(f, "P", 7);
    assert.deepEqual(f, { below: 1, volume: [] });
  });
  test("a full FLOWER rejects more elements", () => {
    const f = { below: 2, volume: ["R", "P", "P", "P", "P", "P", "P"] as Kind[] };
    assert.equal(placeInFlower(f, "P", 7), false);
  });
});

describe("HIVE calibration (the tip weights)", () => {
  const exact = { ...DEFAULT_SETTINGS, tipVariance: 0 };
  const fill = (kinds: Kind[]) => {
    const m = newMatch(exact);
    const h = m.hives.red;
    h.cell = [];
    h.weight = 0;
    for (const k of kinds) addToCell(m, "red", k);
    return h.tips;
  };
  test("7 POLLEN must not tip, 8 POLLEN must", () => {
    assert.equal(fill(Array(7).fill("P")), 0);
    assert.equal(fill(Array(8).fill("P")), 1);
  });
  test("3 NECTAR + 2 POLLEN must not tip, 3 NECTAR + 3 POLLEN must", () => {
    assert.equal(fill(["R", "R", "R", "P", "P"]), 0);
    assert.equal(fill(["R", "R", "R", "P", "P", "P"]), 1);
  });
  test("each alliance's upward CELL starts with 3 NECTAR, red facing the audience, blue the rear", () => {
    const m = newMatch();
    assert.deepEqual(m.hives.red.cell, ["R", "R", "R"]);
    assert.equal(m.hives.red.up, "south");
    assert.equal(m.hives.blue.up, "north");
  });
});

describe("Launcher physics", () => {
  test("a ball slower than about 15.5 ft/s can't climb to the CELL at all", () => {
    assert.equal(physicsReach(15), 0);
  });
  test("faster launchers reach farther", () => {
    assert.ok(physicsReach(20) > 7 && physicsReach(20) < 9);
    assert.ok(physicsReach(26) > physicsReach(20));
  });
});
