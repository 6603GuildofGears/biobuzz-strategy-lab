import { HelpCircle } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Questions people type into Google or ask an AI assistant about BIOBUZZ strategy, answered on the Guide page.
 * The same list goes into the page's FAQPage structured data, so keep the answers plain text.
 */
export const FAQ: { q: string; a: string }[] = [
  {
    q: "What is FTC BIOBUZZ?",
    a: "BIOBUZZ presented by RTX is the 2026–27 FIRST Tech Challenge (FTC) game. Two alliances of two robots collect POLLEN and NECTAR and launch them into their HIVE, which tips for 20 points once its upward CELL is full enough. In the last 60 seconds robots can also score in the FLOWERS on the field walls, and each robot can PARK in its LOADING ZONE. A match is a 30 s AUTO, an 8 s transition and a 2:00 TELEOP.",
  },
  {
    q: "What is the best strategy for FTC BIOBUZZ?",
    a: "It depends on how fast and accurate your robots are, which is why this simulator exists. Set your robots on the Robots panel, then run the Strategy showdown: it plays Hive Only, Flower Rush, Split Endgame, Late Cap, Builder + Capper, Hive + Defender and the other built-in strategies against each other over hundreds of matches. \"Best for qualifications\" is the strategy with the most ranking points per match, and \"Best for playoffs\" is the one that wins most often.",
  },
  {
    q: "Is scoring with FLOWERS worth it in BIOBUZZ?",
    a: "Sometimes. A HIVE TIP is worth 20 points, while a FLOWER pays the alliance that owns it (most NECTAR in the scoring volume) 2 points per element inside, plus 5 points to the alliance whose NECTAR sits lowest in it. NECTAR can only go into FLOWERS in the last 60 seconds, and the time spent there is time not spent tipping the HIVE. Compare Hive Only against Flower Rush, Split Endgame and Late Cap in the showdown with your own robots to see which side of that trade wins for you.",
  },
  {
    q: "How does the BIOBUZZ HIVE tip?",
    a: "Each alliance's HIVE has a CELL at each end. When the upward CELL holds enough weight it tips, scoring 20 points in AUTO or TELEOP, and the other CELL swings up. The calibration procedure says 7 POLLEN must not tip it and 8 must, and one NECTAR weighs about as much as 1.67 POLLEN. Elements left in the upward CELL at the end of the match score 2 points each.",
  },
  {
    q: "How do ranking points (RP) work in BIOBUZZ?",
    a: "A win is worth 3 RP and a tie 1 RP. Alliances also earn the SWARM RP for at least 16 points from LEAVE and PARK, POLLINATOR 1 for 4 or more HIVE TIPS, and POLLINATOR 2 for 7 or more TIPS (regular-event thresholds). The showdown reports how often each strategy reaches each threshold.",
  },
  {
    q: "Who made BIOBUZZ Strategy Lab, and does it cost anything?",
    a: "FTC Team 6603, Guild of Gears, built it for the FTC community. It's free, runs entirely in your browser, and the code is open source on GitHub. It isn't an official FIRST tool, and every scoring rule it uses is listed on the Rules & assumptions page.",
  },
];

export const FAQ_JSON_LD = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
};

export function Faq() {
  return (
    <Card>
      <CardHeader>
        <CardTitle as="h2" className="flex items-center gap-2 text-base">
          <HelpCircle className="size-4" />
          BIOBUZZ strategy questions
        </CardTitle>
        <CardDescription>Common questions about the game and this simulator.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {FAQ.map(({ q, a }) => (
          <div key={q}>
            <h3 className="font-medium">{q}</h3>
            <p className="text-muted-foreground">{a}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
