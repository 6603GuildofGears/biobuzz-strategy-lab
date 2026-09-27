import { DEFAULT_SETTINGS, PRESETS } from "@/lib/sim/strategies";
import type { GameSettings, RobotProfile, Strategy } from "@/lib/sim/types";

/**
 * Google Analytics events for what people do inside the app (moving sliders, running the showdown,
 * watching matches). Page views are recorded automatically; everything else has to be sent from here.
 * Only anonymous game settings are sent, never anything about the person.
 */

type Params = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
  }
}

export function track(event: string, params: Params = {}) {
  if (typeof window === "undefined" || !window.gtag) return;
  window.gtag("event", event, params);
}

/** The preset a robot exactly matches ("Rookie", "Average", "Elite"), or "custom". */
export function presetName(p: RobotProfile) {
  const keys = Object.keys(p) as (keyof RobotProfile)[];
  return Object.entries(PRESETS).find(([, q]) => keys.every((k) => q[k] === p[k]))?.[0] ?? "custom";
}

export interface Setup {
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
  custom: Strategy;
}

const value = (v: unknown) => (typeof v === "number" || typeof v === "string" || typeof v === "boolean" ? v : String(v));

/**
 * Report what changed between two setups. Called a moment after someone stops adjusting, so dragging
 * a slider sends one event with where it ended up, not one per pixel. Several robot sliders changing at
 * once means a preset button or "Copy to Robot", so that's reported as one event.
 */
export function reportChanges(before: Setup, after: Setup) {
  after.profiles.forEach((p, i) => {
    const old = before.profiles[i];
    const changed = (Object.keys(p) as (keyof RobotProfile)[]).filter((k) => p[k] !== old[k]);
    if (changed.length > 3) {
      const preset = presetName(p);
      track("robot_preset_selected", { robot: i + 1, preset: preset === "custom" ? "copied" : preset });
    } else {
      for (const k of changed) track("robot_setting_changed", { robot: i + 1, setting: k, value: value(p[k]) });
    }
  });

  const changedSettings = (Object.keys(after.settings) as (keyof GameSettings)[]).filter((k) => after.settings[k] !== before.settings[k]);
  const reset = changedSettings.length > 1 && changedSettings.every((k) => after.settings[k] === DEFAULT_SETTINGS[k]);
  if (reset) track("game_settings_reset");
  else for (const k of changedSettings) track("game_setting_changed", { setting: k, value: value(after.settings[k]) });

  after.custom.roles.forEach((role, i) => {
    const old = before.custom.roles[i];
    for (const k of Object.keys(role) as (keyof typeof role)[]) {
      if (k !== "label" && role[k] !== old[k]) track("custom_strategy_changed", { robot: i + 1, setting: k, value: value(role[k]) });
    }
  });
}
