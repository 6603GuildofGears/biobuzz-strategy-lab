/**
 * The Strategy showdown runs on several threads, and the Match viewer replays its matches.
 * These tests check that neither changes a single result.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { simulateMatch } from "../src/lib/sim/engine";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import {
  byPlayoffRank,
  byQualificationRank,
  playScheduledMatch,
  runTournament,
  scheduleMatches,
  summarize,
  type StrategyStats,
  type TournamentInput,
} from "../src/lib/sim/tournament";

const input: TournamentInput = {
  strategies: STRATEGIES.slice(0, 4),
  profiles: [PRESETS.Average, PRESETS.Elite],
  settings: DEFAULT_SETTINGS,
  matchesPerPair: 4,
  seed: 1000,
};

describe("Strategy showdown", () => {
  test("splitting the matches across threads gives exactly the one-thread result", async () => {
    const oneThread = await runTournament(input);
    // Pretend 3 threads played the matches in batches of 5 and finished in a scrambled order.
    const schedule = scheduleMatches(input);
    const batches = Array.from({ length: Math.ceil(schedule.length / 5) }, (_, b) => schedule.slice(b * 5, b * 5 + 5));
    const played = batches
      .map((batch, b) => ({ b, results: batch.map((m) => playScheduledMatch(input, m)) }))
      .sort((x, y) => ((x.b * 7) % 3) - ((y.b * 7) % 3) || y.b - x.b)
      .flatMap((x) => x.results);
    assert.deepEqual(summarize(input, played), oneThread);
  });

  test("every match gets its own seed", () => {
    const seeds = scheduleMatches(input).map((m) => m.seed);
    assert.equal(new Set(seeds).size, seeds.length);
  });

  test("the Match viewer replays a showdown match exactly", async () => {
    const res = (await runTournament(input))!;
    for (const m of res.matches.filter((_, i) => i % 7 === 0)) {
      const replay = simulateMatch({
        red: input.strategies[m.red],
        blue: input.strategies[m.blue],
        profiles: input.profiles,
        settings: input.settings,
        seed: m.seed,
        record: true,
      });
      assert.equal(replay.red.total, m.redTotal);
      assert.equal(replay.blue.total, m.blueTotal);
    }
  });
});

describe("Showdown rankings", () => {
  const stats = (name: string, over: Partial<StrategyStats> & { foulCredit?: number; leave?: number }): StrategyStats => ({
    id: name,
    name,
    matches: 10,
    wins: 5,
    ties: 0,
    avgScore: 100,
    avgAgainst: 100,
    avgMargin: 0,
    avgRP: 4,
    avgTips: 5,
    p1Rate: 0,
    p2Rate: 0,
    swarmRate: 0,
    scoreStdDev: 0,
    breakdown: { autoTips: 0, teleopTips: 0, cell: 0, flowerBottom: 0, flowerOwned: 0, garden: 0, leave: over.leave ?? 0, autoPark: 0, park: 0, foulCredit: over.foulCredit ?? 0 },
    ...over,
  });
  const order = (list: StrategyStats[], by: typeof byQualificationRank) => [...list].sort(by).map((s) => s.name);

  test("qualifications rank by RP first, even over a bigger margin (Table 13-1)", () => {
    assert.deepEqual(order([stats("margin", { avgMargin: 40, avgRP: 3.9 }), stats("rp", { avgMargin: 5, avgRP: 4.2 })], byQualificationRank), ["rp", "margin"]);
  });
  test("RP ties go to score without foul points, then TIPS, then AUTO points", () => {
    assert.deepEqual(order([stats("fouls", { avgScore: 110, foulCredit: 20 }), stats("clean", { avgScore: 100 })], byQualificationRank), ["clean", "fouls"]);
    assert.deepEqual(order([stats("few", { avgTips: 4 }), stats("many", { avgTips: 6 })], byQualificationRank), ["many", "few"]);
    assert.deepEqual(order([stats("low", {}), stats("auto", { leave: 6 })], byQualificationRank), ["auto", "low"]);
  });
  test("playoffs rank by win rate, then margin", () => {
    assert.deepEqual(order([stats("rp", { avgRP: 5, wins: 5 }), stats("wins", { avgRP: 3, wins: 7 })], byPlayoffRank), ["wins", "rp"]);
  });
});
