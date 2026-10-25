import type { Rng } from "./rng";
import { launchHeight, physicsReach } from "./shooting";
import { PRESETS } from "./strategies";
import type { RobotProfile } from "./types";

type NumberKey = { [K in keyof RobotProfile]: RobotProfile[K] extends number ? K : never }[keyof RobotProfile];

/** Slider limits for every numeric robot setting. The robot sliders use these too, so random robots always fit on them. */
export const ROBOT_RANGES: Record<NumberKey, { min: number; max: number; step: number }> = {
  widthIn: { min: 10, max: 18, step: 0.5 },
  lengthIn: { min: 10, max: 18, step: 0.5 },
  heightIn: { min: 12, max: 29, step: 1 },
  weightLb: { min: 8, max: 42, step: 1 },
  acceleration: { min: 2, max: 20, step: 0.5 },
  intakeWidth: { min: 0.25, max: 1, step: 0.05 },
  capacity: { min: 1, max: 4, step: 1 },
  shotSpeed: { min: 14, max: 40, step: 1 },
  launchHeightIn: { min: 8, max: 28, step: 0.5 },
  driveSpeed: { min: 1.5, max: 10, step: 0.25 },
  intakeTime: { min: 0.05, max: 1.5, step: 0.05 },
  launchTime: { min: 0.05, max: 2, step: 0.05 },
  alignTime: { min: 0, max: 3, step: 0.05 },
  flowerTime: { min: 0.3, max: 5, step: 0.1 },
  launchRange: { min: 2.5, max: 10, step: 0.25 },
  pollenAccuracy: { min: 0.2, max: 1, step: 0.01 },
  nectarAccuracy: { min: 0.2, max: 1, step: 0.01 },
  flowerAccuracy: { min: 0.2, max: 1, step: 0.01 },
  autoReliability: { min: 0, max: 1, step: 0.01 },
  autoSpeed: { min: 0.2, max: 1, step: 0.05 },
};

/** Typical change from the default, as a fraction of it (one standard deviation). */
export const RANDOM_SPREAD = 0.2;
/** Never more than this far from the default, as a fraction of it. */
export const RANDOM_LIMIT = 0.5;

/** A bell-curve draw (mean 0, standard deviation 1), redrawn until it lands within `limit`. */
function normal(rng: Rng, limit: number) {
  for (;;) {
    const z = Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
    if (Math.abs(z) <= limit) return z;
  }
}

function nearBase(rng: Rng, base: RobotProfile): RobotProfile {
  const p = { ...base };
  for (const [k, { min, max, step }] of Object.entries(ROBOT_RANGES) as [NumberKey, (typeof ROBOT_RANGES)[NumberKey]][]) {
    const v = base[k] * (1 + RANDOM_SPREAD * normal(rng, RANDOM_LIMIT / RANDOM_SPREAD));
    const snapped = min + Math.round((v - min) / step) * step;
    // Round off float noise like 0.7000000000000001 so the slider labels stay clean.
    p[k] = +Math.min(max, Math.max(min, snapped)).toFixed(4);
  }
  return p;
}

/**
 * A robot near the Average preset, so the showdown doesn't open on the same robots for everyone.
 * Each slider lands near its Average value: about 2 in 3 within 20% of it, never more than 50% away,
 * and always on a slider step inside the slider's range. Drivetrain and the on/off switches stay as in Average.
 *
 * Like every preset, the launcher can throw as far as its launch range. Average's shot speed is only a
 * little above the ~15.5 ft/s needed to reach the CELL at all, so without this check about 1 robot in 6
 * could barely score. Those robots are drawn again.
 */
export function randomRobot(rng: Rng = Math.random, base: RobotProfile = PRESETS.Average): RobotProfile {
  for (;;) {
    const p = nearBase(rng, base);
    if (physicsReach(p.shotSpeed, launchHeight(p)) >= p.launchRange) return p;
  }
}
