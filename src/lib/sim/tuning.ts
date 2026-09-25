import type { Drivetrain } from "./types";

/**
 * Assumptions: numbers the manual does NOT give us. Every one of these is a guess.
 * If practice or real matches show something different, change it here.
 * (Numbers that DO come from the manual are in rules.ts and field.ts.)
 */

// ---------- Simulation ----------
/** Seconds per simulation step. Smaller is more precise but slower. */
export const DT = 0.1;
/** After the buzzer, keep simulating (robots unpowered) until balls stop, up to this many seconds. Scores are counted once everything is at rest (10.5). */
export const MAX_SETTLE_TIME = 5;

// ---------- Launching ----------
/** Height (ft) a ball leaves the launcher. */
export const LAUNCH_HEIGHT = 1.2;
/** Closest (ft) a robot can shoot from, measured to the CELL opening. Any closer and the ball can't arc in. */
export const MIN_SHOT_DISTANCE = 1.5;
/** A robot's accuracy slider is its accuracy up close. At its longest range, it hits only this fraction as often. */
export const ACCURACY_AT_MAX_RANGE = 0.5;

// ---------- Driving ----------
/** How fast each drivetrain can spin in place, in degrees per second. */
export const TURN_RATE: Record<Drivetrain, number> = { mecanum: 270, swerve: 360, tank: 180 };
/** Top speed sideways, as a fraction of top speed forward. A tank drive can't move sideways at all. */
export const STRAFE_SPEED: Record<Drivetrain, number> = { mecanum: 0.8, swerve: 1, tank: 0 };
/** How well each drivetrain grips the tiles when pushing. Multiplied by weight to get pushing strength. */
export const TRACTION: Record<Drivetrain, number> = { mecanum: 0.7, swerve: 0.9, tank: 1 };
/** Every timed action (intake, aim, launch, place) randomly takes up to this much longer or shorter. Drivers aren't perfectly consistent. */
export const ACTION_TIME_JITTER = 0.15;
/** A robot pushed farther than this (ft) from where it lined up has been bumped off its aim. Smaller nudges don't matter. */
export const BUMP_DISTANCE = 0.3;
/** Fixing the aim after a bump takes this fraction of the robot's full align time. */
export const BUMP_REAIM = 0.25;
/** The first shot after a bump goes in this fraction as often as usual. */
export const BUMP_ACCURACY = 0.85;
/** Extra distance (ft) past the frame edge an intake can grab a ball from. */
export const INTAKE_REACH = 0.35;
/** Grabbing POLLEN out of the bottom of a FLOWER takes this many times longer than off the floor. */
export const FLOWER_INTAKE_FACTOR = 1.3;

// ---------- Elements ----------
/** Balls lower than this (ft) get pushed along by robot frames instead of passing under them. */
export const BUMPER_HEIGHT = 0.5;
/** How many POLLEN fit below a FLOWER's middle ring (read from Figure 10-5, picture D). */
export const FLOWER_BELOW_SLOTS = 2;
/** Seconds after a HIVE finishes tipping before the human player drops the earned NECTAR. */
export const HUMAN_NECTAR_DELAY = 2;
/** Speed range (ft/s) of elements pouring out of a tipped CELL, heading away from the HIVE. */
export const SPILL_SPEED = { min: 3, max: 8 };
/** Speed range (ft/s) of a missed shot bouncing back off the HIVE. */
export const MISS_BOUNCE_SPEED = { min: 1.5, max: 5 };

// ---------- Defense ----------
/** Robots closer than this (ft) count as touching. */
export const CONTACT_GAP = 0.35;
/** A defender backs off once the PIN count reaches this many seconds, to avoid the 3-second foul (G421). */
export const PIN_BACK_OFF = 2.3;
/** A PIN count ends after the robots are 2 ft apart for 3 s (G421). */
export const PIN_RESET_GAP = 2;
export const PIN_RESET_TIME = 3;
/** A defender sticks with one target for at least this long before switching. */
export const DEFENSE_COMMIT = 4;
