"use client";

import { Moon, Sun } from "lucide-react";
import { useLayoutEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { track } from "@/lib/analytics";
import { THEME_KEY, applyTheme, savedTheme, systemTheme } from "@/lib/theme";

const subscribe = (cb: () => void) => {
  const observer = new MutationObserver(cb);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
};

/** Whether dark mode is on right now. False while the page is being built, like the server's HTML. */
export function useIsDark() {
  return useSyncExternalStore(
    subscribe,
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

export function ThemeToggle() {
  const dark = useIsDark();

  useLayoutEffect(() => {
    // The <head> script already did this. In development React clears <html>'s class on its second mount, so put it back.
    applyTheme(savedTheme() ?? systemTheme());
    // Until someone picks a theme, follow the device when its setting changes.
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if (!savedTheme()) applyTheme(systemTheme());
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const toggle = () => {
    const next = dark ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {}
    track("theme_changed", { theme: next });
  };

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={toggle}
      aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
      title={dark ? "Light mode" : "Dark mode"}
    >
      {dark ? <Sun /> : <Moon />}
    </Button>
  );
}
