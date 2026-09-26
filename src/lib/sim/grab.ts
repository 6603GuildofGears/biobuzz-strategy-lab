import { cos, sin } from "./mathx";
import { CENTER, FIELD, OBSTACLES } from "./field";
import { boxContact, rectBox } from "./motion";
import { AUTO_END, BALL_RADIUS } from "./rules";
import type { Ball, MatchState, Robot } from "./state";

/**
 * Can the robot get this ball into its intake, and from where? A ball tucked between a FLOWER and
 * the wall may sit closer to the FLOWER than half the robot's width, so the frame hits the FLOWER
 * before the ball is inside the intake. A full-width intake can still reach it; a narrow one can't.
 * The brain skips balls with no pose that works, and the collect job lines up on the pose it found.
 */

/** Where the robot's center sits and which way it faces, with the ball just inside the intake. */
export interface GrabPose {
  x: number;
  y: number;
  heading: number;
  /** True when the ball is out in the open, so the robot can simply drive straight over it. */
  open: boolean;
}

/** Does the robot fit at (x, y) facing `heading`: inside the walls, clear of the HIVE frame and FLOWERS, and in AUTO on its own half? */
export function fitsPose(m: MatchState, r: Robot, x: number, y: number, heading: number): boolean {
  const c = cos(heading);
  const s = sin(heading);
  const ex = Math.abs(c) * r.hl + Math.abs(s) * r.hw;
  const ey = Math.abs(s) * r.hl + Math.abs(c) * r.hw;
  if (x < ex || x > FIELD - ex || y < ey || y > FIELD - ey) return false;
  if (m.t < AUTO_END && (r.alliance === "red" ? x + ex > CENTER : x - ex < CENTER)) return false;
  // The frame, turned to its heading, clear of the HIVE frame and FLOWERS (the same test collideRobots uses).
  const frame = { x, y, c, s, hl: r.hl - 0.01, hw: r.hw - 0.01 };
  return !OBSTACLES.some((o) => boxContact(frame, rectBox(o)).depth > 0);
}

/** Angles tried, in 15° steps out from the preferred one. */
const TURNS = [0, ...Array.from({ length: 11 }, (_, i) => [(i + 1), -(i + 1)]).flat(), 12].map((k) => (k * Math.PI) / 12);

/**
 * The pose closest to facing `prefer` (radians) that gets ball b into the intake, or null if the frame
 * can't get close enough from any direction.
 */
export function grabPose(m: MatchState, r: Robot, b: Ball, prefer: number): GrabPose | null {
  const br = BALL_RADIUS[b.k];
  const ahead = r.hl + br - 0.05; // ball just inside the front edge
  // Well clear of every wall and FIELD element (and the center line in AUTO)? Any approach works.
  const clear = r.hl * 2 + r.hw + 0.8;
  const open =
    b.x > clear && b.x < FIELD - clear && b.y > clear && b.y < FIELD - clear &&
    (m.t >= AUTO_END || Math.abs(b.x - CENTER) > clear) &&
    OBSTACLES.every((o) => b.x < o.x0 - clear || b.x > o.x1 + clear || b.y < o.y0 - clear || b.y > o.y1 + clear);
  if (open) return { x: b.x - cos(prefer) * ahead, y: b.y - sin(prefer) * ahead, heading: prefer, open: true };
  const maxSide = Math.max(0, r.intakeHalf - br * 0.3 - 0.02); // how far off center the ball can be and still go in
  const sides = maxSide > 0 ? [0, 0.5, -0.5, 1, -1] : [0];
  for (const turn of TURNS) {
    const heading = prefer + turn;
    const c = cos(heading);
    const s = sin(heading);
    for (const f of sides) {
      const side = f * maxSide;
      const x = b.x - c * ahead + s * side;
      const y = b.y - s * ahead - c * side;
      if (fitsPose(m, r, x, y, heading)) return { x, y, heading, open: turn === 0 && f === 0 && fitsPose(m, r, x - c * 0.6, y - s * 0.6, heading) };
    }
  }
  return null;
}
