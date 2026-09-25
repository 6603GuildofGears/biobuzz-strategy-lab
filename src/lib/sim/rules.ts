/**
 * Numbers taken straight from the BIOBUZZ Competition Manual (version TU02).
 * Section numbers are in the comments so you can check them yourself.
 * Anything the manual does NOT say lives in tuning.ts instead.
 */

// ---------- MATCH timing (10.1, 10.4, Table 9-1). Times are seconds from the start. ----------
export const AUTO_END = 30;
export const TELEOP_START = 38; // 8 s transition after AUTO
export const MATCH_LENGTH = 158; // 30 + 8 + 120
/** FLOWER scoring and all remaining NECTAR unlock with 60 s left (G410, G426). */
export const FLOWER_UNLOCK = MATCH_LENGTH - 60;

// ---------- Point values (Table 10-2) ----------
export const POINTS = {
  leave: 3,
  park: 5, // AUTO park and end-of-match park are both 5
  tip: 20,
  inCell: 2, // each element left in the upward CELL at the end
  bottomNectar: 5,
  ownedFlowerElement: 2, // each element in a FLOWER you own
  garden: 1,
  minorFoul: 5,
  majorFoul: 20,
};

// ---------- RANKING POINTS (Table 10-2, Table 10-3, "All Other Events") ----------
export const RP = {
  win: 3,
  tie: 1,
  swarmThreshold: 16, // LEAVE + PARK points
  pollinator1Tips: 4,
  pollinator2Tips: 7,
};

// ---------- SCORING ELEMENTS (9.8, 10.3.1) ----------
/** Ball radius in feet. POLLEN is 2.8 in, NECTAR is 3.6 in across. */
export const BALL_RADIUS = { P: 1.4 / 12, R: 1.8 / 12, B: 1.8 / 12 };
export const PRELOAD_PER_ROBOT = 4;
export const POLLEN_PER_FLOWER = 4;
export const POLLEN_PER_GARDEN = 4;
export const NECTAR_IN_CELL = 3;
export const NECTAR_IN_ALLIANCE_AREA = 5;

// ---------- ROBOT rules ----------
/** G407: a robot may CONTROL at most 4 elements. */
export const MAX_HELD = 4;
/** R102: the starting size limit is an 18 in cube. */
export const MAX_START_SIZE_IN = 18;
/** G421: pinning for more than 3 s is a MAJOR FOUL, plus another every 3 s. */
export const PIN_LIMIT = 3;
