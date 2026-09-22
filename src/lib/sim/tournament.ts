import { simulateMatch } from "./engine";
import type { GameSettings, RobotProfile, ScoreBreakdown, Strategy } from "./types";

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

export interface TournamentResult {
  stats: StrategyStats[];
  /** matrix[i][j] = win rate of strategy i against strategy j (both sides averaged). */
  matrix: number[][];
  /** marginMatrix[i][j] = average point margin of i vs j. */
  marginMatrix: number[][];
  matchesPerPair: number;
}

export interface TournamentInput {
  strategies: Strategy[];
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
  matchesPerPair: number;
  seed: number;
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

/**
 * Runs a round robin where every strategy plays every strategy (including itself)
 * from both sides of the FIELD. Yields progress so the UI can stay responsive.
 */
export async function runTournament(
  input: TournamentInput,
  onProgress?: (done: number, total: number) => void,
  shouldCancel?: () => boolean,
): Promise<TournamentResult | null> {
  const S = input.strategies.length;
  const accs = input.strategies.map(emptyAcc);
  const pair = Array.from({ length: S }, () => Array.from({ length: S }, emptyAcc));
  const perSide = Math.max(1, Math.ceil(input.matchesPerPair / 2));
  const total = S * S * perSide;
  let done = 0;
  let seed = input.seed;
  let lastYield = performance.now();

  for (let i = 0; i < S; i++) {
    for (let j = 0; j < S; j++) {
      for (let m = 0; m < perSide; m++) {
        const res = simulateMatch({
          red: input.strategies[i],
          blue: input.strategies[j],
          profiles: input.profiles,
          settings: input.settings,
          seed: seed++,
        });
        addTo(accs[i], res.red, res.blue);
        addTo(accs[j], res.blue, res.red);
        addTo(pair[i][j], res.red, res.blue);
        addTo(pair[j][i], res.blue, res.red);
        done++;
        if (performance.now() - lastYield > 30) {
          onProgress?.(done, total);
          await new Promise((r) => setTimeout(r, 0));
          if (shouldCancel?.()) return null;
          lastYield = performance.now();
        }
      }
    }
  }
  onProgress?.(total, total);

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

  const matrix = pair.map((row) => row.map((c) => (c.wins + c.ties * 0.5) / Math.max(1, c.n)));
  const marginMatrix = pair.map((row) => row.map((c) => (c.score - c.against) / Math.max(1, c.n)));
  return { stats, matrix, marginMatrix, matchesPerPair: perSide * 2 };
}
