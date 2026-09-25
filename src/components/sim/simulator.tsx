"use client";

import { BookOpen, ChartBar, Copy, Hexagon, Layers, PlayCircle, SlidersHorizontal } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES, defaultCustom } from "@/lib/sim/strategies";
import type { GameSettings, RobotProfile, Strategy } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { Assumptions } from "./assumptions";
import { Guide } from "./guide";
import { MatchViewer } from "./match-viewer";
import type { Replay } from "./replay";
import { ProfileEditor, SettingsEditor } from "./profile-editor";
import { Showdown } from "./showdown";
import { StrategyLibrary } from "./strategy-library";

/** "robots" only exists on phones, where the settings panel gets its own screen. */
type View = "showdown" | "match" | "robots" | "strategies" | "rules" | "guide";

/** Shareable paths. The home page stays `/` and still opens the showdown. */
const VIEW_PATH: Record<View, string> = {
  showdown: "/results",
  match: "/match",
  robots: "/robots",
  strategies: "/strategies",
  rules: "/rules",
  guide: "/guide",
};

export function viewFromPath(pathname: string): View {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  const path = pathname.replace(/\/$/, "") || "/";
  const local = base && path.startsWith(base) ? path.slice(base.length) || "/" : path;
  const match = (Object.entries(VIEW_PATH) as [View, string][]).find(([, href]) => href === local);
  return match?.[0] ?? "showdown";
}

function pathFor(view: View) {
  const base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");
  return `${base}${VIEW_PATH[view]}/`;
}

const MOBILE_NAV: { view: View; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { view: "showdown", label: "Results", icon: ChartBar },
  { view: "match", label: "Match", icon: PlayCircle },
  { view: "robots", label: "Robots", icon: SlidersHorizontal },
  { view: "strategies", label: "Strategies", icon: Layers },
  { view: "guide", label: "Guide", icon: BookOpen },
];

export function Simulator({ initialView = "showdown" }: { initialView?: View }) {
  const [profiles, setProfiles] = useState<[RobotProfile, RobotProfile]>([{ ...PRESETS.Average }, { ...PRESETS.Average }]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [custom, setCustom] = useState<Strategy>(defaultCustom);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<View>(initialView);
  /** Showdown matches picked for the Match viewer. `replayKey` restarts the viewer on each new pick. */
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  const isMobile = useIsMobile();

  const view: View = !isMobile && tab === "robots" ? "showdown" : tab;
  const showRobots = isMobile && view === "robots";

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

  const go = (v: View) => {
    setTab(v);
    const next = pathFor(v);
    if (window.location.pathname !== next) {
      window.history.pushState({ view: v }, "", next);
    }
    if (isMobile) window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onPop = () => setTab(viewFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:gap-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Hexagon className="size-6 fill-amber-400 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">BIOBUZZ Strategy Lab</h1>
          <Button variant="outline" size="sm" className="ml-auto hidden lg:inline-flex" onClick={() => go("guide")}>
            <BookOpen /> How it works
          </Button>
        </div>
        <p className={cn("max-w-3xl text-sm text-muted-foreground", view !== "showdown" && "hidden lg:block")}>
          Monte Carlo simulator for the 2026–27 FTC game. Set how fast and accurate your robots are, then play the strategies against each other to see which one wins the most.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={cn(
            "lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto",
            !showRobots && "hidden",
          )}
        >
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
          <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] mt-3 lg:hidden">
            <Button size="lg" className="h-11 w-full shadow-lg" onClick={() => go("showdown")}>
              <ChartBar /> See results with these robots
            </Button>
          </div>
        </aside>

        <main className={cn("min-w-0", showRobots && "hidden")}>
          <Tabs value={view} onValueChange={(v) => go(v as View)}>
            <TabsList className="hidden flex-wrap lg:flex">
              <TabsTrigger value="showdown">Strategy showdown</TabsTrigger>
              <TabsTrigger value="match">Match viewer</TabsTrigger>
              <TabsTrigger value="strategies">Strategies</TabsTrigger>
              <TabsTrigger value="rules">Rules &amp; assumptions</TabsTrigger>
              <TabsTrigger value="guide">How to use</TabsTrigger>
            </TabsList>
            <TabsContent value="showdown" className="lg:pt-3">
              <Showdown
                strategies={strategies}
                profiles={profiles}
                settings={settings}
                configVersion={version}
                onWatch={(r) => {
                  setReplay(r);
                  setReplayKey((k) => k + 1);
                  go("match");
                }}
              />
            </TabsContent>
            <TabsContent value="match" className="lg:pt-3">
              <MatchViewer
                key={replayKey}
                strategies={strategies}
                profiles={profiles}
                settings={settings}
                configVersion={version}
                replay={replay}
                onExitReplay={() => setReplay(null)}
              />
            </TabsContent>
            <TabsContent value="strategies" className="lg:pt-3">
              <StrategyLibrary
                strategies={STRATEGIES}
                custom={custom}
                onCustomChange={(s) => {
                  setCustom(s);
                  bump();
                }}
              />
            </TabsContent>
            <TabsContent value="rules" className="lg:pt-3">
              <Assumptions />
            </TabsContent>
            <TabsContent value="guide" className="space-y-4 lg:pt-3">
              <Guide />
              {isMobile && <Assumptions />}
            </TabsContent>
          </Tabs>
        </main>
      </div>

      <nav
        aria-label="Sections"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden"
      >
        <ul className="mx-auto grid max-w-lg grid-cols-5">
          {MOBILE_NAV.map(({ view: v, label, icon: Icon }) => {
            const active = view === v || (v === "guide" && view === "rules");
            return (
              <li key={v}>
                <button
                  type="button"
                  onClick={() => go(v)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground active:text-foreground",
                  )}
                >
                  <span className={cn("rounded-full px-4 py-1 transition-colors", active && "bg-primary/10")}>
                    <Icon className="size-5" />
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
