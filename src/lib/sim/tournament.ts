import { simulateMatch } from "./engine";
import type { GameSettings, RobotProfile, ScoreBreakdown, Strategy } from "./types";

/**
 * The Strategy showdown: every strategy plays every strategy (including itself) from both sides.
 *
 * It works in three steps, so the matches can be split across several threads:
 *   1. scheduleMatches: list every match up front. Each gets its own seed from its place in the list.
 *   2. playScheduledMatch: play one match. It depends only on its seed and the setup, so any thread
 *      can play any match and get exactly the same result (and the Match viewer can replay it).
 *   3. summarize: add the results up in schedule order.
 */

export const BREAKDOWN_KEYS = [
  "autoTips",
  "teleopTips",
  "cell",
  "flowerBottom",
  "flowerOwned",
  "garden",
  "leave",
  "autoPark",
  "park",
  "foulCredit",
] as const;
export type BreakdownKey = (typeof BREAKDOWN_KEYS)[number];

export interface StrategyStats {
  id: string;
  name: string;
  matches: number;
  wins: number;
  ties: number;
  avgScore: number;
  avgAgainst: number;
  avgMargin: number;
  avgRP: number;
  avgTips: number;
  p1Rate: number;
  p2Rate: number;
  swarmRate: number;
  scoreStdDev: number;
  breakdown: Record<BreakdownKey, number>;
}

/** One match on the schedule: strategy `red` (by index) on the red side against strategy `blue`. */
export interface ScheduledMatch {
  index: number;
  red: number;
  blue: number;
  seed: number;
}

/** A played match. Only the scores are kept, which is all the summary and the replays need. */
export interface PlayedMatch extends ScheduledMatch {
  redScore: ScoreBreakdown;
  blueScore: ScoreBreakdown;
}

export interface TournamentResult {
  stats: StrategyStats[];
  /** matrix[i][j] = win rate of strategy i against strategy j (both sides averaged). */
  matrix: number[][];
  /** marginMatrix[i][j] = average point margin of i vs j. */
  marginMatrix: number[][];
  matchesPerPair: number;
  /** Every match that was played, in schedule order, so any of them can be replayed exactly. */
  matches: { red: number; blue: number; seed: number; redTotal: number; blueTotal: number }[];
}

/** Everything a thread needs to play matches. */
export interface ShowdownSetup {
  strategies: Strategy[];
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
}

export interface TournamentInput extends ShowdownSetup {
  matchesPerPair: number;
  seed: number;
}

/** Half the matches for a pairing are played with each strategy on red. */
export const matchesPerSide = (matchesPerPair: number) => Math.max(1, Math.ceil(matchesPerPair / 2));

export function scheduleMatches(input: TournamentInput): ScheduledMatch[] {
  const S = input.strategies.length;
  const perSide = matchesPerSide(input.matchesPerPair);
  const list: ScheduledMatch[] = [];
  for (let red = 0; red < S; red++)
    for (let blue = 0; blue < S; blue++)
      for (let m = 0; m < perSide; m++) list.push({ index: list.length, red, blue, seed: input.seed + list.length });
  return list;
}

export function playScheduledMatch(setup: ShowdownSetup, match: ScheduledMatch): PlayedMatch {
  const r = simulateMatch({
    red: setup.strategies[match.red],
    blue: setup.strategies[match.blue],
    profiles: setup.profiles,
    settings: setup.settings,
    seed: match.seed,
  });
  return { ...match, redScore: r.red, blueScore: r.blue };
}

interface Acc {
  n: number;
  wins: number;
  ties: number;
  score: number;
  score2: number;
  against: number;
  rp: number;
  tips: number;
  p1: number;
  p2: number;
  swarm: number;
  bd: Record<BreakdownKey, number>;
}

const emptyAcc = (): Acc => ({
  n: 0,
  wins: 0,
  ties: 0,
  score: 0,
  score2: 0,
  against: 0,
  rp: 0,
  tips: 0,
  p1: 0,
  p2: 0,
  swarm: 0,
  bd: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, 0])) as Record<BreakdownKey, number>,
});

const addTo = (acc: Acc, mine: ScoreBreakdown, theirs: ScoreBreakdown) => {
  acc.n++;
  if (mine.total > theirs.total) acc.wins++;
  else if (mine.total === theirs.total) acc.ties++;
  acc.score += mine.total;
  acc.score2 += mine.total * mine.total;
  acc.against += theirs.total;
  acc.rp += mine.rp;
  acc.tips += mine.tips;
  acc.p1 += mine.pollinator1 ? 1 : 0;
  acc.p2 += mine.pollinator2 ? 1 : 0;
  acc.swarm += mine.swarmRP ? 1 : 0;
  for (const k of BREAKDOWN_KEYS) acc.bd[k] += mine[k];
};

/** Add up the played matches. They're sorted into schedule order first, so the order they finished in doesn't matter. */
export function summarize(input: TournamentInput, played: PlayedMatch[]): TournamentResult {
  const S = input.strategies.length;
  const accs = input.strategies.map(emptyAcc);
  const pair = Array.from({ length: S }, () => Array.from({ length: S }, emptyAcc));
  const inOrder = [...played].sort((a, b) => a.index - b.index);
  for (const p of inOrder) {
    addTo(accs[p.red], p.redScore, p.blueScore);
    addTo(accs[p.blue], p.blueScore, p.redScore);
    addTo(pair[p.red][p.blue], p.redScore, p.blueScore);
    addTo(pair[p.blue][p.red], p.blueScore, p.redScore);
  }

  const stats: StrategyStats[] = input.strategies.map((s, i) => {
    const a = accs[i];
    const mean = a.score / a.n;
    return {
      id: s.id,
      name: s.name,
      matches: a.n,
      wins: a.wins,
      ties: a.ties,
      avgScore: mean,
      avgAgainst: a.against / a.n,
      avgMargin: (a.score - a.against) / a.n,
      avgRP: a.rp / a.n,
      avgTips: a.tips / a.n,
      p1Rate: a.p1 / a.n,
      p2Rate: a.p2 / a.n,
      swarmRate: a.swarm / a.n,
      scoreStdDev: Math.sqrt(Math.max(0, a.score2 / a.n - mean * mean)),
      breakdown: Object.fromEntries(BREAKDOWN_KEYS.map((k) => [k, a.bd[k] / a.n])) as Record<BreakdownKey, number>,
    };
  });

  return {
    stats,
    matrix: pair.map((row) => row.map((c) => (c.wins + c.ties * 0.5) / Math.max(1, c.n))),
    marginMatrix: pair.map((row) => row.map((c) => (c.score - c.against) / Math.max(1, c.n))),
    matchesPerPair: matchesPerSide(input.matchesPerPair) * 2,
    matches: inOrder.map((p) => ({ red: p.red, blue: p.blue, seed: p.seed, redTotal: p.redScore.total, blueTotal: p.blueScore.total })),
  };
}

/** Play the whole showdown on one thread (used by the command-line scripts and tests). */
export async function runTournament(
  input: TournamentInput,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<TournamentResult | null> {
  const schedule = scheduleMatches(input);
  const played: PlayedMatch[] = [];
  let lastYield = performance.now();
  for (const match of schedule) {
    played.push(playScheduledMatch(input, match));
    if (performance.now() - lastYield > 30) {
      onProgress?.(played.length, schedule.length);
      await new Promise((r) => setTimeout(r, 0));
      if (shouldCancel?.()) return null;
      lastYield = performance.now();
    }
  }
  onProgress?.(schedule.length, schedule.length);
  return summarize(input, played);
}
