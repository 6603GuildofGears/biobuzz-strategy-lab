import type { Alliance } from "./types";

/**
 * FIELD geometry in feet, measured from the BIOBUZZ Competition Manual figures (9.2 to 9.7, 10.3.1).
 *
 *   x runs from the red wall (0) to the blue wall (12).
 *   y runs from the audience wall (0) to the rear wall (12).
 *
 * The FIELD is 180° rotationally symmetric: turning anything red around the center
 * of the FIELD gives the matching blue thing. `rotate` does exactly that.
 */
export const FIELD = 12;
export const CENTER = 6;

export interface Pt {
  x: number;
  y: number;
}

export interface Rect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

export const rotate = (p: Pt): Pt => ({ x: FIELD - p.x, y: FIELD - p.y });
export const rotateRect = (r: Rect): Rect => ({ x0: FIELD - r.x1, y0: FIELD - r.y1, x1: FIELD - r.x0, y1: FIELD - r.y0 });
const byAlliance = <T>(red: T, turn: (v: T) => T): Record<Alliance, T> => ({ red, blue: turn(red) });

// ---------- HIVE Structure (9.6, Figures 9-8 to 9-11) ----------
/**
 * The frame is two A-shaped triangles joined at the top by a crossbar. Robots can drive UNDER the
 * HIVES between the triangles (the lowest CELL hangs 30.6 in up, robots are at most 29 in tall),
 * but not through a triangle.
 */
const FRAME_HALF_WIDTH = 49.46 / 24; // frame is 49.46 in wide (along x)
const FRAME_HALF_DEPTH = 38.95 / 24; // and 38.95 in deep (along y)
const FRAME_THICK = 0.06;
export const HIVE_FRAME: Rect[] = [-1, 1].map((side) => {
  const x = CENTER + side * FRAME_HALF_WIDTH;
  return { x0: x - FRAME_THICK, y0: CENTER - FRAME_HALF_DEPTH, x1: x + FRAME_THICK, y1: CENTER + FRAME_HALF_DEPTH };
});
/** The whole frame footprint, used only for drawing. */
export const HIVE_FOOTPRINT: Rect = {
  x0: CENTER - FRAME_HALF_WIDTH,
  y0: CENTER - FRAME_HALF_DEPTH,
  x1: CENTER + FRAME_HALF_WIDTH,
  y1: CENTER + FRAME_HALF_DEPTH,
};

/** Each alliance has its own HIVE. Their centers are 25.5 in apart. */
export const HIVE_X: Record<Alliance, number> = { red: CENTER - 25.5 / 24, blue: CENTER + 25.5 / 24 };
/** The CELL opening is 20 in wide. */
export const CELL_HALF_WIDTH = 10 / 12;
/**
 * The upward CELL is tilted 30°, so its opening faces out toward one end of the FIELD.
 * The opening sits about 18.6 in (21.5 in along the tilted arm) from the pivot, and its middle
 * is about 59.5 in above the tiles (it spans 53.5 in to 65.6 in).
 */
export const CELL_OPENING_OFFSET = 18.6 / 12;
export const CELL_OPENING_HEIGHT = 59.5 / 12;
/** The CELL is 12 in deep. Shots aim at its middle, 6 in inside the opening. */
const CELL_MIDDLE_OFFSET = CELL_OPENING_OFFSET - 0.5;

/** "north" = the upward CELL faces the rear wall, "south" = it faces the audience. */
export type HiveEnd = "north" | "south";
export const otherEnd = (e: HiveEnd): HiveEnd => (e === "north" ? "south" : "north");
/** Figure 10-2: red's upward CELL starts on the audience side, blue's on the rear side. */
export const START_OPEN_END: Record<Alliance, HiveEnd> = { red: "south", blue: "north" };

const endSign = (end: HiveEnd) => (end === "north" ? 1 : -1);
/** Where a shot is aimed: the middle of the upward CELL, seen from above. */
export const cellTarget = (a: Alliance, end: HiveEnd): Pt => ({ x: HIVE_X[a], y: CENTER + endSign(end) * CELL_MIDDLE_OFFSET });
/** The middle of the CELL opening, seen from above. */
export const cellOpening = (a: Alliance, end: HiveEnd): Pt => ({ x: HIVE_X[a], y: CENTER + endSign(end) * CELL_OPENING_OFFSET });

/**
 * True when a shot from `from` goes in through the front of this alliance's upward CELL:
 * the robot is out past the opening, and the straight line to the CELL passes through the opening.
 */
export function facesOpening(a: Alliance, end: HiveEnd, from: Pt): boolean {
  const s = endSign(end);
  const planeY = CENTER + s * CELL_OPENING_OFFSET;
  if ((from.y - planeY) * s < 0.2) return false;
  const target = cellTarget(a, end);
  const along = (planeY - from.y) / (target.y - from.y);
  const xAtOpening = from.x + along * (target.x - from.x);
  return Math.abs(xAtOpening - HIVE_X[a]) <= CELL_HALF_WIDTH - 0.1;
}

// ---------- FLOWERS (9.7, Figure 10-2) ----------
/**
 * Four FLOWERS, each mounted on a different wall, two tiles in from a corner.
 * `out` points from the wall into the FIELD.
 */
