"use client";

import { BookOpen, ChartBar, Compass, Copy, Hexagon, Layers, PlayCircle, SlidersHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { reportChanges, track, type Setup } from "@/lib/analytics";
import { DEFAULT_SETTINGS, PRESETS, STRATEGIES } from "@/lib/sim/strategies";
import type { GameSettings, RobotProfile } from "@/lib/sim/types";
import { cn } from "@/lib/utils";
import { Assumptions } from "./assumptions";
import { Guide } from "./guide";
import { MatchViewer } from "./match-viewer";
import type { Replay } from "./replay";
import { ProfileEditor, SettingsEditor } from "./profile-editor";
import { Showdown } from "./showdown";
import { StrategyLibrary } from "./strategy-library";
import { Tour } from "./tour";
import { fullTitle } from "./view-titles";

/** "robots" only exists on phones, where the settings panel gets its own screen. */
export type View = "showdown" | "match" | "robots" | "strategies" | "rules" | "guide";

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

/** Set once someone finishes or skips the tour, so it only opens by itself on their first visit. */
const TOUR_SEEN_KEY = "biobuzz-tour-seen";

export function Simulator({ initialView = "showdown" }: { initialView?: View }) {
  const [profiles, setProfiles] = useState<[RobotProfile, RobotProfile]>([{ ...PRESETS.Average }, { ...PRESETS.Average }]);
  const [settings, setSettings] = useState<GameSettings>(DEFAULT_SETTINGS);
  const [version, setVersion] = useState(0);
  const [tab, setTab] = useState<View>(initialView);
  /** Showdown matches picked for the Match viewer. `replayKey` restarts the viewer on each new pick. */
  const [replay, setReplay] = useState<Replay | null>(null);
  const [replayKey, setReplayKey] = useState(0);
  /** The step the tour opens at, or null while it's closed. */
  const [tourStart, setTourStart] = useState<number | null>(null);
  const isMobile = useIsMobile();

  const view: View = !isMobile && tab === "robots" ? "showdown" : tab;
  const showRobots = isMobile && view === "robots";

  const bump = () => setVersion((v) => v + 1);
  const strategies = STRATEGIES;

  const setProfile = (i: 0 | 1, p: RobotProfile) => {
    setProfiles((prev) => {
      const n = [...prev] as [RobotProfile, RobotProfile];
      n[i] = p;
      return n;
    });
    bump();
  };

  /** `replace` swaps the history entry instead of adding one, so the tour doesn't fill up the Back button. */
  const go = (v: View, { replace = false } = {}) => {
    setTab(v);
    const next = pathFor(v);
    if (window.location.pathname !== next) {
      // Set the title first: Google Analytics records a page view on the URL change and reads the title then.
      document.title = fullTitle(v);
      window.history[replace ? "replaceState" : "pushState"]({ view: v }, "", next);
    }
    if (isMobile) window.scrollTo({ top: 0 });
  };

  /** `source` says what opened it, for Google Analytics ("first_visit", "header", "guide"). */
  const startTour = (source: string, step = 1) => {
    track("tour_started", { source });
    setTourStart(step);
  };

  // Offer the tour on someone's first visit. Storage can be blocked (private windows), and then it just isn't offered.
  useEffect(() => {
    let seen = true;
    try {
      seen = localStorage.getItem(TOUR_SEEN_KEY) !== null;
    } catch {}
    if (seen) return;
    const id = setTimeout(() => setTourStart(0), 0);
    return () => clearTimeout(id);
  }, []);

  // Tell Google Analytics what people change, a moment after they stop (so a slider drag is one event).
  const reported = useRef<Setup>({ profiles, settings });
  useEffect(() => {
    const id = setTimeout(() => {
      const now: Setup = { profiles, settings };
      reportChanges(reported.current, now);
      reported.current = now;
    }, 1500);
    return () => clearTimeout(id);
  }, [profiles, settings]);

  useEffect(() => {
    const onPop = () => {
      const v = viewFromPath(window.location.pathname);
      document.title = fullTitle(v);
      setTab(v);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col gap-4 px-3 pt-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:px-4 lg:gap-6 lg:px-8 lg:py-6">
      <header className="flex flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <Hexagon className="size-6 fill-amber-400 text-amber-500" />
          <h1 className="text-xl font-bold tracking-tight lg:text-2xl">BIOBUZZ Strategy Lab</h1>
          <Button variant="ghost" size="sm" className="ml-auto hidden lg:inline-flex" onClick={() => startTour("header")}>
            <Compass /> Take the tour
          </Button>
          <Button variant="outline" size="sm" className="hidden lg:inline-flex" data-tour="help" onClick={() => go("guide")}>
            <BookOpen /> How it works
          </Button>
        </div>
        <p className={cn("max-w-3xl text-sm text-muted-foreground", view !== "showdown" && "hidden lg:block")}>
          Monte Carlo simulator for the 2026–27 FTC game. Set how fast and accurate your robots are, then play the strategies against each other to see which one wins the most. Built by FTC Team 6603, Guild of Gears.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
        <aside
          className={cn(
            "lg:sticky lg:top-6 lg:block lg:max-h-[calc(100vh-3rem)] lg:self-start lg:overflow-y-auto",
            !showRobots && "hidden",
          )}
        >
          <Card data-tour="robot-panel">
            <CardContent>
              <Tabs defaultValue="r1">
                <TabsList className="w-full">
                  <TabsTrigger value="r1">Robot 1</TabsTrigger>
                  <TabsTrigger value="r2">Robot 2</TabsTrigger>
                  <TabsTrigger value="game" data-tour="game-tab">Game</TabsTrigger>
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
                  const [m] = r.matches;
                  const name = (id: string) => strategies.find((s) => s.id === id)?.name ?? id;
                  if (m) track("showdown_replay_opened", { red_strategy: name(m.redId), blue_strategy: name(m.blueId) });
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
              <StrategyLibrary strategies={STRATEGIES} />
            </TabsContent>
            <TabsContent value="rules" className="lg:pt-3">
              <Assumptions />
            </TabsContent>
            <TabsContent value="guide" className="space-y-4 lg:pt-3">
              <Guide onStartTour={() => startTour("guide")} />
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
                  data-tour={v === "guide" ? "help" : undefined}
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

      {tourStart !== null && (
        <Tour
          startAt={tourStart}
          isMobile={isMobile}
          onNavigate={(v) => go(v, { replace: true })}
          onClose={(finished, step) => {
            track(finished ? "tour_finished" : "tour_skipped", { step });
            try {
              localStorage.setItem(TOUR_SEEN_KEY, "1");
            } catch {}
            setTourStart(null);
          }}
        />
      )}
    </div>
  );
}
