import type { GameSettings, RobotProfile, RoleConfig, Strategy } from "./types";

const hive = (label: string, over: Partial<RoleConfig> = {}): RoleConfig => ({
  label,
  ammo: "all",
  flowerStart: null,
  flowerMode: "fill",
  defend: false,
  park: true,
  ...over,
});

export const STRATEGIES: Strategy[] = [
  {
    id: "hive-only",
    name: "Hive Only",
    tagline: "Shoot POLLEN + NECTAR all match, ignore FLOWERS",
    description:
      "Both robots cycle every POLLEN and NECTAR they can reach into the HIVE for the whole match, then park. Maximizes HIVE TIPS (20 each) and chases the POLLINATOR RPs, but leaves all FLOWER points to the opponent.",
    roles: [hive("Hive cycler"), hive("Hive cycler")],
  },
  {
    id: "pollen-hive-nectar-flowers",
    name: "Pollen Hive, Nectar Flowers",
    tagline: "Hive with POLLEN only; save every NECTAR for the endgame",
    description:
      "Neither robot ever launches NECTAR. All POLLEN goes into the HIVE until 60 s left, then both robots claim FLOWERS with the stockpiled NECTAR and stack POLLEN on top.",
    roles: [
      hive("Pollen hive → flowers", { ammo: "pollen", flowerStart: 60 }),
      hive("Pollen hive → flowers", { ammo: "pollen", flowerStart: 60 }),
    ],
  },
  {
    id: "flower-rush",
    name: "Flower Rush @ 60s",
    tagline: "Everything into the HIVE, then both robots swarm FLOWERS",
    description:
      "Both robots launch POLLEN and NECTAR into the HIVE until FLOWERS unlock at 60 s, then both switch to claiming FLOWERS (one NECTAR + three POLLEN per trip).",
    roles: [
      hive("Hive → flowers", { flowerStart: 60 }),
      hive("Hive → flowers", { flowerStart: 60 }),
    ],
  },
  {
    id: "split-endgame",
    name: "Split Endgame",
    tagline: "One robot keeps tipping, one robot builds FLOWERS",
    description:
      "Robot 1 stays on the HIVE the whole match. Robot 2 launches POLLEN only (keeping NECTAR on the field) and moves to FLOWERS at 60 s.",
    roles: [hive("Hive cycler"), hive("Pollen hive → flowers", { ammo: "pollen", flowerStart: 60 })],
  },
  {
    id: "late-cap",
    name: "Late Cap",
    tagline: "Hive until 20 s left, then drop NECTAR on top of FLOWERS",
    description:
      "Both robots cycle the HIVE until 20 s left, then carry NECTAR only and cap as many FLOWERS as possible, stealing ownership of whatever the opponent built.",
    roles: [
      hive("Hive → capper", { flowerStart: 20, flowerMode: "cap" }),
      hive("Hive → capper", { flowerStart: 20, flowerMode: "cap" }),
    ],
  },
  {
    id: "builder-capper",
    name: "Builder + Capper",
    tagline: "Robot 2 builds FLOWERS at 60 s, Robot 1 caps at 15 s",
    description:
      "Robot 1 cycles the HIVE and switches to capping FLOWERS with 15 s left. Robot 2 launches POLLEN only and builds FLOWERS from 60 s.",
    roles: [
      hive("Hive → capper", { flowerStart: 15, flowerMode: "cap" }),
      hive("Pollen hive → flowers", { ammo: "pollen", flowerStart: 60 }),
    ],
  },
  {
    id: "hive-bottom-claim",
    name: "Hive + Bottom Claim",
    tagline: "Robot 2 puts one NECTAR in every FLOWER at 60 s, then back to the HIVE",
    description:
      "Robot 1 cycles the HIVE all match. Robot 2 does too until FLOWERS unlock at 60 s, then grabs the NECTAR the human player enters and drops one into each FLOWER nobody has claimed. The bottom NECTAR bonus (5 per FLOWER) can't be taken away, because NECTAR can't be pulled back out. Then it returns to the HIVE.",
    roles: [hive("Hive cycler"), hive("Hive → claim bottoms", { flowerStart: 60, flowerMode: "claim" })],
  },
  {
    id: "hive-defense",
    name: "Hive + Defender",
    tagline: "One robot shoots, the other guards the opponent's CELL",
    description:
      "Robot 1 cycles the HIVE all match. In TELEOP, Robot 2 plays zone defense: it stands in front of the opponent's upward CELL and pushes robots that come to shoot (backing off before a 3-second PIN), then parks.",
    roles: [hive("Hive cycler"), hive("Defender", { defend: true })],
  },
];

