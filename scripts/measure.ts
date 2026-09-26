/**
 * Plays every strategy against every strategy and prints how the robots behaved.
 * Use it to check that a change to the robot brain actually helps.
 *
 *   npm run measure -- Average 4     (preset name, matches per pairing)
 */
import { simulateMatch } from "../src/lib/sim/engine";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "../src/lib/sim/strategies";
import type { PlayStats } from "../src/lib/sim/types";

const preset = (process.argv[2] ?? "Average") as keyof typeof PRESETS;
const perPair = Number(process.argv[3] ?? 4);
const profiles = [PRESETS[preset], PRESETS[preset]] as [typeof PRESETS.Average, typeof PRESETS.Average];

const total: PlayStats = { shots: 0, hits: 0, shotDistance: 0, blocked: 0, volleys: 0, volleyElements: 0, idleTime: 0, fouls: 0 };
let matches = 0;
let tips = 0;
let score = 0;
let seed = 1;
const started = performance.now();
for (const red of STRATEGIES)
  for (const blue of STRATEGIES)
    for (let i = 0; i < perPair; i++) {
      const r = simulateMatch({ red, blue, profiles, settings: DEFAULT_SETTINGS, seed: seed++ });
      matches++;
      tips += r.red.tips + r.blue.tips;
      score += r.red.total + r.blue.total;
      for (const s of [r.stats.red, r.stats.blue]) for (const k of Object.keys(total) as (keyof PlayStats)[]) total[k] += s[k];
    }
const ms = performance.now() - started;
const per = (v: number) => (v / matches / 2).toFixed(1);
const pct = (v: number) => `${Math.round(v * 100)}%`;

console.log(`${preset}: ${matches} matches, ${(ms / matches).toFixed(1)} ms each`);
console.log(`  score per alliance   ${per(score)}`);
console.log(`  HIVE tips            ${(tips / matches / 2).toFixed(2)}`);
console.log(`  shots                ${per(total.shots)}   hit rate ${pct(total.hits / total.shots)}`);
console.log(`  avg shot distance    ${(total.shotDistance / total.shots).toFixed(2)} ft`);
console.log(`  elements per volley  ${(total.volleyElements / total.volleys).toFixed(2)}`);
console.log(`  idle robot-seconds   ${per(total.idleTime)} per alliance (TELEOP)`);
console.log(`  shots blocked        ${per(total.blocked)} per alliance`);
console.log(`  PIN fouls            ${per(total.fouls)} per alliance`);
