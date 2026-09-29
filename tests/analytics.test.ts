/**
 * Google Analytics events: the right events are sent for what changed.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";
import { presetName, reportChanges, type Setup } from "../src/lib/analytics";
import { DEFAULT_SETTINGS, PRESETS } from "../src/lib/sim/strategies";

let sent: unknown[][] = [];
beforeEach(() => {
  sent = [];
  (globalThis as { window?: unknown }).window = { gtag: (...args: unknown[]) => sent.push(args) };
});

const setup = (): Setup => ({ profiles: [{ ...PRESETS.Average }, { ...PRESETS.Average }], settings: { ...DEFAULT_SETTINGS } });

describe("Analytics events", () => {
  test("nothing changed, nothing sent", () => {
    reportChanges(setup(), setup());
    assert.equal(sent.length, 0);
  });
  test("one slider moved sends one event with where it ended up", () => {
    const after = setup();
    after.profiles[1] = { ...after.profiles[1], intakeWidth: 1 };
    reportChanges(setup(), after);
    assert.deepEqual(sent, [["event", "robot_setting_changed", { robot: 2, setting: "intakeWidth", value: 1 }]]);
  });
  test("a preset button sends one preset event, not one per slider", () => {
    const after = setup();
    after.profiles[0] = { ...PRESETS.Elite };
    reportChanges(setup(), after);
    assert.deepEqual(sent, [["event", "robot_preset_selected", { robot: 1, preset: "Elite" }]]);
  });
  test("game settings are reported too", () => {
    const after = setup();
    after.settings = { ...after.settings, blockChance: 0.3 };
    reportChanges(setup(), after);
    assert.deepEqual(sent, [["event", "game_setting_changed", { setting: "blockChance", value: 0.3 }]]);
  });
  test("presetName recognizes presets and custom robots", () => {
    assert.equal(presetName({ ...PRESETS.Rookie }), "Rookie");
    assert.equal(presetName({ ...PRESETS.Rookie, driveSpeed: 9 }), "custom");
  });
});
