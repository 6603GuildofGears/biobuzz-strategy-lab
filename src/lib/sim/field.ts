import type { Alliance } from "./types";

/**
 * Field geometry in feet. Origin is the audience-side corner of the red wall;
 * x runs red wall (0) -> blue wall (12), y runs audience wall (0) -> rear wall (12).
 * The layout is 180° rotationally symmetric, like the real FIELD.
 * Positions are approximations from the manual figures, not the official CAD.
 */
export const FIELD = 12;
export const ROBOT_HALF = 0.75;

export const MATCH_LENGTH = 158;
export const AUTO_END = 30;
export const TELEOP_START = 38;
export const FLOWER_UNLOCK = MATCH_LENGTH - 60;

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
const rotateRect = (r: Rect): Rect => ({
  x0: FIELD - r.x1,
  y0: FIELD - r.y1,
  x1: FIELD - r.x0,
  y1: FIELD - r.y0,
});

export const HIVE_CENTER: Pt = { x: 6, y: 6 };
export const HIVE_POS: Record<Alliance, Pt> = {
  red: { x: 5.2, y: 6 },
  blue: { x: 6.8, y: 6 },
};
export const HIVE_CELL_OFFSET = 0.78;
/** Robots can't launch from under the frame. */
export const MIN_LAUNCH_DIST = 2.4;

const RED_LZ: Rect = { x0: 0, y0: 12 - 23 / 12, x1: 11 / 12, y1: 12 };
const RED_GARDEN: Rect = { x0: 0, y0: 0, x1: 23 / 12, y1: 2 / 12 };

export const LOADING_ZONE: Record<Alliance, Rect> = {
  red: RED_LZ,
  blue: rotateRect(RED_LZ),
};

export const GARDEN: Record<Alliance, Rect> = {
  red: RED_GARDEN,
  blue: rotateRect(RED_GARDEN),
};

/** FLOWERS mounted on the audience and rear walls. */
export const FLOWERS: Pt[] = [
  { x: 3, y: 0.25 },
  { x: 9, y: 0.25 },
  { x: 9, y: 11.75 },
  { x: 3, y: 11.75 },
];

/** Where a robot sits to use a FLOWER. */
export const FLOWER_SERVICE: Pt[] = FLOWERS.map((f) => ({
  x: f.x,
  y: f.y < 6 ? f.y + 1.05 : f.y - 1.05,
}));

export const START_POS: Record<Alliance, [Pt, Pt]> = {
  red: [
    { x: ROBOT_HALF, y: 3.5 },
    { x: ROBOT_HALF, y: 7.25 },
  ],
  blue: [rotate({ x: ROBOT_HALF, y: 3.5 }), rotate({ x: ROBOT_HALF, y: 7.25 })],
};

export const PARK_SPOT: Record<Alliance, [Pt, Pt]> = {
  red: [
    { x: ROBOT_HALF, y: 10.55 },
    { x: ROBOT_HALF + 0.35, y: 11.25 },
  ],
  blue: [rotate({ x: ROBOT_HALF, y: 10.55 }), rotate({ x: ROBOT_HALF + 0.35, y: 11.25 })],
};

export const LZ_DROP: Record<Alliance, Pt> = {
  red: { x: 0.45, y: 11.1 },
  blue: rotate({ x: 0.45, y: 11.1 }),
};

export const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y);

export const clampField = (p: Pt, margin = 0.15): Pt => ({
  x: Math.min(FIELD - margin, Math.max(margin, p.x)),
  y: Math.min(FIELD - margin, Math.max(margin, p.y)),
});

export const inRect = (p: Pt, r: Rect, pad = 0) =>
  p.x >= r.x0 - pad && p.x <= r.x1 + pad && p.y >= r.y0 - pad && p.y <= r.y1 + pad;
