"use client";

import { Pause, Play, RotateCcw, Shuffle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { simulateMatch } from "@/lib/sim/engine";
import { AUTO_END, FLOWER_UNLOCK, MATCH_LENGTH, TELEOP_START } from "@/lib/sim/field";
import type { GameSettings, MatchResult, RobotProfile, ScoreBreakdown, Strategy } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { FieldView } from "./field-view";

const SPEEDS = [1, 2, 4, 8];

const clock = (t: number) => {
  if (t < AUTO_END) return { phase: "AUTO", left: AUTO_END - t };
  if (t < TELEOP_START) return { phase: "TRANSITION", left: TELEOP_START - t };
  const left = Math.max(0, MATCH_LENGTH - t);
  return { phase: left <= 60 ? "ENDGAME" : "TELEOP", left };
};
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

const ROWS: { key: keyof ScoreBreakdown; label: string }[] = [
  { key: "leave", label: "LEAVE" },
  { key: "autoPark", label: "AUTO park" },
  { key: "autoTips", label: "AUTO HIVE tips" },
  { key: "teleopTips", label: "TELEOP HIVE tips" },
  { key: "cell", label: "Left in CELL" },
  { key: "flowerBottom", label: "FLOWER bottom NECTAR" },
  { key: "flowerOwned", label: "Owned FLOWERS" },
  { key: "garden", label: "GARDEN" },
  { key: "park", label: "End park" },
  { key: "foulCredit", label: "Foul credit" },
];

export function MatchViewer({
  strategies,
  profiles,
  settings,
}: {
  strategies: Strategy[];
  profiles: [RobotProfile, RobotProfile];
  settings: GameSettings;
}) {
  const [redId, setRedId] = useState(strategies[0].id);
  const [blueId, setBlueId] = useState(strategies[1].id);
  const [seed, setSeed] = useState(42);
  const red = strategies.find((s) => s.id === redId) ?? strategies[0];
  const blue = strategies.find((s) => s.id === blueId) ?? strategies[1];
  const [result, setResult] = useState<MatchResult | null>(() =>
    simulateMatch({ red, blue, profiles, settings, seed, record: true }),
  );
  const [frameIdx, setFrameIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const raf = useRef<number | null>(null);

  const run = (s = seed) => {
    const r = simulateMatch({ red, blue, profiles, settings, seed: s, record: true });
    setResult(r);
    setFrameIdx(0);
    setPlaying(true);
  };

  const frames = result?.frames ?? [];
  useEffect(() => {
    if (!playing || frames.length === 0) return;
    let last = performance.now();
    let acc = 0;
    const tick = (now: number) => {
      acc += ((now - last) / 1000) * speed;
      last = now;
      const stepFrames = Math.floor(acc / 0.25);
      if (stepFrames > 0) {
        acc -= stepFrames * 0.25;
        setFrameIdx((i) => {
          const n = Math.min(frames.length - 1, i + stepFrames);
          if (n >= frames.length - 1) setPlaying(false);
          return n;
        });
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
    };
  }, [playing, speed, frames.length]);

  const frame = frames[frameIdx];
  const c = clock(frame?.t ?? 0);
  const done = frameIdx >= frames.length - 1 && frames.length > 0;
  const eventsSoFar = useMemo(
    () => (result ? result.events.filter((e) => e.t <= (frame?.t ?? 0) + 0.01).reverse() : []),
    [result, frame],
  );

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Card>
        <CardHeader className="gap-3">
          <div className="flex flex-wrap items-end gap-3">
            <StrategyPick label="Red alliance" color="red" value={redId} onChange={setRedId} strategies={strategies} />
            <StrategyPick label="Blue alliance" color="blue" value={blueId} onChange={setBlueId} strategies={strategies} />
            <div className="flex gap-2">
              <Button onClick={() => run()}>
                <RotateCcw /> Run match
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const s = Math.floor(Math.random() * 1e6);
                  setSeed(s);
                  run(s);
                }}
              >
                <Shuffle /> New seed
              </Button>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Seed {seed}. Both alliances use the same robot sliders, so only strategy and luck differ.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-stretch gap-3">
            <ScoreBox color="red" name={red.name} score={frame?.score.red ?? 0} final={done ? result?.red.total : undefined} />
            <div className="flex min-w-28 flex-col items-center justify-center rounded-lg border bg-muted/40 px-3">
              <span
                className={cn(
                  "text-[10px] font-semibold tracking-widest",
                  c.phase === "ENDGAME" ? "text-amber-500" : "text-muted-foreground",
                )}
              >
                {c.phase}
              </span>
              <span className="font-mono text-2xl font-bold tabular-nums">{mmss(c.left)}</span>
            </div>
            <ScoreBox color="blue" name={blue.name} score={frame?.score.blue ?? 0} final={done ? result?.blue.total : undefined} />
          </div>

          <div className="mx-auto max-w-[640px]">
            <FieldView frame={frame} robotLabels={["1", "2", "1", "2"]} />
          </div>

          <div className="flex items-center gap-3">
            <Button size="icon" variant="outline" onClick={() => (done ? (setFrameIdx(0), setPlaying(true)) : setPlaying((p) => !p))} aria-label={playing ? "Pause" : "Play"}>
              {playing ? <Pause /> : <Play />}
            </Button>
            <Slider
              className="flex-1"
              value={[frameIdx]}
              min={0}
              max={Math.max(1, frames.length - 1)}
              step={1}
              onValueChange={(v) => {
                setPlaying(false);
                setFrameIdx(Array.isArray(v) ? v[0] : (v as number));
              }}
            />
            <div className="flex gap-1">
              {SPEEDS.map((s) => (
                <Button key={s} size="sm" variant={speed === s ? "default" : "ghost"} className="h-7 px-2 text-xs" onClick={() => setSpeed(s)}>
                  {s}×
                </Button>
              ))}
            </div>
          </div>
          <Legend />
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">{done ? "Final breakdown" : "Breakdown (final)"}</CardTitle>
          </CardHeader>
          <CardContent>
            {result && (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="pb-1 text-left font-medium" />
                    <th className="pb-1 text-right font-medium text-red-500">Red</th>
                    <th className="pb-1 text-right font-medium text-blue-500">Blue</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {ROWS.map((r) => (
                    <tr key={r.key} className="border-t border-border/50">
                      <td className="py-1 text-muted-foreground">{r.label}</td>
                      <td className="py-1 text-right">{result.red[r.key] as number}</td>
                      <td className="py-1 text-right">{result.blue[r.key] as number}</td>
                    </tr>
                  ))}
                  <tr className="border-t font-semibold">
                    <td className="py-1">Total</td>
                    <td className="py-1 text-right">{result.red.total}</td>
                    <td className="py-1 text-right">{result.blue.total}</td>
                  </tr>
                  <tr className="text-muted-foreground">
                    <td className="py-1">HIVE tips / RP</td>
                    <td className="py-1 text-right">
                      {result.red.tips} / {result.red.rp}
                    </td>
                    <td className="py-1 text-right">
                      {result.blue.tips} / {result.blue.rp}
                    </td>
                  </tr>
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Match log</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="max-h-80 space-y-1 overflow-y-auto pr-1 text-xs">
              {eventsSoFar.length === 0 && <li className="text-muted-foreground">Events appear here as the match plays.</li>}
              {eventsSoFar.map((e, i) => (
                <li key={i} className="flex gap-2">
                  <span className="w-10 shrink-0 font-mono text-muted-foreground tabular-nums">{mmss(Math.max(0, e.t < AUTO_END ? AUTO_END - e.t : MATCH_LENGTH - e.t))}</span>
                  <span className={cn("size-2 shrink-0 translate-y-1 rounded-full", e.alliance === "red" ? "bg-red-500" : "bg-blue-500")} />
                  <span>{e.text}</span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-muted-foreground">
              FLOWERS unlock at {mmss(MATCH_LENGTH - FLOWER_UNLOCK)} remaining.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function StrategyPick({
  label,
  color,
  value,
  onChange,
  strategies,
}: {
  label: string;
  color: "red" | "blue";
  value: string;
  onChange: (v: string) => void;
  strategies: Strategy[];
}) {
  return (
    <div className="space-y-1">
      <span className={cn("text-xs font-medium", color === "red" ? "text-red-500" : "text-blue-500")}>{label}</span>
      <Select value={value} onValueChange={(v) => v && onChange(v)}>
        <SelectTrigger className="w-56">
          <SelectValue>{(v: string) => strategies.find((s) => s.id === v)?.name ?? v}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {strategies.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

function ScoreBox({ color, name, score, final }: { color: "red" | "blue"; name: string; score: number; final?: number }) {
  return (
    <div
      className={cn(
        "flex flex-1 flex-col justify-center rounded-lg px-4 py-2 text-white",
        color === "red" ? "bg-red-600" : "bg-blue-600",
        color === "blue" && "items-end",
      )}
    >
      <span className="truncate text-xs opacity-80">{name}</span>
      <span className="font-mono text-3xl font-bold tabular-nums">{final ?? score}</span>
      {final !== undefined && <Badge variant="secondary" className="mt-0.5 h-4 px-1.5 text-[10px]">final</Badge>}
    </div>
  );
}

function Legend() {
  const item = (color: string, label: string, square = false) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("inline-block size-2.5", square ? "rounded-sm" : "rounded-full")} style={{ background: color }} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
      {item("#facc15", "POLLEN")}
      {item("#ef4444", "Red NECTAR")}
      {item("#3b82f6", "Blue NECTAR")}
      {item("#6b7280", "Solid box = LOADING ZONE, dashed = GARDEN", true)}
      <span>Filled HIVE cell = upward CELL (number = elements inside). FLOWER ring color = owner.</span>
    </div>
  );
}
