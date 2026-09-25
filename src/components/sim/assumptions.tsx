import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FROM_MANUAL = [
  "MATCH: 30 s AUTO, 8 s transition (no powered movement), then 2:00 TELEOP. NECTAR can go into FLOWERS only in the last 60 s (G410).",
  "HIVE TIP = 20 pts in AUTO or TELEOP. Tips finished before TELEOP starts count as AUTO. Elements left in the upward CELL at the end = 2 pts each.",
  "Each alliance has its own HIVE with a CELL at each end, facing the audience and the rear wall. Red's upward CELL starts on the audience side, blue's on the rear side. Every tip swaps which CELL faces up (9.6, Figure 10-2).",
  "The upward CELL's opening is 20 in wide, about 53 to 66 in off the floor, and faces out toward its end of the FIELD (Figures 9-9 to 9-11).",
  "Robots can drive under the HIVES between the two A-frame ends. The lowest CELL hangs 30.6 in up and robots are at most 29 in tall.",
  "FLOWERS: one on each wall, two tiles in from a corner. POLLEN can fall past the middle ring, NECTAR can't. Only elements between the middle and top rings score.",
  "FLOWER: the alliance with the lowest NECTAR in the scoring volume gets 5 pts. The alliance with the highest NECTAR owns it and gets 2 pts for every element in the volume, including POLLEN that was already there (10.5.2, Figure 10-5).",
  "GARDEN = 1 pt per element at least partly in your GARDEN, whoever put it there and whatever color it is. LEAVE = 3 (judged at the end of AUTO: not touching the wall). PARK = 5 in AUTO and 5 at the end (at least partly in the LOADING ZONE).",
  "Setup: 4 POLLEN preloaded per robot, 4 in each FLOWER, 4 in each GARDEN. 3 NECTAR in each upward CELL, 5 in each ALLIANCE AREA. One NECTAR is entered per tip, and all remaining NECTAR can come in with 60 s left (G426).",
  "Robots start touching the wall on their own half, outside the LOADING ZONE and not touching a FLOWER (G304). In AUTO each alliance stays on its own half (G402).",
  "Robots CONTROL at most 4 elements (G407) and never the opponent's NECTAR (G408).",
  "PIN: holding an opponent still for more than 3 s is a MAJOR FOUL (20 pts to them), plus another every 3 s (G421).",
  "Scoring waits until everything comes to rest after the buzzer, so shots already in the air still count (10.5).",
  "HIVE calibration: 7 POLLEN must not tip and 8 must; 3 NECTAR + 2 POLLEN must not tip and 3 NECTAR + 3 POLLEN must.",
  "RP: win 3, tie 1, SWARM (LEAVE + PARK ≥ 16 pts), POLLINATOR 1 (4+ tips), POLLINATOR 2 (7+ tips). These are the regular-event thresholds.",
];

const ASSUMPTIONS = [
  "Positions are measured from the manual's drawings, not the official CAD, so expect errors of a few inches.",
  "HIVE weight: POLLEN = 1, NECTAR = 1.67 (slider), tip at 7.5 ± 0.35 (sliders), which fits the calibration rule. A tipped CELL spins about a second, then pours its elements out that end, and they roll.",
  "Launching is real projectile physics: the ball leaves at 1.2 ft high and must climb to the CELL opening, so shot speed sets the longest shot. Robots must shoot from at least 1.5 ft out. Accuracy slider = accuracy up close. At the robot's longest range it's half that.",
  "Shooting: robots pick up and shoot from the front unless \"Shooter on the back\" is on. A robot lines up once per trip (align time), then fires its whole load one element every launch time. With \"Shoot while driving\" (mecanum or swerve), it lines up and fires without stopping, and moving shots go in 90% as often. A bump of more than 0.3 ft while shooting costs a quick correction (a quarter of the align time), and the next shot goes in 85% as often.",
  "Driving: robots speed up and brake at their acceleration, turn at a set rate (mecanum 270°/s, swerve 360°/s, tank 180°/s), and steer around field elements and other robots. Timed actions vary ±15%, because drivers aren't perfectly consistent.",
  "Robot decisions (the \"brain\") use expected points per second: grab another ball only if it adds points faster than the current trip earns them, and shoot from the spot that earns the most points per second.",
  "FLOWER: holds 7 elements in the scoring volume (slider), and 2 POLLEN fit below the middle ring (read from Figure 10-5).",
  "Defense is zone defense: stand in front of the opponent's upward CELL and push robots that come to shoot. A pushed robot is slower and less accurate (slider). Defenders back off before a 3-second PIN.",
  "Starting spots: Robot 1 on the audience (red) or rear (blue) wall facing its CELL, Robot 2 on the alliance wall. Parking spots are both partly in the LOADING ZONE.",
  "Every number above lives in src/lib/sim/tuning.ts, so it's easy to change once we have real measurements.",
];

export function Assumptions() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What comes straight from the manual</CardTitle>
          <CardDescription>BIOBUZZ Competition Manual (TU02), sections 9 to 11, plus the HIVE calibration procedure.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {FROM_MANUAL.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Simulation assumptions</CardTitle>
          <CardDescription>Things the manual doesn&apos;t pin down. Many can be changed on the Game tab.</CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="list-disc space-y-2 pl-5 text-sm">
            {ASSUMPTIONS.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