export const CUSTOM_ID = "custom";

export const defaultCustom = (): Strategy => ({
  id: CUSTOM_ID,
  name: "Custom",
  tagline: "Your own mix of roles",
  description: "Configure each robot's role yourself.",
  roles: [hive("Robot 1"), hive("Robot 2", { ammo: "pollen", flowerStart: 45 })],
});

export const PRESETS: Record<string, RobotProfile> = {
  Rookie: {
    driveSpeed: 3,
    intakeTime: 0.4,
    intakeWidth: 0.5,
    launchTime: 0.5,
    launchRange: 3,
    pollenAccuracy: 0.55,
    nectarAccuracy: 0.45,
    flowerTime: 3.5,
    flowerAccuracy: 0.6,
    alignTime: 1,
    autoReliability: 0.6,
    autoSpeed: 0.5,
    autoPark: true,
    widthIn: 18,
    lengthIn: 18,
    heightIn: 18,
    weightLb: 26,
    drivetrain: "tank",
    acceleration: 5,
    capacity: 3,
    shotSpeed: 18,
    launchHeightIn: 14.5,
    shooterOnBack: false,
    shootOnTheMove: false,
  },
  Average: {
    driveSpeed: 4.5,
    intakeTime: 0.2,
    intakeWidth: 0.75,
    launchTime: 0.25,
    launchRange: 4.5,
    pollenAccuracy: 0.75,
    nectarAccuracy: 0.68,
    flowerTime: 2,
    flowerAccuracy: 0.8,
    alignTime: 0.5,
    autoReliability: 0.85,
    autoSpeed: 0.7,
    autoPark: true,
    widthIn: 17,
    lengthIn: 17,
    heightIn: 24,
    weightLb: 30,
    drivetrain: "mecanum",
    acceleration: 8,
    capacity: 4,
    shotSpeed: 20,
    launchHeightIn: 14.5,
    shooterOnBack: false,
    shootOnTheMove: false,
  },
  Elite: {
    driveSpeed: 6,
    intakeTime: 0.1,
    intakeWidth: 1,
    launchTime: 0.1,
    launchRange: 8,
    pollenAccuracy: 0.93,
    nectarAccuracy: 0.88,
    flowerTime: 1,
    flowerAccuracy: 0.92,
    alignTime: 0.2,
    autoReliability: 0.97,
    autoSpeed: 0.85,
    autoPark: true,
    widthIn: 16,
    lengthIn: 17,
    heightIn: 29,
    weightLb: 36,
    drivetrain: "mecanum",
    acceleration: 12,
    capacity: 4,
    shotSpeed: 26,
    launchHeightIn: 14.5,
    shooterOnBack: false,
    shootOnTheMove: true,
  },
};

export const DEFAULT_SETTINGS: GameSettings = {
  tipThreshold: 7.5,
  tipVariance: 0.35,
  nectarWeight: 1.67,
  /** Figure 10-5 shows about 7 elements fitting between the middle and top rings. */
  flowerCapacity: 7,
  defenseEffect: 0.35,
  blockChance: 0.6,
  tipSpinTime: 1,
  cellHeight: 3,
  ballFriction: 2.5,
};
