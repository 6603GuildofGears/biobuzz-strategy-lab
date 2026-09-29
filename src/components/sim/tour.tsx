"use client";

import { ChevronLeft, ChevronRight, Compass, X } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { View } from "./simulator";

/**
 * A step-by-step walkthrough for first-time visitors. Each step switches to the right section,
 * scrolls its `data-tour` element into view, dims everything else, and explains it in a card beside it.
 */

type Step = {
  /** Matches a `data-tour` attribute. No target shows the card in the middle of the screen. */
  target?: string;
  /** Section to open first. "robots" is the settings panel, which on a computer sits beside the results. */
  view?: View;
  title: string;
  body: string;
  /** Shown while the target isn't on the page yet, such as results that are still being simulated. */
  waiting?: string;
};

const RESULTS_WAITING = "The first results are still being simulated. They'll appear here in a few seconds.";

export const TOUR_STEPS: Step[] = [
  {
    title: "Welcome to BIOBUZZ Strategy Lab",
    body: "This site plays thousands of simulated BIOBUZZ matches to find which alliance strategy wins most often with robots like yours. This quick tour shows you around. It takes about a minute.",
  },
  {
    target: "robot-panel",
    view: "robots",
    title: "Step 1: Describe your robots",
    body: "Set how fast and accurate Robot 1 and Robot 2 are. Both alliances use these same robots, so every result comes down to strategy, not hardware.",
  },
  {
    target: "presets",
    view: "robots",
    title: "Start from a preset",
    body: "Not sure of your numbers yet? Pick Rookie, Average or Elite, then fine-tune. On a computer, hover the ⓘ next to a slider to see what it means.",
  },
  {
    target: "game-tab",
    view: "robots",
    title: "Game assumptions",
    body: "The Game tab holds what the manual doesn't pin down, like how many elements tip the HIVE. The defaults are a good place to start.",
  },
  {
    target: "strategy-picks",
    view: "showdown",
    title: "Step 2: Choose strategies to compare",
    body: "Tap a strategy to turn it on or off. Every strategy you pick plays every other one, from both sides of the field.",
  },
  {
    target: "run",
    view: "showdown",
    title: "Run the showdown",
    body: "Press Run to simulate. More matches per pairing take longer but give steadier numbers. If you change a slider, an amber badge reminds you to rerun.",
  },
  {
    target: "rankings",
    view: "showdown",
    title: "Step 3: Read the results",
    body: "Strategies are ranked by ranking points (RP) per match, which is what moves you up in qualifications. Switch to Playoffs to rank by win % instead. Hover a column name to see what it means.",
    waiting: RESULTS_WAITING,
  },
  {
    target: "head-to-head",
    view: "showdown",
    title: "Find the counters",
    body: "Each cell shows how often the row strategy beats the column strategy. Green usually wins, red usually loses. Click a cell to watch those exact matches.",
    waiting: RESULTS_WAITING,
  },
  {
    target: "match-controls",
    view: "match",
    title: "Step 4: Watch a match",
    body: "Pick a strategy for each alliance and press Run match. The same seed always replays the same match, so you can share an interesting one.",
  },
  {
    target: "field",
    view: "match",
    title: "The field",
    body: "Red and blue squares are robots, and the dots under them are what they carry. Use play, the scrubber and the speed buttons to see where each robot spends its time.",
  },
  {
    target: "custom-strategy",
    view: "strategies",
    title: "Step 5: Try your own idea",
    body: "Build a Custom strategy by choosing each robot's role. It then shows up in the showdown and the match viewer like any other strategy.",
  },
  {
    target: "help",
    title: "You're all set",
    body: "The full guide explains every slider and every result. You can replay this tour from there any time.",
  },
];

/** Space between the highlighted element and its outline, and between the outline and the card. */
const PAD = 6;
const GAP = 12;
const EDGE = 16;
/** Height of the phone's bottom navigation bar, which the card must not cover. */
const MOBILE_NAV = 80;

type Box = { top: number; left: number; width: number; height: number };

/** The first matching element that is actually on screen (phones and computers show different copies of some controls). */
function findTarget(name: string): HTMLElement | null {
  for (const el of document.querySelectorAll<HTMLElement>(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 || r.height > 0) return el;
  }
  return null;
}

const sameBox = (a: Box | null, b: Box | null) =>
  a === b || (!!a && !!b && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height);

