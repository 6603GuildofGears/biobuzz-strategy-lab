/**
 * Page titles for each section, so each one shows up on its own in browser tabs and Google Analytics.
 * Kept out of simulator.tsx (a client component) so the route pages can use them in their metadata.
 */
export const SITE_TITLE = "BIOBUZZ Strategy Lab";

export const VIEW_TITLE = {
  showdown: "Results",
  match: "Match viewer",
  robots: "Robots",
  strategies: "Strategies",
  rules: "Rules & assumptions",
  guide: "Guide",
} as const;

/** The full browser title for a section, e.g. "Match viewer | BIOBUZZ Strategy Lab". Matches the layout's title template. */
export const fullTitle = (view: keyof typeof VIEW_TITLE) => `${VIEW_TITLE[view]} | ${SITE_TITLE}`;
