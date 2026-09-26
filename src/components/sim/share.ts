import { CUSTOM_ID, DEFAULT_SETTINGS, PRESETS, STRATEGIES, defaultCustom } from "@/lib/sim/strategies";
import type { GameSettings, RobotProfile, RoleConfig, Strategy } from "@/lib/sim/types";

/**
 * Share links. The site is static (no server to store setups), so the link itself carries the setup,
 * after a `#` so it never reaches the server or Google Analytics. To keep links short, it only stores
 * what differs from the defaults: each robot as "closest preset + changed sliders", and only the
 * changed Game settings and Custom strategy roles. The showdown always uses the same random seed,
 * so opening the link reproduces the exact same results.
 */

export interface SharedSetup {
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
  custom: Strategy;
  /** Strategies picked for the showdown, and matches per pairing. */
  enabled?: string[];
  perPair?: number;
  /** The match open in the Match viewer. */
  match?: { redId: string; blueId: string; seed: number };
}

// Short codes for each field. Old links depend on these numbers: only ever add new ones, never renumber.
const PROFILE_CODES = {
  driveSpeed: 0,
  acceleration: 1,
  intakeTime: 2,
  intakeWidth: 3,
  launchTime: 4,
  launchRange: 5,
  shotSpeed: 6,
  launchHeightIn: 7,
  pollenAccuracy: 8,
  nectarAccuracy: 9,
  flowerTime: 10,
  flowerAccuracy: 11,
  alignTime: 12,
  autoReliability: 13,
  autoSpeed: 14,
  autoPark: 15,
  widthIn: 16,
  lengthIn: 17,
  heightIn: 18,
  weightLb: 19,
  drivetrain: 20,
  capacity: 21,
  shooterOnBack: 22,
  shootOnTheMove: 23,
} satisfies Record<keyof RobotProfile, number>;

const SETTINGS_CODES = {
  tipThreshold: 0,
  tipVariance: 1,
  nectarWeight: 2,
  flowerCapacity: 3,
  defenseEffect: 4,
  blockChance: 5,
  tipSpinTime: 6,
  cellHeight: 7,
  ballFriction: 8,
} satisfies Record<keyof GameSettings, number>;

const ROLE_CODES = {
  label: 0,
  ammo: 1,
  flowerStart: 2,
  flowerMode: 3,
  defend: 4,
  park: 5,
} satisfies Record<keyof RoleConfig, number>;

/** Allowed values for the fields that are a fixed list of words. */
const CHOICES: Record<string, readonly unknown[]> = {
  drivetrain: ["mecanum", "tank", "swerve"],
  ammo: ["all", "pollen"],
  flowerMode: ["fill", "cap", "claim"],
};

const PRESET_NAMES = Object.keys(PRESETS);
/** Every strategy the showdown can pick, in a fixed order, so the link can refer to them by number. */
const STRATEGY_IDS = [...STRATEGIES.map((s) => s.id), CUSTOM_ID];

type Diff = Record<string, unknown>;

/** Slider math can leave tiny float errors (0.30000000000000004). Round them off. */
const tidy = (v: unknown) => (typeof v === "number" ? Math.round(v * 1e4) / 1e4 : v);

function diff<T extends object>(value: T, base: T, codes: Record<keyof T, number>): Diff {
  const out: Diff = {};
  for (const key of Object.keys(codes) as (keyof T)[]) {
    if (tidy(value[key]) !== tidy(base[key])) out[codes[key]] = tidy(value[key]);
  }
  return out;
}

/** Apply a diff to a copy of `base`, keeping only values of the right type (a link can't break the app). */
function patch<T extends object>(base: T, d: unknown, codes: Record<keyof T, number>): T {
  const out = { ...base };
  if (!d || typeof d !== "object") return out;
  for (const key of Object.keys(codes) as (keyof T)[]) {
    const v = (d as Diff)[codes[key]];
    if (v === undefined) continue;
    const expected = base[key];
    const choices = CHOICES[key as string];
    const ok = choices
      ? choices.includes(v)
      : typeof v === typeof expected && (typeof v !== "number" || Number.isFinite(v)) && (typeof v !== "string" || v.length <= 40);
    // flowerStart is a number or null ("never").
    if (ok || (key === "flowerStart" && (v === null || (typeof v === "number" && Number.isFinite(v))))) out[key] = v as T[keyof T];
  }
  return out;
}

