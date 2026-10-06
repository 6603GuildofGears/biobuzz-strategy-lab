"use client";

import { MessageSquare } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { cn } from "@/lib/utils";

/** The team's Google Form. Answers go to the team's Google Sheet. */
export const FEEDBACK_URL = "https://forms.gle/NBEEX34ugLKHE3sHA";

/** Opens the feedback form in a new tab. `source` says where it was clicked, for Google Analytics. */
export function FeedbackLink({ source, label = "Feedback", className }: { source: string; label?: string; className?: string }) {
  return (
    <a
      href={FEEDBACK_URL}
      target="_blank"
      rel="noopener noreferrer"
      onClick={() => track("feedback_opened", { source })}
      className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
    >
      <MessageSquare /> {label}
    </a>
  );
}
