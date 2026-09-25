import { FIELD, FLOWER_BLOCKS, HIVE_FRAME, len } from "./field";
import { BALL_RADIUS } from "./rules";
import { footprint } from "./motion";
import type { Ball, MatchState } from "./state";
import { BUMPER_HEIGHT } from "./tuning";

/**
 * Ball physics: falling, bouncing, rolling to a stop, bumping into walls, FIELD elements,
 * robots, and each other.
 */

const GRAVITY = 32.2;
/** FLOWERS are 21.5 in tall. The HIVE frame is solid up to about 44 in. */
const FLOWER_HEIGHT = 1.8;
const FRAME_HEIGHT = 3.6;
const LOW_SOLIDS = [...FLOWER_BLOCKS, ...HIVE_FRAME];

export const onFloor = (b: Ball) => b.z <= 0 && b.vz === 0;
/** Sitting on the floor, not moving at all. */
const isStill = (b: Ball) => onFloor(b) && b.vx === 0 && b.vy === 0;
/** On the floor and nearly stopped, so a robot can pick it up. */
export const settled = (b: Ball) => onFloor(b) && b.vx * b.vx + b.vy * b.vy < 2.25;

/** Where a rolling ball will stop, ignoring walls: it slides v²/2a further. */
export function restingPoint(m: MatchState, b: Ball) {
  const speed = len(b.vx, b.vy);
  if (speed < 0.05) return { x: b.x, y: b.y };
  const d = (speed * speed) / (2 * m.settings.ballFriction);
  const clamp = (v: number) => Math.min(FIELD - 0.3, Math.max(0.3, v));
  return { x: clamp(b.x + (b.vx / speed) * d), y: clamp(b.y + (b.vy / speed) * d) };
}

/** Keep the ball inside the walls. A ball hitting a wall bounces back at 40% of its speed. */
function bounceOffWalls(b: Ball, r: number) {
  if (b.x < r) {
    b.x = r;
    b.vx = Math.abs(b.vx) * 0.4;
  }
  if (b.x > FIELD - r) {
    b.x = FIELD - r;
    b.vx = -Math.abs(b.vx) * 0.4;
  }
  if (b.y < r) {
    b.y = r;
    b.vy = Math.abs(b.vy) * 0.4;
  }
  if (b.y > FIELD - r) {
    b.y = FIELD - r;
    b.vy = -Math.abs(b.vy) * 0.4;
  }
}

/** If the ball is inside a box, push it out the nearest side and return which way it was pushed. */
function pushOutOfBox(b: Ball, x0: number, y0: number, x1: number, y1: number): [number, number] | null {
  if (b.x <= x0 || b.x >= x1 || b.y <= y0 || b.y >= y1) return null;
  const left = b.x - x0;
  const right = x1 - b.x;
  const down = b.y - y0;
  const up = y1 - b.y;
  const least = Math.min(left, right, down, up);
  if (least === left) {
    b.x = x0;
    return [-1, 0];
  }
  if (least === right) {
    b.x = x1;
    return [1, 0];
  }
  if (least === down) {
    b.y = y0;
    return [0, -1];
  }
  b.y = y1;
  return [0, 1];
}

export function moveBalls(m: MatchState) {
  const dt = m.dt;
  const robotBoxes = m.robots.map((robot) => ({ robot, e: footprint(robot) }));
  for (const b of m.balls) {
    const r = BALL_RADIUS[b.k];
    const airborne = b.z > 0 || b.vz !== 0;
    if (airborne) {
      b.vz -= GRAVITY * dt;
      b.z += b.vz * dt;
      if (b.z <= 0) {
        b.z = 0;
        if (b.vz < -6) {
          b.vz = -b.vz * 0.25; // a hard landing bounces a little
          b.vx *= 0.8;
          b.vy *= 0.8;
        } else {
          b.vz = 0;
          b.vx *= 0.85;
          b.vy *= 0.85;
        }
      }
    }
    if (!isStill(b)) {
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // Rolling friction slows the ball by a fixed amount each second.
      if (onFloor(b)) {
        const speed = len(b.vx, b.vy);
        const slower = speed - m.settings.ballFriction * dt;
        if (slower <= 0.05) b.vx = b.vy = 0;
        else {
          b.vx *= slower / speed;
          b.vy *= slower / speed;
        }
      }
      bounceOffWalls(b, r);

      const solids = b.z < FLOWER_HEIGHT ? LOW_SOLIDS : b.z < FRAME_HEIGHT ? HIVE_FRAME : [];
      for (const s of solids) {
        const n = pushOutOfBox(b, s.x0 - r, s.y0 - r, s.x1 + r, s.y1 + r);
        if (!n) continue;
        if (n[0] !== 0 && b.vx * n[0] < 0) b.vx = -b.vx * 0.4;
        if (n[1] !== 0 && b.vy * n[1] < 0) b.vy = -b.vy * 0.4;
      }
    }

    // Robots bulldoze low balls: the ball picks up the robot's speed where they touch.
    if (b.z < BUMPER_HEIGHT) {
      for (const { robot, e } of robotBoxes) {
        if (Math.abs(b.x - robot.x) > e.x + r || Math.abs(b.y - robot.y) > e.y + r) continue;
        if (robot.job?.type === "collect" && robot.job.ball === b) continue;
        const n = pushOutOfBox(b, robot.x - e.x - r, robot.y - e.y - r, robot.x + e.x + r, robot.y + e.y + r);
        if (!n) continue;
        if (n[0] !== 0) {
          const push = robot.vx * n[0];
          if (b.vx * n[0] < push + 0.2) b.vx = n[0] * (Math.max(0, push) * 1.15 + 0.2);
        } else {
          const push = robot.vy * n[1];
          if (b.vy * n[1] < push + 0.2) b.vy = n[1] * (Math.max(0, push) * 1.15 + 0.2);
        }
      }
      bounceOffWalls(b, r);
    }
  }

  // Balls on the floor bump into each other. Two resting balls can't newly bump,
  // so only check pairs where at least one ball is moving.
  const low = m.balls.filter((b) => b.z <= 0.45);
  const moving = low.filter((b) => !isStill(b));
  for (const a of moving) {
    for (const b of low) {
      if (a === b || (b.id < a.id && !isStill(b))) continue; // each moving pair only once
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = BALL_RADIUS[a.k] + BALL_RADIUS[b.k];
      if (Math.abs(dx) >= min || Math.abs(dy) >= min) continue;
      const d = len(dx, dy);
      if (d >= min || d < 1e-4) continue;
      const nx = dx / d;
      const ny = dy / d;
      const overlap = (min - d) / 2;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const closing = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (closing < 0) {
        const impulse = closing * 0.65;
        a.vx += impulse * nx;
        a.vy += impulse * ny;
        b.vx -= impulse * nx;
        b.vy -= impulse * ny;
      }
    }
  }
}
