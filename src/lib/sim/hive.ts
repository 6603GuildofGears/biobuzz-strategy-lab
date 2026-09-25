import { atan2 } from "./mathx";
import { CELL_HALF_WIDTH, CELL_OPENING_HEIGHT, CELL_OPENING_OFFSET, CENTER, HIVE_X, NECTAR_DROP, otherEnd, type HiveEnd } from "./field";
import { FLOWER_UNLOCK, MATCH_LENGTH, POINTS, TELEOP_START } from "./rules";
import { log, ownNectar, schedule, spawnBall, tossBall, weightOf, type MatchState, type Shot } from "./state";
import { HUMAN_NECTAR_DELAY, MISS_BOUNCE_SPEED, SPILL_SPEED } from "./tuning";
import type { Alliance, Kind } from "./types";

/**
 * The HIVE (10.5.1). Each alliance has its own. Balls launched into the upward CELL add weight.
 * When the weight reaches the tip threshold the HIVE rotates: that CELL swings down and empties,
 * and the CELL on the other end becomes the new upward CELL.
 */

export function addToCell(m: MatchState, a: Alliance, k: Kind) {
  const h = m.hives[a];
  h.cell.push(k);
  h.weight += weightOf(m, k);
  if (h.weight >= h.threshold) tip(m, a);
}

function tip(m: MatchState, a: Alliance) {
  const h = m.hives[a];
  const s = m.settings;
  h.tips++;
  if (m.t < TELEOP_START) h.autoTips++; // tips finished before TELEOP starts count as AUTO
  log(m, a, `HIVE TIP #${h.tips} (+${POINTS.tip})`);

  const emptied = h.up;
  const contents = h.cell;
  h.up = otherEnd(h.up);
  h.cell = [];
  h.weight = 0;
  h.threshold = s.tipThreshold + (m.rng() * 2 - 1) * s.tipVariance;
  h.tippingUntil = m.t + s.tipSpinTime + 0.3;
  contents.forEach((k, i) => schedule(m, s.tipSpinTime + i * 0.09, () => spill(m, k, a, emptied)));

  // Each tip lets the human player enter one NECTAR, until they can all come in at 60 s left (G426).
  if (m.nectarWaiting[a] > 0 && m.t < FLOWER_UNLOCK) {
    m.nectarWaiting[a]--;
    schedule(m, s.tipSpinTime + HUMAN_NECTAR_DELAY, () => dropNectar(m, a));
  }
}

/** The human player drops one NECTAR into the LOADING ZONE (G427). */
export function dropNectar(m: MatchState, a: Alliance) {
  if (m.t >= MATCH_LENGTH) return;
  const p = NECTAR_DROP[a];
  tossBall(m, ownNectar(a), { x: p.x + (m.rng() - 0.5) * 0.3, y: p.y + (m.rng() - 0.5) * 0.3 }, 1, 0.2, 0.8);
  log(m, a, "Human player entered a NECTAR");
}

/** A ball pours out of the CELL that just swung down, then rolls away from the HIVE. */
function spill(m: MatchState, k: Kind, a: Alliance, end: HiveEnd) {
  const out = end === "north" ? 1 : -1;
  const x = HIVE_X[a] + (m.rng() * 2 - 1) * (CELL_HALF_WIDTH - 0.2);
  const y = CENTER + out * (CELL_OPENING_OFFSET + m.rng() * 0.3);
  const drop = Math.max(1.2, m.settings.cellHeight * (0.8 + m.rng() * 0.3));
  const speed = SPILL_SPEED.min + m.rng() * (SPILL_SPEED.max - SPILL_SPEED.min);
  spawnBall(m, k, { x, y }, drop, (m.rng() - 0.5) * 5, out * speed, -(1 + m.rng() * 2));
}

/** Weight of this alliance's shots still in the air (whether or not they will go in). */
export const weightInFlight = (m: MatchState, a: Alliance) =>
  m.shots.reduce((w, s) => (s.alliance === a ? w + weightOf(m, s.k) : w), 0);

/** Shots that have arrived either drop into the CELL or bounce back onto the FIELD. */
export function landShots(m: MatchState) {
  for (let i = m.shots.length - 1; i >= 0; i--) {
    const s = m.shots[i];
    if (s.t1 > m.t + 1e-9) continue;
    m.shots.splice(i, 1);
    const h = m.hives[s.alliance];
    // The CELL it was aimed at must still be the upward one and not mid-rotation.
    if (s.hit && h.up === s.end && h.tippingUntil <= m.t) {
      m.stats[s.alliance].hits++;
      addToCell(m, s.alliance, s.k);
    } else bounceOff(m, s);
  }
}

function bounceOff(m: MatchState, s: Shot) {
  const back = atan2(s.from.y - s.to.y, s.from.x - s.to.x);
  tossBall(
    m,
    s.k,
    { x: s.to.x + (m.rng() - 0.5) * 0.8, y: s.to.y + (m.rng() - 0.5) * 0.5 },
    CELL_OPENING_HEIGHT * 0.8,
    MISS_BOUNCE_SPEED.min,
    MISS_BOUNCE_SPEED.max,
    back + (m.rng() - 0.5) * Math.PI * 1.4,
  );
}