export interface Flower {
  x: number;
  y: number;
  out: Pt;
}
const FLOWER_FROM_WALL = 0.25;
export const FLOWER_RADIUS = 0.36;
export const FLOWERS: Flower[] = [
  { x: FLOWER_FROM_WALL, y: 4, out: { x: 1, y: 0 } }, // red wall
  { x: 8, y: FLOWER_FROM_WALL, out: { x: 0, y: 1 } }, // audience wall
  { x: FIELD - FLOWER_FROM_WALL, y: 8, out: { x: -1, y: 0 } }, // blue wall
  { x: 4, y: FIELD - FLOWER_FROM_WALL, out: { x: 0, y: -1 } }, // rear wall
];

/** Each FLOWER is solid from its wall out to the far edge of its rings. */
export const FLOWER_BLOCKS: Rect[] = FLOWERS.map((f) => {
  const reach = FLOWER_FROM_WALL + FLOWER_RADIUS;
  if (f.out.x > 0) return { x0: 0, y0: f.y - FLOWER_RADIUS, x1: reach, y1: f.y + FLOWER_RADIUS };
  if (f.out.x < 0) return { x0: FIELD - reach, y0: f.y - FLOWER_RADIUS, x1: FIELD, y1: f.y + FLOWER_RADIUS };
  if (f.out.y > 0) return { x0: f.x - FLOWER_RADIUS, y0: 0, x1: f.x + FLOWER_RADIUS, y1: reach };
  return { x0: f.x - FLOWER_RADIUS, y0: FIELD - reach, x1: f.x + FLOWER_RADIUS, y1: FIELD };
});

/** Where a robot sits, front toward the FLOWER, to use it. `halfLength` is half the robot's length. */
export const flowerSpot = (fi: number, halfLength: number): Pt => {
  const f = FLOWERS[fi];
  const d = FLOWER_RADIUS + halfLength + 0.05;
  return { x: f.x + f.out.x * d, y: f.y + f.out.y * d };
};

/** Everything a robot cannot drive through. */
export const OBSTACLES: Rect[] = [...HIVE_FRAME, ...FLOWER_BLOCKS];

// ---------- Zones (9.3, Figures 9-2 and 9-3) ----------
/** LOADING ZONE: 23 in along the alliance wall between two tile seams, 11 in deep. */
export const LOADING_ZONE = byAlliance<Rect>({ x0: 0, y0: 8.04, x1: 11 / 12, y1: 9.96 }, rotateRect);
/** GARDEN: a 23 in by 2 in strip against the audience (red) or rear (blue) wall, in the corner. */
export const GARDEN = byAlliance<Rect>({ x0: 0, y0: 0, x1: 23 / 12, y1: 2 / 12 }, rotateRect);
/** Where the human player drops NECTAR into the LOADING ZONE (G427). */
export const NECTAR_DROP = byAlliance<Pt>({ x: 0.45, y: 9 }, rotate);

// ---------- Robot placement ----------
/** Heading (radians) that faces straight into the FIELD from each alliance wall. 0 faces +x. */
export const INWARD: Record<Alliance, number> = { red: 0, blue: Math.PI };

/**
 * Legal starting spots (G304: touching the wall, on your own half, not in the LOADING ZONE, not
 * touching a FLOWER). Robot 1 starts on the audience wall facing its HIVE's opening. Robot 2
 * starts on the alliance wall between the FLOWER and the LOADING ZONE.
 */
export function startPose(a: Alliance, slot: 0 | 1, halfLength: number): Pt & { heading: number } {
  const red =
    slot === 0 ? { x: HIVE_X.red, y: halfLength + 0.01, heading: Math.PI / 2 } : { x: halfLength + 0.01, y: 6, heading: 0 };
  if (a === "red") return red;
  const p = rotate(red);
  return { ...p, heading: red.heading + Math.PI };
}

/**
 * Parking spots: both robots stick partly into the LOADING ZONE (partly is enough, 10.5.4),
 * one on each side of its middle. They stay 0.3 ft off the wall, so a robot parked at the end
 * of AUTO also earns LEAVE (which needs it not touching the wall).
 */
export function parkSpot(a: Alliance, slot: 0 | 1, halfWidth: number, halfLength: number): Pt {
  const lz = LOADING_ZONE.red;
  const mid = (lz.y0 + lz.y1) / 2;
  const side = slot === 0 ? 1 : -1;
  const red = { x: halfLength + 0.3, y: mid + side * (halfWidth + 0.05) };
  return a === "red" ? red : rotate(red);
}

// ---------- Helpers ----------
/** Length of the vector (x, y). (Math.hypot does the same thing but is much slower.) */
export const len = (x: number, y: number) => Math.sqrt(x * x + y * y);
export const dist = (a: Pt, b: Pt) => len(a.x - b.x, a.y - b.y);

export const inRect = (p: Pt, r: Rect, pad = 0) =>
  p.x >= r.x0 - pad && p.x <= r.x1 + pad && p.y >= r.y0 - pad && p.y <= r.y1 + pad;

export const inflate = (r: Rect, by: number): Rect => ({ x0: r.x0 - by, y0: r.y0 - by, x1: r.x1 + by, y1: r.y1 + by });

/** Smallest signed difference between two angles, in (-π, π]. */
export const angleDiff = (a: number, b: number) => {
  let d = (a - b) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
};
