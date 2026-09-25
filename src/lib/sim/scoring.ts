import { FIELD, GARDEN, LOADING_ZONE, inRect, type Rect } from "./field";
import { bottomNectar, topNectar } from "./flowers";
import { footprint } from "./motion";
import { AUTO_END, BALL_RADIUS, POINTS, RP } from "./rules";
import type { MatchState, Robot } from "./state";
import type { Alliance, ScoreBreakdown } from "./types";

/** Scoring (10.5). */

/** At least partly inside a zone counts (10.5.4). */
export function partlyIn(r: Robot, zone: Rect) {
  const e = footprint(r);
  return r.x + e.x > zone.x0 && r.x - e.x < zone.x1 && r.y + e.y > zone.y0 && r.y - e.y < zone.y1;
}

/** LEAVE needs the robot to no longer be touching the perimeter wall. */
export function touchingWall(r: Robot) {
  const e = footprint(r);
  const gap = 0.02;
  return r.x - e.x < gap || r.x + e.x > FIELD - gap || r.y - e.y < gap || r.y + e.y > FIELD - gap;
}

/** The score so far. `final` adds the end-of-match PARK and the RP checks. */
export function scoreAlliance(m: MatchState, a: Alliance, final: boolean): ScoreBreakdown {
  const h = m.hives[a];
  const mine = m.robots.filter((r) => r.alliance === a);
  const leave = m.t >= AUTO_END ? mine.filter((r) => r.left).length * POINTS.leave : 0;
  const autoPark = mine.filter((r) => r.autoParked).length * POINTS.park;
  const park = final ? mine.filter((r) => partlyIn(r, LOADING_ZONE[a])).length * POINTS.park : 0;
  let flowerBottom = 0;
  let flowerOwned = 0;
  for (const f of m.flowers) {
    if (bottomNectar(f.volume) === a) flowerBottom += POINTS.bottomNectar;
    if (topNectar(f.volume) === a) flowerOwned += POINTS.ownedFlowerElement * f.volume.length;
  }
  // Any element partly in the GARDEN, whoever put it there and whatever its color (10.5.3).
  const garden = m.balls.filter((b) => b.z <= 0 && inRect(b, GARDEN[a], BALL_RADIUS[b.k])).length * POINTS.garden;
  const cell = h.cell.length * POINTS.inCell;
  const autoTips = h.autoTips * POINTS.tip;
  const teleopTips = (h.tips - h.autoTips) * POINTS.tip;
  const total = leave + autoPark + park + flowerBottom + flowerOwned + garden + cell + autoTips + teleopTips + m.foulCredit[a];
  return {
    leave,
    autoPark,
    autoTips,
    teleopTips,
    cell,
    flowerBottom,
    flowerOwned,
    garden,
    park,
    foulCredit: m.foulCredit[a],
    total,
    tips: h.tips,
    rp: 0,
    swarmRP: final && leave + autoPark + park >= RP.swarmThreshold,
    pollinator1: h.tips >= RP.pollinator1Tips,
    pollinator2: h.tips >= RP.pollinator2Tips,
  };
}

export function finalScores(m: MatchState) {
  const red = scoreAlliance(m, "red", true);
  const blue = scoreAlliance(m, "blue", true);
  const winner: Alliance | "tie" = red.total > blue.total ? "red" : blue.total > red.total ? "blue" : "tie";
  for (const [a, s] of [["red", red], ["blue", blue]] as const) {
    s.rp = (winner === a ? RP.win : winner === "tie" ? RP.tie : 0) + +s.swarmRP + +s.pollinator1 + +s.pollinator2;
  }
  return { red, blue, winner };
}
