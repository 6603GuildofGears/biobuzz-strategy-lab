export type Alliance = "red" | "blue";

/** P = pollen, R = red nectar, B = blue nectar */
export type Kind = "P" | "R" | "B";

export interface RobotProfile {
  /** Top drive speed in ft/s. */
  driveSpeed: number;
  /** Seconds to intake one element once the robot is on top of it. */
  intakeTime: number;
  /** Seconds between launches (per element). */
  launchTime: number;
  /** Max distance (ft) from the robot's HIVE it can launch from. */
  launchRange: number;
  /** Chance a launched POLLEN lands in the upward CELL. */
  pollenAccuracy: number;
  /** Chance a launched NECTAR lands in the upward CELL. */
  nectarAccuracy: number;
  /** Seconds to place one element into the top of a FLOWER. */
  flowerTime: number;
  /** Chance a FLOWER placement stays in the FLOWER. */
  flowerAccuracy: number;
  /** Fixed seconds lost per trip to line up / aim / accelerate. */
  alignTime: number;
  /** Chance the AUTO routine runs at all. */
  autoReliability: number;
  /** Speed multiplier applied to everything during AUTO. */
  autoSpeed: number;
  /** Whether AUTO ends by parking in the LOADING ZONE. */
  autoPark: boolean;
  /** Frame width in inches (left-right). The starting size limit is 18 in. */
  widthIn: number;
  /** Frame length in inches (front-back). */
  lengthIn: number;
  /** Robot weight in pounds, used when robots push each other. */
  weightLb: number;
  /** Drivetrain type: sets traction for pushing and how much time it loses lining up. */
  drivetrain: Drivetrain;
  /** How fast the robot reaches top speed and brakes, in ft/s². */
  acceleration: number;
  /** How many elements the robot can hold at once (G407 caps this at 4). */
  capacity: number;
  /** Launcher exit speed in ft/s. Faster shots spend less time in the air. */
  shotSpeed: number;
}

export type Drivetrain = "mecanum" | "tank" | "swerve";

export type Ammo = "all" | "pollen";
export type FlowerMode = "fill" | "cap";

export interface RoleConfig {
  label: string;
  /** What this robot LAUNCHES into the HIVE. */
  ammo: Ammo;
  /** Seconds left in the MATCH at which the robot switches to FLOWERS (<= 60), or null to never. */
  flowerStart: number | null;
  /** fill = claim a FLOWER with NECTAR then stuff POLLEN on top; cap = NECTAR only, steal ownership. */
  flowerMode: FlowerMode;
  /** Play defense on the opponents during TELEOP instead of scoring. */
  defend: boolean;
  /** Return to the LOADING ZONE at the end of the MATCH. */
  park: boolean;
}

export interface Strategy {
  id: string;
  name: string;
  tagline: string;
  description: string;
  roles: [RoleConfig, RoleConfig];
}

export interface GameSettings {
  /** HIVE tips when CELL weight (in POLLEN units) reaches this. */
  tipThreshold: number;
  /** Random +/- spread on the tip threshold. */
  tipVariance: number;
  /** Weight of one NECTAR in POLLEN units. */
  nectarWeight: number;
  /** Elements that fit in a FLOWER scoring volume. */
  flowerCapacity: number;
  /** Fraction an opponent is slowed while a defender is on it. */
  defenseEffect: number;
  /** Expected MAJOR FOULS per minute of defensive contact. */
  defenseFoulRate: number;
  /** Seconds the HIVE takes to rotate before a tipped CELL empties. */
  tipSpinTime: number;
  /** Height (ft) elements fall from when a CELL empties. */
  cellHeight: number;
  /** How quickly rolling elements slow down on the tiles, in ft/s². */
  ballFriction: number;
}

export interface ScoreBreakdown {
  leave: number;
  autoPark: number;
  autoTips: number;
  teleopTips: number;
  cell: number;
  flowerBottom: number;
  flowerOwned: number;
  garden: number;
  park: number;
  foulCredit: number;
  total: number;
  tips: number;
  rp: number;
  swarmRP: boolean;
  pollinator1: boolean;
  pollinator2: boolean;
}

export interface MatchEvent {
  t: number;
  alliance: Alliance;
  text: string;
}

export interface RobotFrame {
  x: number;
  y: number;
  /** Half width / half length in ft. */
  hw: number;
  hl: number;
  held: Kind[];
  mode: string;
}

export interface Frame {
  t: number;
  robots: RobotFrame[];
  /** z is height above the tiles in ft (0 = on the floor). */
  floor: { x: number; y: number; z: number; k: Kind }[];
  cells: Record<Alliance, Kind[]>;
  hiveFlip: Record<Alliance, number>;
  flowers: { stack: Kind[]; bottom: number }[];
  score: Record<Alliance, number>;
}

export interface MatchResult {
  red: ScoreBreakdown;
  blue: ScoreBreakdown;
  winner: Alliance | "tie";
  events: MatchEvent[];
  frames?: Frame[];
}
