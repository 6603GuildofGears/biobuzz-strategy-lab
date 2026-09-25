/**
 * The Strategy showdown runs on several threads, and the Match viewer replays its matches.
 * These tests check that neither changes a single result.
 * Run with:  npm test
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { simulateMatch } from "../src/lib/sim/engine";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import { playScheduledMatch, runTournament, scheduleMatches, summarize, type TournamentInput } from "../src/lib/sim/tournament";

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