export function Tour({
  startAt,
  isMobile,
  onNavigate,
  onClose,
}: {
  startAt: number;
  isMobile: boolean;
  onNavigate: (view: View) => void;
  /** `finished` is true when they reached the last step, false when they skipped. */
  onClose: (finished: boolean, step: number) => void;
}) {
  const [index, setIndex] = useState(startAt);
  const [box, setBox] = useState<Box | null>(null);
  const [cardHeight, setCardHeight] = useState(0);
  const [viewport, setViewport] = useState({ w: 0, h: 0 });
  const cardRef = useRef<HTMLDivElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const step = TOUR_STEPS[index];
  const last = index === TOUR_STEPS.length - 1;

  const next = () => (last ? onClose(true, index) : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Open the step's section. On a computer the robot panel is always beside the results.
  useEffect(() => {
    if (step.view) onNavigate(step.view === "robots" && !isMobile ? "showdown" : step.view);
    nextRef.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // Follow the target every frame: it may appear late (results still running), move while the page scrolls, or resize.
  useEffect(() => {
    let frame = 0;
    let scrolled = false;
    const tick = () => {
      const el = step.target ? findTarget(step.target) : null;
      if (el && !scrolled) {
        scrolled = true;
        const tall = el.offsetHeight > window.innerHeight * 0.6;
        el.scrollIntoView({ block: tall ? "start" : "center", behavior: "smooth" });
      }
      const r = el?.getBoundingClientRect();
      const nextBox = r ? { top: r.top, left: r.left, width: r.width, height: r.height } : null;
      setBox((prev) => (sameBox(prev, nextBox) ? prev : nextBox));
      setViewport((prev) => (prev.w === window.innerWidth && prev.h === window.innerHeight ? prev : { w: window.innerWidth, h: window.innerHeight }));
      setCardHeight(cardRef.current?.offsetHeight ?? 0);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step.target]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose(false, index);
      else if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") back();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Keep the page from scrolling under the tour on phones, where a stray swipe would lose the highlighted element.
  useLayoutEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const { w: vw, h: vh } = viewport;
  const cardWidth = Math.min(360, Math.max(0, vw - EDGE * 2));
  const bottomLimit = vh - EDGE - (isMobile ? MOBILE_NAV : 0);

  // The highlighted area, cut to the screen so a tall panel doesn't push the outline off the edges.
  const hole = box && {
    top: Math.max(box.top - PAD, 4),
    left: Math.max(box.left - PAD, 4),
    bottom: Math.min(box.top + box.height + PAD, vh - 4),
    right: Math.min(box.left + box.width + PAD, vw - 4),
  };

  let cardStyle: React.CSSProperties;
  if (!hole || hole.bottom <= hole.top) {
    cardStyle = { top: Math.max(EDGE, (vh - cardHeight) / 2), left: (vw - cardWidth) / 2 };
  } else {
    const centered = Math.min(Math.max((hole.left + hole.right) / 2 - cardWidth / 2, EDGE), vw - cardWidth - EDGE);
    if (bottomLimit - hole.bottom - GAP >= cardHeight) {
      cardStyle = { top: hole.bottom + GAP, left: centered };
    } else if (hole.top - GAP - EDGE >= cardHeight) {
      cardStyle = { top: hole.top - GAP - cardHeight, left: centered };
    } else if (vw - hole.right - GAP - EDGE >= cardWidth) {
      cardStyle = { top: Math.min(Math.max(hole.top, EDGE), bottomLimit - cardHeight), left: hole.right + GAP };
    } else {
      // No room beside it (a tall panel on a phone): sit at the bottom of the screen over the panel.
      cardStyle = { top: bottomLimit - cardHeight, left: centered };
    }
  }

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-labelledby="tour-title" aria-describedby="tour-body">
      {/* Blocks clicks on the page, so the tour can't get out of step with what's on screen. */}
      <div className="absolute inset-0" onClick={(e) => e.stopPropagation()} />
      {hole && hole.bottom > hole.top ? (
        <div
          className="pointer-events-none absolute rounded-lg outline-2 outline-amber-400 transition-all duration-200 ease-out"
          style={{
            top: hole.top,
            left: hole.left,
            width: hole.right - hole.left,
            height: hole.bottom - hole.top,
            boxShadow: "0 0 0 9999px rgb(0 0 0 / 0.55)",
          }}
        />
      ) : (
        <div className="pointer-events-none absolute inset-0 bg-black/55" />
      )}

      <div
        ref={cardRef}
        className={cn(
          "absolute rounded-xl border bg-popover p-4 text-popover-foreground shadow-xl transition-[top,left] duration-200 ease-out",
          vw === 0 && "invisible",
        )}
        style={{ ...cardStyle, width: cardWidth }}
      >
        <div className="flex items-start gap-2">
          <Compass className="mt-0.5 size-4 shrink-0 text-amber-500" />
          <h2 id="tour-title" className="flex-1 font-semibold leading-snug">
            {step.title}
          </h2>
          <button
            type="button"
            onClick={() => onClose(false, index)}
            className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Close tour"
          >
            <X className="size-4" />
          </button>
        </div>
        <p id="tour-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {step.body}
        </p>
        {!box && step.waiting && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{step.waiting}</p>}
        <div className="mt-4 flex items-center gap-2">
          {index === 0 ? (
            <Button variant="ghost" size="sm" onClick={() => onClose(false, index)}>
              Skip tour
            </Button>
          ) : (
            <>
              <span className="text-xs text-muted-foreground tabular-nums">
                {index} of {TOUR_STEPS.length - 1}
              </span>
              <Button variant="ghost" size="sm" className="ml-auto" onClick={back}>
                <ChevronLeft /> Back
              </Button>
            </>
          )}
          <Button ref={nextRef} size="sm" className={cn(index === 0 && "ml-auto")} onClick={next}>
            {index === 0 ? "Show me around" : last ? "Done" : "Next"}
            {!last && <ChevronRight />}
          </Button>
        </div>
      </div>
    </div>
  );
}
