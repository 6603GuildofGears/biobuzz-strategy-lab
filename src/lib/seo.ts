import type { Metadata } from "next";
import { SITE_TITLE, VIEW_TITLE } from "@/components/sim/view-titles";

/**
 * What search engines and AI assistants see: page descriptions, canonical URLs, link previews and structured data.
 * People search for "FTC", "BIOBUZZ" and "strategy", so those words lead every description.
 */
export const SITE_URL = "https://biobuzz-strategy-lab.com";

export const SITE_DESCRIPTION =
  "Free FTC BIOBUZZ strategy simulator for the 2026–27 FIRST Tech Challenge season. Set your robot's speed and accuracy, then compare alliance strategies (HIVE tips, FLOWERS, defense) over hundreds of simulated matches to see which wins most and earns the most ranking points.";

export const KEYWORDS = [
  "FTC",
  "BIOBUZZ",
  "FTC BIOBUZZ",
  "BIOBUZZ strategy",
  "FTC strategy",
  "FIRST Tech Challenge",
  "FTC 2026-27",
  "FTC simulator",
  "BIOBUZZ simulator",
  "FTC match simulator",
  "HIVE",
  "FLOWERS",
  "POLLEN",
  "NECTAR",
  "ranking points",
  "scouting",
];

export const TEAM = "FTC Team 6603 Guild of Gears";
export const REPO_URL = "https://github.com/6603GuildofGears/biobuzz-strategy-lab";

/** Where the community talks about the tool. Linked from the footer and listed in the structured data. */
export const DISCUSSIONS = [
  { name: "Chief Delphi", url: "https://www.chiefdelphi.com/t/biobuzz-strategy-simulator-a-tool-for-analyzing-match-strategies/524529" },
  { name: "r/FTC", url: "https://www.reddit.com/r/FTC/comments/1wwutc8/is_scoring_with_flowers_worth_it/" },
];

/** The link preview picture (public/og.png). */
const OG_IMAGE = { url: "/og.png", width: 1200, height: 630, alt: "BIOBUZZ Strategy Lab: FTC BIOBUZZ strategy simulator" };

type View = keyof typeof VIEW_TITLE;

/** The path each section's page lives at. Results is the home page, so `/results/` points search engines at `/`. */
const CANONICAL: Record<View, string> = {
  showdown: "/",
  match: "/match/",
  robots: "/robots/",
  strategies: "/strategies/",
  rules: "/rules/",
  guide: "/guide/",
};

const DESCRIPTION: Record<View, string> = {
  showdown: SITE_DESCRIPTION,
  match:
    "Watch a simulated FTC BIOBUZZ match play out on a top-down field: robots launching POLLEN and NECTAR into the HIVE, claiming FLOWERS and parking, with a live score and event log.",
  robots:
    "Describe your FTC BIOBUZZ robot: drive speed, intake, launcher, accuracy and AUTO. The strategy simulator uses these to find the best BIOBUZZ strategy for your team.",
  strategies:
    "FTC BIOBUZZ alliance strategies compared: Hive Only, Flower Rush, Split Endgame, Late Cap, Builder + Capper, Hive + Defender and more, with what each robot does.",
  rules:
    "FTC BIOBUZZ scoring rules from the 2026–27 Competition Manual (HIVE tips, FLOWERS, GARDEN, PARK, ranking points) and the assumptions behind the strategy simulator.",
  guide:
    "How to use the FTC BIOBUZZ strategy simulator: set up your robots, run the strategy showdown, read win rates and ranking points, and answers to common BIOBUZZ strategy questions.",
};

/** Title, description, canonical URL and link preview for a section's page. */
export function pageMetadata(view: View): Metadata {
  const title = view === "showdown" ? undefined : VIEW_TITLE[view];
  const description = DESCRIPTION[view];
  const url = CANONICAL[view];
  const ogTitle = title ? `${title} | ${SITE_TITLE}` : `${SITE_TITLE}: FTC BIOBUZZ strategy simulator`;
  return {
    ...(title && { title }),
    description,
    alternates: { canonical: url },
    // A page's openGraph and twitter replace the layout's instead of merging, so these repeat the shared fields.
    openGraph: { type: "website", siteName: SITE_TITLE, locale: "en_US", title: ogTitle, description, url, images: [OG_IMAGE] },
    twitter: { card: "summary_large_image", title: ogTitle, description, images: [OG_IMAGE.url] },
  };
}

/** schema.org data for the whole site: a free web app built by the team. */
export const SITE_JSON_LD = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebApplication",
      "@id": `${SITE_URL}/#app`,
      name: SITE_TITLE,
      alternateName: ["FTC BIOBUZZ Strategy Simulator", "BIOBUZZ Strategy Simulator"],
      url: `${SITE_URL}/`,
      description: SITE_DESCRIPTION,
      applicationCategory: "SportsApplication",
      operatingSystem: "Any (runs in the browser)",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
      keywords: KEYWORDS.join(", "),
      about: { "@type": "Thing", name: "FIRST Tech Challenge 2026–27 game BIOBUZZ presented by RTX" },
      audience: { "@type": "Audience", audienceType: "FIRST Tech Challenge teams, drive coaches and scouts" },
      image: `${SITE_URL}/og.png`,
      author: { "@id": `${SITE_URL}/#team` },
      sameAs: [REPO_URL, ...DISCUSSIONS.map((d) => d.url)],
    },
    {
      "@type": "SportsTeam",
      "@id": `${SITE_URL}/#team`,
      name: TEAM,
      sport: "Robotics (FIRST Tech Challenge)",
      url: "https://github.com/6603GuildofGears",
    },
  ],
};
