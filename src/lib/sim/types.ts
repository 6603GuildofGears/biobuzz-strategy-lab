export type Alliance = "red" | "blue";

/** P = POLLEN, R = red NECTAR, B = blue NECTAR */
export type Kind = "P" | "R" | "B";

export type Drivetrain = "mecanum" | "tank" | "swerve";

/** Everything the sliders say about one robot. */
export interface RobotProfile {
  /** Top drive speed in ft/s. */
  driveSpeed: number;
  /** How fast the robot reaches top speed and brakes, in ft/s². */
  acceleration: number;
  /** Seconds for the intake to pull one element in. The robot drives over balls no faster than its intake can swallow them. */
  intakeTime: number;
  /** How much of the front the intake covers (0.25 to 1). A full-width intake picks up balls it wasn't aiming for. */
  intakeWidth: number;
  /** Seconds between launches. */
  launchTime: number;
  /** Longest shot (ft) the launcher is built for. Shot speed can make it shorter. */
  launchRange: number;
  /** Launcher exit speed in ft/s. Sets how far a ball can fly up to the CELL. */
  shotSpeed: number;
  /** Height (in) the ball leaves the launcher. Higher clears a defender sooner and needs less climb to the CELL. */
  launchHeightIn: number;
  /** Chance a POLLEN shot goes in, from close range. */
  pollenAccuracy: number;
  /** Chance a NECTAR shot goes in, from close range. */
  nectarAccuracy: number;
  /** Seconds to place one element into the top of a FLOWER. */
  flowerTime: number;
  /** Chance a FLOWER placement stays in. */
  flowerAccuracy: number;
  /** Seconds lost per trip to line up before shooting or placing. */
  alignTime: number;
  /** Chance the AUTO routine runs at all. */
  autoReliability: number;
  /** Speed multiplier for everything during AUTO. */
  autoSpeed: number;
  /** Whether AUTO ends by parking in the LOADING ZONE. */
  autoPark: boolean;
  /** Frame width in inches (side to side). */
  widthIn: number;
  /** Frame length in inches (front to back). */
  lengthIn: number;
  /** Height in inches with everything extended (the rules allow 29 in). A tall robot in front of a shooter can block shots. */
  heightIn: number;
  /** Robot weight in pounds, used when robots push each other. */
  weightLb: number;
  drivetrain: Drivetrain;
  /** How many elements the robot can hold (G407 caps this at 4). */
  capacity: number;
  /** Shooter on the back, opposite the intake, so the robot turns its back to the HIVE to shoot. Off = picks up and shoots from the front. */
  shooterOnBack: boolean;
  /** Can line up and shoot while still driving (mecanum or swerve only, since it needs to strafe). */
  shootOnTheMove: boolean;
}

export type Ammo = "all" | "pollen";
export type FlowerMode = "fill" | "cap" | "claim";

/** What one robot does during the match. */
export interface RoleConfig {
  label: string;
  /** What this robot LAUNCHES into the HIVE. */
  ammo: Ammo;
  /** Seconds left in the MATCH when the robot switches to FLOWERS (at most 60), or null to never. */
  flowerStart: number | null;
  /**
   * fill = claim a FLOWER with NECTAR then stack POLLEN on top; cap = NECTAR only, to steal ownership;
   * claim = one NECTAR in each FLOWER nobody has claimed yet (the bottom NECTAR bonus), then back to the HIVE.
   */
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

/** Game details the manual doesn't pin down, adjustable on the Game tab. */
export interface GameSettings {
  /** The HIVE tips when the CELL weight (in POLLEN units) reaches this. */
  tipThreshold: number;
  /** Random +/- spread on the tip threshold. */
  tipVariance: number;
  /** Weight of one NECTAR in POLLEN units. */
  nectarWeight: number;
  /** Elements that fit in a FLOWER scoring volume. */
  flowerCapacity: number;
  /** How much an opponent is slowed while a defender is pressed against it (0 to 1). */
  defenseEffect: number;
  /** Chance a shot is knocked down when a robot is standing in its path (0 to 1). */
  blockChance: number;
  /** Seconds the HIVE takes to rotate before a tipped CELL empties. */
  tipSpinTime: number;
  /** Height (ft) elements fall from when a tipped CELL empties. */
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

/** How an alliance's robots actually played, for checking that the robots behave sensibly. */
export interface PlayStats {
  shots: number;
  hits: number;
  /** Sum of shot distances (ft). Divide by shots for the average. */
  shotDistance: number;
  /** Shots knocked down by a robot standing in front of the shooter. */
  blocked: number;
  /** Shooting trips, and elements fired across all of them. */
  volleys: number;
  volleyElements: number;
  /** Robot-seconds in TELEOP with nothing useful to do. */
  idleTime: number;
  fouls: number;
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
  /** Radians, 0 faces +x. The nose mark is the intake. */
  heading: number;
}

export interface FlowerFrame {
  /** Elements in the scoring volume, bottom to top. */
  volume: Kind[];
  /** POLLEN below the middle ring (not scoring, can be pulled out). */
  below: number;
}

export interface Frame {
  t: number;
  robots: RobotFrame[];
  /** z is height above the tiles in ft (0 = on the floor). */
  floor: { x: number; y: number; z: number; k: Kind }[];
  cells: Record<Alliance, Kind[]>;
  hiveUp: Record<Alliance, "north" | "south">;
  flowers: FlowerFrame[];
  score: Record<Alliance, number>;
}

export interface MatchResult {
  red: ScoreBreakdown;
  blue: ScoreBreakdown;
  winner: Alliance | "tie";
  events: MatchEvent[];
  stats: Record<Alliance, PlayStats>;
  frames?: Frame[];
}
