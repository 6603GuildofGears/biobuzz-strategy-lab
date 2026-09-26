import { onFloor } from "./balls";
import { inFlowerPhase } from "./brain";
import { len } from "./field";
import { actionTime } from "./jobs";
import { headingTrig, intakeSpeed } from "./motion";
import { BALL_RADIUS } from "./rules";
import { canLaunch } from "./shooting";
import { nectarOwner, type MatchState, type Robot } from "./state";
import { INTAKE_MOUTH_REACH } from "./tuning";
import type { Kind } from "./types";

/**
 * The intake. Robots don't stop to pick balls up: they drive over them, and any ball that
 * enters the intake's mouth gets pulled in. The mouth is `intakeWidth` of the robot's front,
 * so a full-width intake also scoops up balls next to the one it was driving at.
 */

/** Would this robot take element k if it rolled into its intake right now? */
export function wants(m: MatchState, r: Robot, k: Kind): boolean {
  const owner = nectarOwner(k);
  if (owner && owner !== r.alliance) return false; // never the opponent's NECTAR (G408)
  if (canLaunch(r, k)) return true;
  return owner === r.alliance && inFlowerPhase(m, r); // saving its own NECTAR for FLOWERS
}

/** The intake runs while the robot is playing the HIVE or FLOWERS, not while defending or parking. */
function intakeOn(r: Robot) {
  const job = r.job;
  if (!job) return false;
  if (job.type === "wait") return job.why !== "AUTO didn't run";
  return job.type === "collect" || job.type === "shoot" || job.type === "flower";
}

/** Each step: pull in every wanted ball sitting in a running intake's mouth. */
export function intakeBalls(m: MatchState) {
  for (const r of m.robots) {
    if (!intakeOn(r) || r.held.length >= r.cap) continue;
    const { c, s } = headingTrig(r);
    // A fast robot moves a long way in one step, so a ball may already be a little past the front edge.
    const speed = len(r.vx, r.vy);
    const behind = r.hl - speed * m.dt - 0.15;
    const swallow = intakeSpeed(m, r) * 1.25;
    for (let i = m.balls.length - 1; i >= 0 && r.held.length < r.cap; i--) {
      const b = m.balls[i];
      if (!onFloor(b) || !wants(m, r, b.k)) continue;
      const dx = b.x - r.x;
      const dy = b.y - r.y;
      const ahead = dx * c + dy * s;
      const side = -dx * s + dy * c;
      const br = BALL_RADIUS[b.k];
      if (Math.abs(side) > r.intakeHalf - br * 0.3) continue; // most of the ball has to be inside the mouth
      if (ahead > r.hl + br + INTAKE_MOUTH_REACH || ahead < behind) continue;
      // Hitting a ball faster than the rollers can take it knocks it away instead.
      const closing = (r.vx - b.vx) * c + (r.vy - b.vy) * s;
      if (closing > swallow) continue;
      m.balls.splice(i, 1);
      r.held.push(b.k);
      r.intakeBusyUntil = Math.max(m.t, r.intakeBusyUntil) + actionTime(m, r, r.profile.intakeTime);
    }
  }
}
