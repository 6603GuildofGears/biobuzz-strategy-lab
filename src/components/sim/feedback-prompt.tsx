"use client";

import { MessageSquare, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { FEEDBACK_PROMPT_KEY, FEEDBACK_URL, markFeedbackOpened } from "./feedback-link";

/** Time on the site before asking, counted only while the page is the visible tab. */
const DELAY_MS = 5 * 60 * 1000;
/** After "Maybe later", wait this long before asking again. */
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;
/** Time counted so far this visit, so a reload doesn't start the 5 minutes over. */
const ELAPSED_KEY = "biobuzz-time-on-site";

// Storage can be blocked (private windows). Then the prompt just uses this visit's time and never remembers a dismissal.
function read(storage: () => Storage, key: string) {
  try {
    return storage().getItem(key);
  } catch {
    return null;
  }
}
function write(storage: () => Storage, key: string, value: string) {
  try {
    storage().setItem(key, value);
  } catch {}
}
const local = () => localStorage;
const session = () => sessionStorage;

function isDue() {
  const saved = read(local, FEEDBACK_PROMPT_KEY);
  if (saved === "done") return false;
  return saved === null || Date.now() >= Number(saved);
}

/** A small card in the corner asking for feedback after someone has used the site for a while. */
export function FeedbackPrompt({ paused }: { paused: boolean }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isDue()) return;
    let elapsed = Number(read(session, ELAPSED_KEY)) || 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      elapsed += 1000;
      write(session, ELAPSED_KEY, String(elapsed));
      if (elapsed >= DELAY_MS) {
        clearInterval(id);
        // They may have opened the form from the header in the meantime.
        if (isDue()) setOpen(true);
      }
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const shown = open && !paused;
  useEffect(() => {
    if (shown) track("feedback_prompt_shown");
  }, [shown]);

  if (!shown) return null;

  const later = () => {
    write(local, FEEDBACK_PROMPT_KEY, String(Date.now() + SNOOZE_MS));
    track("feedback_prompt_dismissed");
    setOpen(false);
  };

  return (
    <div
      role="dialog"
      aria-labelledby="feedback-prompt-title"
      aria-describedby="feedback-prompt-body"
      className="fixed inset-x-4 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-50 rounded-xl border border-amber-300 bg-popover p-4 text-popover-foreground shadow-xl animate-in fade-in slide-in-from-bottom-4 duration-300 sm:left-auto sm:w-80 lg:right-6 lg:bottom-6"
    >
      <div className="flex items-start gap-2">
        <MessageSquare className="mt-0.5 size-4 shrink-0 text-amber-500" />
        <h2 id="feedback-prompt-title" className="flex-1 font-semibold leading-snug">
          How&apos;s the Strategy Lab working for you?
        </h2>
        <button
          type="button"
          onClick={later}
          className="-m-1 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
      <p id="feedback-prompt-body" className="mt-2 text-sm leading-relaxed text-muted-foreground">
        FTC Team 6603, Guild of Gears, built this for the FTC community. A minute of feedback helps us make it better.
      </p>
      <div className="mt-4 flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={later}>
          Maybe later
        </Button>
        <a
          href={FEEDBACK_URL}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => {
            markFeedbackOpened("prompt");
            setOpen(false);
          }}
          className={cn(buttonVariants({ size: "sm" }), "bg-amber-400 text-amber-950 hover:bg-amber-300")}
        >
          <MessageSquare /> Give feedback
        </a>
      </div>
    </div>
  );
}
