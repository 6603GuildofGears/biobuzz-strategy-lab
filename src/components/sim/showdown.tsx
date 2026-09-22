"use client";

import { Loader2, Play, Trophy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { runTournament, type TournamentResult } from "@/lib/sim/tournament";
import type { GameSettings, RobotProfile, Strategy } from "@/lib/sim/types";
import { cn } from "@/lib/utils";

const MATCH_OPTIONS = [20, 50, 100, 200];

const SERIES = [
  { key: "tips", label: "HIVE tips", color: "#f59e0b" },
  { key: "cell", label: "Left in CELL", color: "#fcd34d" },
  { key: "flowers", label: "FLOWERS", color: "#22c55e" },
  { key: "robot", label: "LEAVE + park", color: "#a855f7" },
  { key: "other", label: "GARDEN + fouls", color: "#64748b" },
] as const;

export function Showdown({
  strategies,
  profiles,
  settings,
  configVersion,
}: {
  strategies: Strategy[];
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
  configVersion: number;
}) {
  const [enabled, setEnabled] = useState<Set<string>>(() => new Set(strategies.filter((s) => s.id !== "custom").map((s) => s.id)));
  const [perPair, setPerPair] = useState(50);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<{ res: TournamentResult; version: number; strategies: Strategy[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const runId = useRef(0);

  const selected = strategies.filter((s) => enabled.has(s.id));

  const run = async () => {
    if (selected.length < 2) return;
    const id = ++runId.current;
    setRunning(true);
    setError(null);
    setProgress(0);
    try {
      const res = await runTournament(
        { strategies: selected, profiles, settings, matchesPerPair: perPair, seed: 1000 },
        (d, t) => id === runId.current && setProgress(d / t),
        () => id !== runId.current,
      );
      if (res && id === runId.current) setResult({ res, version: configVersion, strategies: selected });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (id === runId.current) setRunning(false);
    }
  };

  useEffect(() => {
    const id = setTimeout(run, 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const stale = result && (result.version !== configVersion || result.strategies.length !== selected.length);
  const ranked = result ? [...result.res.stats].sort((a, b) => b.avgMargin - a.avgMargin) : [];
  const best = ranked[0];
  const bestRP = result ? [...result.res.stats].sort((a, b) => b.avgRP - a.avgRP)[0] : undefined;

  const chartData = ranked.map((s) => ({
    name: s.name,
    tips: +(s.breakdown.autoTips + s.breakdown.teleopTips).toFixed(1),
    cell: +s.breakdown.cell.toFixed(1),
    flowers: +(s.breakdown.flowerBottom + s.breakdown.flowerOwned).toFixed(1),
    robot: +(s.breakdown.leave + s.breakdown.autoPark + s.breakdown.park).toFixed(1),
    other: +(s.breakdown.garden + s.breakdown.foulCredit).toFixed(1),
  }));

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Strategy showdown</CardTitle>
          <CardDescription>
            Every selected strategy plays every other one (and a mirror match) from both sides of the field. Both alliances use your robot sliders, so the only difference is strategy.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {strategies.map((s) => {
              const on = enabled.has(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() =>
                    setEnabled((prev) => {
                      const n = new Set(prev);
                      if (n.has(s.id)) n.delete(s.id);
                      else n.add(s.id);
                      return n;
                    })
                  }
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs transition-colors",
                    on ? "border-primary bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Matches per pairing</span>
              <Select value={String(perPair)} onValueChange={(v) => v && setPerPair(Number(v))}>
                <SelectTrigger className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MATCH_OPTIONS.map((m) => (
                    <SelectItem key={m} value={String(m)}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={run} disabled={running || selected.length < 2}>
              {running ? <Loader2 className="animate-spin" /> : <Play />}
              {running ? "Simulating…" : `Run ${selected.length * selected.length * perPair} matches`}
            </Button>
            {selected.length < 2 && <span className="text-xs text-destructive">Pick at least two strategies.</span>}
            {stale && !running && <Badge variant="outline" className="border-amber-500 text-amber-600">Sliders changed, rerun to update</Badge>}
          </div>
          {running && <Progress value={progress * 100} />}
          {error && <p className="text-sm text-destructive">Simulation failed: {error}</p>}
        </CardContent>
      </Card>

      {!result && running && (
        <Card>
          <CardContent className="flex h-48 items-center justify-center text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" /> Running the first tournament…
          </CardContent>
        </Card>
      )}

      {result && best && (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Highlight
              icon={<Trophy className="size-4 text-amber-500" />}
              label="Best strategy (point margin)"
              value={best.name}
              detail={`${best.avgMargin >= 0 ? "+" : ""}${best.avgMargin.toFixed(1)} pts/match · ${pct(best.wins / best.matches)} wins`}
            />
            <Highlight
              label="Best for rankings (RP / match)"
              value={bestRP?.name ?? ""}
              detail={`${bestRP?.avgRP.toFixed(2)} RP · ${pct(bestRP?.p2Rate ?? 0)} hit 7+ tips`}
            />
            <Highlight
              label="Highest raw score"
              value={[...ranked].sort((a, b) => b.avgScore - a.avgScore)[0].name}
              detail={`${[...ranked].sort((a, b) => b.avgScore - a.avgScore)[0].avgScore.toFixed(1)} pts average`}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Rankings</CardTitle>
              <CardDescription>{result.res.matchesPerPair} matches per pairing. Sorted by average point margin against the whole field.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>Strategy</TableHead>
                    <TableHead className="text-right">Win %</TableHead>
                    <TableHead className="text-right">Avg score</TableHead>
                    <TableHead className="text-right">Margin</TableHead>
                    <TableHead className="text-right">± SD</TableHead>
                    <TableHead className="text-right">Tips</TableHead>
                    <TableHead className="text-right">FLOWER pts</TableHead>
                    <TableHead className="text-right">RP</TableHead>
                    <TableHead className="text-right">4+ / 7+ tips</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ranked.map((s, i) => (
                    <TableRow key={s.id}>
                      <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                      <TableCell className="font-medium">{s.name}</TableCell>
                      <TableCell className="text-right tabular-nums">{pct((s.wins + s.ties * 0.5) / s.matches)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.avgScore.toFixed(1)}</TableCell>
                      <TableCell className={cn("text-right tabular-nums", s.avgMargin >= 0 ? "text-emerald-600" : "text-rose-600")}>
                        {s.avgMargin >= 0 ? "+" : ""}
                        {s.avgMargin.toFixed(1)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">{s.scoreStdDev.toFixed(0)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.avgTips.toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{(s.breakdown.flowerBottom + s.breakdown.flowerOwned).toFixed(1)}</TableCell>
                      <TableCell className="text-right tabular-nums">{s.avgRP.toFixed(2)}</TableCell>
                      <TableCell className="text-right text-muted-foreground tabular-nums">
                        {pct(s.p1Rate)} / {pct(s.p2Rate)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <div className="grid gap-4 2xl:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Where the points come from</CardTitle>
                <CardDescription>Average points per match by source.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[340px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={chartData} layout="vertical" margin={{ left: 12, right: 12 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" opacity={0.4} />
                      <XAxis type="number" fontSize={11} />
                      <YAxis type="category" dataKey="name" width={150} fontSize={11} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      {SERIES.map((s) => (
                        <Bar key={s.key} dataKey={s.key} name={s.label} stackId="a" fill={s.color} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Head to head</CardTitle>
                <CardDescription>Win rate of the row strategy against the column strategy (average margin underneath).</CardDescription>
              </CardHeader>
              <CardContent className="overflow-x-auto">
                <HeadToHead result={result.res} strategies={result.strategies} />
              </CardContent>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function Highlight({ icon, label, value, detail }: { icon?: React.ReactNode; label: string; value: string; detail: string }) {
  return (
    <Card size="sm">
      <CardContent className="space-y-1">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          {icon}
          {label}
        </p>
        <p className="text-lg leading-tight font-semibold">{value}</p>
        <p className="text-xs text-muted-foreground">{detail}</p>
      </CardContent>
    </Card>
  );
}

function HeadToHead({ result, strategies }: { result: TournamentResult; strategies: Strategy[] }) {
  const color = (w: number) => {
    const hue = w >= 0.5 ? 152 : 350;
    const a = Math.min(1, Math.abs(w - 0.5) * 2);
    return `hsla(${hue}, 70%, 45%, ${0.12 + a * 0.75})`;
  };
  return (
    <table className="w-full border-separate border-spacing-1 text-xs">
      <thead>
        <tr>
          <th />
          {strategies.map((s, j) => (
            <th key={s.id} className="px-1 text-center font-medium text-muted-foreground" title={s.name}>
              {j + 1}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {strategies.map((s, i) => (
          <tr key={s.id}>
            <th className="pr-2 text-left font-medium whitespace-nowrap">
              <span className="mr-1 text-muted-foreground">{i + 1}.</span>
              {s.name}
            </th>
            {strategies.map((o, j) => {
              const w = result.matrix[i][j];
              const m = result.marginMatrix[i][j];
              return (
                <td
                  key={o.id}
                  className="min-w-12 rounded px-1 py-1.5 text-center tabular-nums"
                  style={{ background: i === j ? "transparent" : color(w) }}
                  title={`${s.name} vs ${o.name}: ${pct(w)} win, ${m >= 0 ? "+" : ""}${m.toFixed(1)} pts`}
                >
                  {i === j ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <>
                      <div className="font-semibold">{pct(w)}</div>
                      <div className="text-[10px] opacity-80">
                        {m >= 0 ? "+" : ""}
                        {m.toFixed(0)}
                      </div>
                    </>
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
