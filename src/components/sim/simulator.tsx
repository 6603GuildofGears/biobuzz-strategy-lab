"use client";

import { Copy, Hexagon } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES, defaultCustom } from "@/lib/sim/strategies";
import type { GameSettings, RobotProfile, Strategy } from "@/lib/sim/types";
import { Assumptions } from "./assumptions";
import { MatchViewer } from "./match-viewer";
import { ProfileEditor, SettingsEditor } from "./profile-editor";
import { Showdown } from "./showdown";
import { StrategyLibrary } from "./strategy-library";

export function Simulator() {
  const [profiles, setProfiles] = useState<[RobotProfile, RobotProfile]>([{ ...PRESETS.Average }, { ...PRESETS.Average }]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [custom, setCustom] = useState<Strategy>(defaultCustom);
  const [version, setVersion] = useState(0);

  const bump = () => setVersion((v) => v + 1);
  const strategies = useMemo(() => [...STRATEGIES, custom], [custom]);

  const setProfile = (i: 0 | 1, p: RobotProfile) => {
    setProfiles((prev) => {
      const n = [...prev] as [RobotProfile, RobotProfile];
      n[i] = p;
      return n;
    });
    bump();
  };

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-6 px-4 py-6 lg:px-8">
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Hexagon className="size-6 fill-amber-400 text-amber-500" />
          <h1 className="text-2xl font-bold tracking-tight">BIOBUZZ Strategy Lab</h1>
        </div>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Monte Carlo simulator for the 2026–27 FTC game. Set how fast and accurate your robots are, then play the strategies against each other to see which one wins the most.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-6 lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto">
          <Card>
            <CardContent>
              <Tabs defaultValue="r1">
                <TabsList className="w-full">
                  <TabsTrigger value="r1">Robot 1</TabsTrigger>
                  <TabsTrigger value="r2">Robot 2</TabsTrigger>
                  <TabsTrigger value="game">Game</TabsTrigger>
                </TabsList>
                {([0, 1] as const).map((i) => (
                  <TabsContent key={i} value={`r${i + 1}`} className="space-y-4 pt-3">
                    <p className="text-xs text-muted-foreground">
                      Applies to Robot {i + 1} on both alliances, so matchups stay fair.
                    </p>
                    <ProfileEditor profile={profiles[i]} onChange={(p) => setProfile(i, p)} />
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full"
                      onClick={() => setProfile(i === 0 ? 1 : 0, { ...profiles[i] })}
                    >
                      <Copy /> Copy to Robot {i === 0 ? 2 : 1}
                    </Button>
                  </TabsContent>
                ))}
                <TabsContent value="game" className="space-y-4 pt-3">
                  <SettingsEditor
                    settings={settings}
                    onChange={(s) => {
                      setSettings(s);
                      bump();
                    }}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      setSettings(DEFAULT_SETTINGS);
                      bump();
                    }}
                  >
                    Reset game assumptions
                  </Button>
                </TabsContent>
              </Tabs>
            </CardContent>
          </Card>
        </aside>

        <main className="min-w-0">
          <Tabs defaultValue="showdown">
            <TabsList className="flex-wrap">
              <TabsTrigger value="showdown">Strategy showdown</TabsTrigger>
              <TabsTrigger value="match">Match viewer</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="rules">Rules &amp; assumptions</TabsTrigger>
            </TabsList>
            <TabsContent value="showdown" className="pt-3">
              <Showdown strategies={strategies} profiles={profiles} settings={settings} configVersion={version} />
            </TabsContent>
            <TabsContent value="match" className="pt-3">
              <MatchViewer strategies={strategies} profiles={profiles} settings={settings} />
            </TabsContent>
            <TabsContent value="strategies" className="pt-3">
              <StrategyLibrary
                strategies={STRATEGIES}
                custom={custom}
                onCustomChange={(s) => {
                  setCustom(s);
                  bump();
                }}
              />
            </TabsContent>
            <TabsContent value="rules" className="pt-3">
              <Assumptions />
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </div>
  );
}
