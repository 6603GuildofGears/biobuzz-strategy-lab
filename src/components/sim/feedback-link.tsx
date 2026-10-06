"use client";

import { MessageSquare } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** The team's Google Form. Answers go to the team's Google Sheet. */
export const FEEDBACK_URL = "https://forms.gle/NBEEX34ugLKHE3sHA";

/** "done" once someone opens the form, otherwise when (ms) the feedback popup may ask again. */
export const FEEDBACK_PROMPT_KEY = "biobuzz-feedback-prompt";

/** Opening the form from anywhere means the popup never needs to ask. Storage can be blocked, so this may not stick. */
export function markFeedbackOpened(source: string) {
  track("feedback_opened", { source });
  try {
    localStorage.setItem(FEEDBACK_PROMPT_KEY, "done");
  } catch {}
}

/** Opens the feedback form in a new tab. `source` says where it was clicked, for Google Analytics. */
export function FeedbackLink({ source, label = "Feedback", className }: { source: string; label?: string; className?: string }) {
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => markFeedbackOpened(source)}
      className={cn(buttonVariants({ size: "sm" }), "bg-amber-400 text-amber-950 hover:bg-amber-300", className)}
    >
      <MessageSquare /> {label}
    </a>
  );
}
