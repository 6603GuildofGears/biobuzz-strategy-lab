import { BookOpen, ChartBar, Gauge, Lightbulb, ListChecks, PlayCircle, Settings2, TriangleAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const STEPS = [
  {
    title: "Describe your robots",
    body: "Open the robot settings (the left panel on a computer, the Robots tab on a phone). Go to Robot 1 and Robot 2 and set how fast and accurate each robot is. Start with a preset (Rookie, Average, Elite) and then fine-tune it. Both alliances use these same robots, so every result comes down to strategy, not hardware.",
  },
  {
    title: "Check the game assumptions",
    body: "The Game tab holds the things the manual doesn't pin down, such as how many elements tip the HIVE and how many fit in a FLOWER. The defaults are a reasonable starting point. Change them if your field or practice matches show something different.",
  },
  {
    title: "Run the Strategy showdown",
    body: "Pick which strategies to compare (at least two) and how many matches per pairing, then press Run. More matches take longer but give steadier numbers. Whenever you change a slider, an amber badge reminds you to rerun.",
  },
  {
    title: "Watch a match",
    body: "Open the Match viewer, pick a strategy for each alliance, and watch the robots play. This is the best way to see why a strategy wins or loses: where the robots spend their time, when FLOWERS get claimed or stolen, and whether they get back to park.",
  },
  {
    title: "Try your own idea",
    body: "On the Strategies tab, build a Custom strategy by picking each robot's role: what it launches, when (and whether) it goes to FLOWERS, whether it plays defense, and whether it parks. Custom then shows up in the showdown and the match viewer.",
  },
];

const OUTPUTS: { name: string; means: string }[] = [
  { name: "Best strategy (point margin)", means: "The strategy that beats the rest of the field by the most points on average. It's the best single answer to \"which strategy is best?\"" },
  { name: "Best for rankings (RP / match)", means: "The strategy that earns the most RANKING POINTS per match: win/tie points plus the SWARM and POLLINATOR bonuses. In qualification matches this is what moves you up the rankings." },
  { name: "Win %", means: "How often the strategy wins against every strategy you selected, with ties counted as half a win." },
  { name: "Avg score / Margin", means: "Average points scored, and average points scored minus points allowed. A positive margin means the strategy usually outscores its opponents." },
  { name: "± SD", means: "How much the score swings from match to match. Lower means more consistent and predictable." },
  { name: "Tips", means: "Average number of HIVE TIPS per match (20 points each)." },
  { name: "FLOWER pts", means: "Average points from FLOWERS: the bottom-NECTAR bonus plus points for owned FLOWERS." },
  { name: "4+ / 7+ tips", means: "How often the alliance reaches the POLLINATOR 1 (4 tips) and POLLINATOR 2 (7 tips) RP thresholds." },
  { name: "Where the points come from", means: "A stacked bar per strategy that splits the average score by source: HIVE tips, elements left in the CELL, FLOWERS, LEAVE + park, and GARDEN + fouls." },
  { name: "Head to head", means: "Row strategy's win rate against the column strategy, with the average margin underneath. Green means the row usually wins, red means it usually loses. This is where counters show up: a strategy can be strong overall but weak against one specific opponent." },
];

const SLIDERS: { name: string; means: string }[] = [
  { name: "Width, length, weight", means: "Your robot's real frame size and weight. Size changes how you fit around the HIVE and in the LOADING ZONE. Weight decides who shoves whom in a collision." },
  { name: "Drivetrain", means: "Tank pushes harder but can only drive the way it points, so it turns before it moves. Mecanum and swerve can drive sideways and turn on the move." },
  { name: "Acceleration and shot speed", means: "Acceleration is how fast you reach top speed. Shot speed is how fast a ball leaves the robot. The CELL opening is about 5 ft up, so a slow launcher can't reach it from far away (or at all, below about 15.5 ft/s). The slider shows how far your speed reaches." },
  { name: "Carry capacity", means: "How many elements you can hold, up to the 4-element limit in G407." },
  { name: "Drive speed", means: "Top speed in a straight line. Acceleration is separate, under Robot specs." },
  { name: "Intake time", means: "Time to grab one element once you reach it, including chasing balls that roll away." },
  { name: "Launch time", means: "Time between shots when emptying your robot into the HIVE." },
  { name: "Align / aim per trip", means: "Time lost every trip lining up to shoot or to use a FLOWER." },
  { name: "Launch range", means: "How far the launcher is built to shoot. The robot has to shoot from the end the upward CELL is facing, and that end swaps every tip. Shots from farther away miss more, so the robots weigh distance against driving time." },
  { name: "Intake on the front", means: "The intake is the nose and the shooter is the back, so the robot turns its back to the HIVE to shoot. Turn this off if your shooter faces the same way as your intake." },
  { name: "Accuracy sliders", means: "Chance a shot goes in from close range (it drops the farther away you shoot), or that a FLOWER placement stays in. Misses bounce back onto the field, where anyone can pick them up." },
  { name: "AUTO sliders", means: "How often AUTO works at all, how fast it runs compared with TELEOP, and whether it ends parked." },
];

const TIPS = [
  "Measure a real cycle with a stopwatch (pick up 4, drive, shoot 4) and adjust the sliders until the Match viewer looks similar. The results are only as good as those numbers.",
  "If two strategies are within a few points of each other, run 100 or 200 matches per pairing before you trust the order.",
  "Rerun the showdown with the Rookie and Elite presets. A strategy that stays near the top across skill levels is a safe choice.",
  "Check how sensitive the answer is: nudge FLOWER capacity or the tip threshold on the Game tab and see if the winner changes.",
  "Use the head-to-head table for alliance planning. If you expect an opponent to play Hive Only, look at which strategy beats Hive Only specifically.",
];

const LIMITS = [
  "Robots bump, push, and drive around the HIVE frame and FLOWERS. Defense is zone defense plus pushing, not a full driver-versus-driver fight.",
  "Field positions are measured from the manual's drawings, not the official CAD.",
  "Robots make sensible, consistent decisions (points per second), with some random variation in how long things take. Real drivers adapt, make bigger mistakes, and sometimes break down.",
  "Fouls only come from PINS on defense. Other penalties aren't modeled.",
  "See Rules & assumptions for exactly what comes from the manual and what is an estimate.",
];

export function Guide() {
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-5 text-amber-500" /> How this simulator works
          </CardTitle>
          <CardDescription className="text-sm leading-relaxed">
            BIOBUZZ Strategy Lab answers one question: <strong>which gameplay strategy scores the most, given how good your robots are?</strong> It plays thousands of virtual BIOBUZZ matches in seconds. Two alliances of two robots collect POLLEN and NECTAR, launch them into their HIVE, claim FLOWERS in the last 60 seconds, and park. Each alliance follows a strategy, and the simulator adds up who wins, by how much, and where the points came from.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-3">
          <Fact label="One match" value="30 s AUTO · 8 s transition · 2:00 TELEOP" />
          <Fact label="Every element tracked" value="40 POLLEN, 16 NECTAR, 4 FLOWERS, 2 HIVES" />
          <Fact label="Scoring" value="Straight from the 2026–27 Competition Manual" />
        </CardContent>
      </Card>

      <Section icon={<ListChecks className="size-4" />} title="Quick start" description="Five steps from opening the page to a recommendation.">
        <ol className="space-y-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
                {i + 1}
              </span>
              <div>
                <p className="font-medium">{s.title}</p>
                <p className="text-sm text-muted-foreground">{s.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={<ChartBar className="size-4" />} title="What the results tell you" description="Everything on the Strategy showdown tab, explained.">
          <Glossary items={OUTPUTS} />
        </Section>
        <div className="space-y-4">
          <Section icon={<Gauge className="size-4" />} title="What the robot sliders mean" description="Set these to match your real robot.">
            <Glossary items={SLIDERS} />
          </Section>
          <Section icon={<PlayCircle className="size-4" />} title="Reading the Match viewer" description="The top-down field replay.">
            <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
              <li>
                Red and blue squares are robots. The dots under each robot are what it&apos;s carrying: <Swatch c="#facc15" /> POLLEN, <Swatch c="#ef4444" /> red NECTAR, <Swatch c="#3b82f6" /> blue NECTAR.
              </li>
              <li>In the middle are the red and blue HIVES, between the two gray A-frame ends (robots can drive under the HIVES). The filled CELL is the upward one, its number is how many elements are inside, and its white edge is where shots go in. It flips on every tip.</li>
              <li>The circles on the four walls are FLOWERS. The ring color shows the owner, and the label shows elements in the scoring volume (and POLLEN waiting at the bottom).</li>
              <li>A solid colored box is a LOADING ZONE. A dashed strip is a GARDEN. A yellow outline means the robot is parked.</li>
              <li>Use the scrubber and the 1×–8× buttons to move through the match, and the Match log to see tips, FLOWER claims and steals as they happen.</li>
            </ul>
          </Section>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Section icon={<Lightbulb className="size-4" />} title="Tips for trustworthy answers">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {TIPS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Section>
        <Section icon={<TriangleAlert className="size-4" />} title="What it can't tell you">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
            {LIMITS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </Section>
      </div>

      <Section icon={<Settings2 className="size-4" />} title="Under the hood" description="For the curious.">
        <p className="text-sm text-muted-foreground">
          Each match is simulated in 0.1-second steps. Whenever a robot finishes a job, it picks the next one by estimating expected points per second: a shot is worth its chance of going in times its share of a 20-point tip. The robot grabs another ball only if that adds points faster than its current trip is earning them, and it shoots from the spot that earns the most points per second (closer is more accurate, but getting there takes time). Robots switch to FLOWERS at their set time, finish a tip first if they&apos;re one volley away, and leave early enough to park. They accelerate, turn at their drivetrain&apos;s rate, steer around the HIVE frame, FLOWERS and each other, and push each other based on weight and traction. The HIVE tips when the upward CELL holds about 7.5 POLLEN-weights (one NECTAR ≈ 1.67 POLLEN, from the official calibration procedure). Tipping spins the HIVE, then the elements pour out and roll. Shots follow real projectile paths, and misses bounce back onto the floor. After the buzzer everything settles before scoring. The showdown repeats all of this with different random luck for every pairing of strategies, then averages the results. The code lives in src/lib/sim/, and docs/HOW_IT_WORKS.md walks through it.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {["Monte Carlo", "Round-robin", "Both sides of the field", "Seeded, repeatable runs"].map((t) => (
            <Badge key={t} variant="secondary">
              {t}
            </Badge>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          {icon}
          {title}
        </CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Glossary({ items }: { items: { name: string; means: string }[] }) {
  return (
    <dl className="space-y-2.5 text-sm">
      {items.map((o) => (
        <div key={o.name}>
          <dt className="font-medium">{o.name}</dt>
          <dd className="text-muted-foreground">{o.means}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-muted/40 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function Swatch({ c }: { c: string }) {
  return <span className="inline-block size-2.5 translate-y-px rounded-full" style={{ background: c }} />;
}
