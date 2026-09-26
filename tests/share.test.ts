/**
 * Share links: a setup survives the trip through a link, and links stay short.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { decodeSetup, encodeSetup, shareCodeFrom, type SharedSetup } from "../src/components/sim/share";
import { DEFAULT_SETTINGS, PRESETS, defaultCustom } from "../src/lib/sim/strategies";

const base = (): SharedSetup => ({
  profiles: [{ ...PRESETS.Average }, { ...PRESETS.Average }],
  settings: { ...DEFAULT_SETTINGS },
  custom: defaultCustom(),
});

describe("Share links", () => {
  test("a changed setup comes back exactly the same", () => {
    const s = base();
    s.profiles = [{ ...PRESETS.Elite, intakeWidth: 0.6, drivetrain: "swerve" }, { ...PRESETS.Rookie, heightIn: 29, shootOnTheMove: true }];
    s.settings = { ...DEFAULT_SETTINGS, blockChance: 0.35, flowerCapacity: 6 };
    s.custom = { ...s.custom, roles: [{ ...s.custom.roles[0], defend: true }, { ...s.custom.roles[1], flowerMode: "claim", flowerStart: null }] };
    s.enabled = ["hive-only", "hive-defense", "custom"];
    s.perPair = 100;
    s.match = { redId: "hive-defense", blueId: "custom", seed: 1234 };
    assert.deepEqual(decodeSetup(encodeSetup(s)), s);
  });
  test("links stay short: a preset with a couple of changes is under 100 characters", () => {
    const s = base();
    s.profiles = [{ ...PRESETS.Elite, intakeWidth: 0.6 }, { ...PRESETS.Elite }];
    s.enabled = ["hive-only", "hive-defense"];
    s.perPair = 50;
    assert.ok(encodeSetup(s).length < 100, encodeSetup(s));
  });
  test("a broken or tampered link is rejected or cleaned up, never crashes", () => {
    assert.equal(decodeSetup("not-a-real-code"), null);
    const bad = Buffer.from(JSON.stringify({ v: 1, r: [[1, { 0: "fast", 20: "hovercraft" }], [9]] })).toString("base64url");
    const s = decodeSetup(bad)!;
    assert.equal(s.profiles[0].driveSpeed, PRESETS.Average.driveSpeed);
    assert.equal(s.profiles[0].drivetrain, PRESETS.Average.drivetrain);
  });
  test("reads the code out of the address", () => {
    assert.equal(shareCodeFrom("#s=abc"), "abc");
    assert.equal(shareCodeFrom(""), undefined);
  });
});
