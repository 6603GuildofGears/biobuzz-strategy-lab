"use client";

import { useSyncExternalStore } from "react";

/** Matches Tailwind's `lg` breakpoint: below it the app uses the phone layout. */
const QUERY = "(max-width: 1023px)";

const subscribe = (cb: () => void) => {
  const mq = window.matchMedia(QUERY);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function useIsMobile() {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(QUERY).matches,
    () => false,
  );
}