/** The preset a robot is closest to, so the link only lists the sliders changed from it. */
function closestPreset(p: RobotProfile) {
  let best = 0;
  let fewest = Infinity;
  PRESET_NAMES.forEach((name, i) => {
    const n = Object.keys(diff(p, PRESETS[name], PROFILE_CODES)).length;
    if (n < fewest) {
      fewest = n;
      best = i;
    }
  });
  return best;
}

function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(code: string) {
  const bin = atob(code.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeSetup(s: SharedSetup): string {
  const base = defaultCustom();
  const data: Record<string, unknown> = {
    v: 1,
    r: s.profiles.map((p) => {
      const preset = closestPreset(p);
      const d = diff(p, PRESETS[PRESET_NAMES[preset]], PROFILE_CODES);
      return Object.keys(d).length ? [preset, d] : [preset];
    }),
  };
  const g = diff(s.settings, DEFAULT_SETTINGS, SETTINGS_CODES);
  if (Object.keys(g).length) data.g = g;
  const c = s.custom.roles.map((role, i) => diff(role, base.roles[i], ROLE_CODES));
  if (c.some((d) => Object.keys(d).length)) data.c = c;
  if (s.enabled) data.e = s.enabled.map((id) => STRATEGY_IDS.indexOf(id)).filter((i) => i >= 0);
  if (s.perPair) data.n = s.perPair;
  if (s.match) data.m = [STRATEGY_IDS.indexOf(s.match.redId), STRATEGY_IDS.indexOf(s.match.blueId), s.match.seed];
  return toBase64Url(JSON.stringify(data));
}

/** Read a share code. Returns null if it isn't a setup this version of the site understands. */
export function decodeSetup(code: string): SharedSetup | null {
  let data: Record<string, unknown>;
  try {
    data = JSON.parse(fromBase64Url(code));
  } catch {
    return null;
  }
  if (!data || data.v !== 1 || !Array.isArray(data.r) || data.r.length !== 2) return null;
  const robot = (entry: unknown): RobotProfile => {
    const [preset, d] = Array.isArray(entry) ? entry : [];
    const name = PRESET_NAMES[typeof preset === "number" ? preset : 1] ?? "Average";
    return patch(PRESETS[name], d, PROFILE_CODES);
  };
  const base = defaultCustom();
  const roles = Array.isArray(data.c) ? data.c : [];
  const idAt = (i: unknown) => (typeof i === "number" ? STRATEGY_IDS[i] : undefined);
  const setup: SharedSetup = {
    profiles: [robot(data.r[0]), robot(data.r[1])],
    settings: patch(DEFAULT_SETTINGS, data.g, SETTINGS_CODES),
    custom: { ...base, roles: [patch(base.roles[0], roles[0], ROLE_CODES), patch(base.roles[1], roles[1], ROLE_CODES)] },
  };
  if (Array.isArray(data.e)) setup.enabled = data.e.map(idAt).filter((id): id is string => !!id);
  if (typeof data.n === "number" && data.n >= 1 && data.n <= 500) setup.perPair = Math.round(data.n);
  if (Array.isArray(data.m)) {
    const [r, b, seed] = data.m;
    const redId = idAt(r);
    const blueId = idAt(b);
    if (redId && blueId && typeof seed === "number" && Number.isFinite(seed)) setup.match = { redId, blueId, seed };
  }
  return setup;
}

/** The share code in a URL's `#s=...`, or undefined if there isn't one. */
export const shareCodeFrom = (hash: string) => new URLSearchParams(hash.replace(/^#/, "")).get("s") ?? undefined;
