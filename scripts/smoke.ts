import { simulateMatch } from "../src/lib/sim/engine";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import { runTournament } from "../src/lib/sim/tournament";

const preset = (process.argv[2] as keyof typeof PRESETS) ?? "Average";
const profiles = [PRESETS[preset], PRESETS[preset]] as const;

const one = simulateMatch({
  red: STRATEGIES[0],
  blue: STRATEGIES[1],
  profiles: [...profiles],
  settings: DEFAULT_SETTINGS,
  seed: 1,
});
console.log("RED", one.red);
console.log("BLUE", one.blue);
for (const e of one.events) console.log(e.t.toFixed(1), e.alliance, e.text);

const t0 = performance.now();
runTournament({
  strategies: STRATEGIES,
  profiles: [...profiles],
  settings: DEFAULT_SETTINGS,
  matchesPerPair: 20,
  seed: 7,
}).then((r) => {
  console.log(`tournament ${(performance.now() - t0).toFixed(0)}ms`);
  for (const s of r!.stats.sort((a, b) => b.avgMargin - a.avgMargin)) {
    console.log(
      s.name.padEnd(30),
      s.avgScore.toFixed(1).padStart(6),
      s.avgMargin.toFixed(1).padStart(6),
      ((s.wins / s.matches) * 100).toFixed(0).padStart(4) + "%",
      s.avgTips.toFixed(1),
      JSON.stringify(Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, +v.toFixed(1)]))),
    );
  }
});
