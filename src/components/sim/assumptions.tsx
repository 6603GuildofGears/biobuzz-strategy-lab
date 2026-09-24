import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const FROM_MANUAL = [
  "MATCH is 30 s AUTO, 8 s transition, then 2:00 TELEOP. FLOWERS unlock with 60 s left (G410).",
  "HIVE TIP = 20 pts in AUTO or TELEOP. Tips finished before TELEOP starts count as AUTO.",
  "Elements left in the upward CELL at the end = 2 pts each.",
  "FLOWER: the alliance with the bottom-most NECTAR gets 5 pts. The alliance with the top-most NECTAR owns the FLOWER and gets 2 pts for every POLLEN and NECTAR in its scoring volume.",
  "POLLEN falls through a FLOWER to the retrieval opening unless a NECTAR is blocking the middle ring. NECTAR can never be removed.",
  "GARDEN = 1 pt per element in your GARDEN, whoever put it there. LEAVE = 3, AUTO park = 5, end park = 5 per robot.",
  "Setup: 16 POLLEN preloaded (4 per robot), 4 in each FLOWER, 4 in each GARDEN. 3 NECTAR start in each alliance's upward CELL and 5 wait in each ALLIANCE AREA.",
  "One NECTAR is entered through the LOADING ZONE per HIVE TIP, and all remaining NECTAR can come in with 60 s left.",
  "Robots can CONTROL at most 4 elements (G407) and cannot CONTROL opponent NECTAR (G408). In AUTO each alliance stays on its own half (G402).",
  "HIVE calibration: 7 POLLEN must not tip and 8 must; 3 NECTAR + 2 POLLEN must not tip and 3 NECTAR + 3 POLLEN must.",
  "RP: win 3, tie 1, SWARM (LEAVE + park points ≥ 16), POLLINATOR 1 (4+ tips), POLLINATOR 2 (7+ tips). These are the thresholds for regular events.",
];

const ASSUMPTIONS = [
  "Field positions (FLOWERS on the audience and rear walls, LOADING ZONES and GARDENS in opposite corners) are approximated from the manual figures, not taken from CAD.",
  "HIVE weight model: POLLEN = 1, NECTAR = 1.67 (slider), tip threshold 7.5 ± 0.35 (slider). A tipped CELL spins for about a second, then the elements fall from the CELL and bounce and roll across the tiles.",
  "Shots only score through the north and south ends of the HIVE (toward the rear wall and the audience), on your alliance's half of those ends. Effective range is the shorter of the launcher's range and what its shot speed can carry, so a robot cannot sink a shot from the back of the field. Longer shots inside that range are less accurate. A robot with a front intake must spin around before each volley, because the shooter faces the back. A miss bounces off the HIVE and rolls away. A missed FLOWER placement drops beside the FLOWER and rolls.",
  "Robots can't drive through each other, the HIVE frame, or the FLOWERS. Contact pushes both robots apart, and the heavier drivetrain wins more of that push. Elements on the floor get bulldozed instead of driven over.",
  "Defense is that contact plus a slowdown while a defender is against you, and a random chance of MAJOR FOULS.",
  "FLOWER scoring volume holds 5 elements by default (slider). The 4 POLLEN staged in each FLOWER sit below the scoring volume and do not score.",
  "Drive speed is a top speed. Acceleration, robot size, and routing around obstacles decide how long a trip actually takes.",
];

export function Assumptions() {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>What comes straight from the manual</CardTitle>
          <CardDescription>BIOBUZZ Competition Manual sections 8 to 11, plus the official HIVE calibration procedure.</CardDescription>
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
          <CardDescription>Things the manual doesn&apos;t pin down. Most of them can be changed on the Game tab.</CardDescription>
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
