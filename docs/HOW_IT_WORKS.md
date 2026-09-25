# How the BIOBUZZ simulator works

This guide walks through the simulation code in `src/lib/sim/`. You don't need to read every line. The goal is to know where things live, how one match plays out, and where to change a number when you learn something new about the game.

Everything is TypeScript. If you have seen JavaScript, Python or Java, you can follow it. Distances are in **feet**, times in **seconds**, and speeds in **feet per second**.

## The big picture

A match is a loop that runs every 0.1 seconds, from 0:00 to the buzzer at 158 s:

```
every 0.1 s:
  1. things scheduled for now happen      (a tipped CELL pours out, a human drops NECTAR)
  2. each robot:
       - if it has nothing to do, the BRAIN picks a job       brain.ts
       - it works on that job: drive, turn, wait, act          jobs.ts, driving.ts
  3. robots and balls move and bump into things              motion.ts, balls.ts
  4. shots that reach the HIVE go in or bounce off           hive.ts
after the buzzer:
  let everything come to rest, then add up the score         scoring.ts
```

The whole match lives in one object called `m` (a `MatchState`, defined in `state.ts`). It holds the clock (`m.t`), the robots, the balls on the floor, the shots in the air, the HIVES and the FLOWERS. Almost every function takes `m` as its first argument and reads or changes it.

The loop itself is in `engine.ts`, in the function `simulateMatch`. It's short, so start there.

## The files, in reading order

| File | What it holds |
| --- | --- |
| `rules.ts` | Numbers straight from the Competition Manual: match times, point values, RP thresholds. Each has its section number. |
| `field.ts` | Where everything is on the FIELD (measured from the manual's figures): the HIVE frame and CELLS, FLOWERS, LOADING ZONES, GARDENS, starting and parking spots. |
| `tuning.ts` | **Our guesses**: everything the manual doesn't say (turn speeds, how accuracy drops with distance, and so on). Change these as you learn more. |
| `types.ts` | The shapes of the data: what a robot profile, a strategy and a score contain. |
| `strategies.ts` | The built-in strategies, the Rookie/Average/Elite presets, and default game settings. |
| `state.ts` | The `MatchState`, the `Robot`, `Ball` and `Job` types, and `createMatch`, which sets up the field like Figure 10-2. |
| `engine.ts` | The main loop (`simulateMatch`). |
| `brain.ts` | How a robot **decides** what to do next. The most interesting file. |
| `defense.ts` | Everything about defense and the 3-second PIN rule. |
| `jobs.ts` | How a robot **carries out** a job: drive there, wait for the intake/aim/launch, then do it. |
| `driving.ts` | Steering: follow a route, swerve around robots, back out of jams. |
| `nav.ts` | Route planning around obstacles (Dijkstra's shortest-path algorithm on obstacle corners). |
| `motion.ts` | Robot physics: acceleration, turning, tank vs mecanum vs swerve, and pushing. |
| `shooting.ts` | Launcher physics: how far a shot can reach, how long it flies, and how accurate it is. |
| `hive.ts` | The HIVE: adding weight to the CELL, tipping, pouring out, human NECTAR. |
| `flowers.ts` | The FLOWER tube: stacking, pulling POLLEN out the bottom, and who owns it. |
| `balls.ts` | Ball physics: falling, bouncing, rolling to a stop. |
| `scoring.ts` | Adding up points and RP. |
| `tournament.ts` | The Strategy showdown: plays every strategy against every other one many times. |

## Following one robot

Let's follow an Average robot in TELEOP.

### 1. The brain picks a job

When a robot has no job, `chooseJob` in `brain.ts` runs. It goes down a short list: is it time to park? Is this a defender? Is it time for FLOWERS? If none of those apply, it plays the HIVE (`hiveJob`).

A **job** is one small task with a place to go and something to do there:

- `collect`: drive to a ball and intake it
- `collectFlower`: pull a POLLEN out of the bottom of a FLOWER
- `shoot`: drive to a shooting spot, aim, and launch everything
- `flower`: drive to a FLOWER and place elements in the top
- `park` / `parked`: go to the LOADING ZONE and stay
- `defend`: guard the opponent's shooting lane
- `wait`: nothing useful to do right now

### 2. How the brain decides: points per second

Almost every decision compares **expected points per second**.

A shot's expected points are: *chance it goes in* × *its share of a tip*. A tip is 20 points and takes about 7.5 POLLEN of weight, so one POLLEN is worth about 20 ÷ 7.5 = 2.67 points if it goes in.

**Example.** The robot holds 2 POLLEN. It started this trip 6 s ago, and getting to its shooting spot, aiming and firing would take 3 more seconds. It shoots 75% from there.

- If it shoots now, this trip earns 2 × 0.75 × 2.67 = 4.0 points in 6 + 3 = 9 s, or **0.44 points per second**.
- There's a POLLEN 1 s out of the way. Grabbing and firing it takes 1 s + 1.5 s (intake) + 0.6 s (launch) = 3.1 extra seconds for 0.75 × 2.67 = 2.0 points, or **0.65 points per second**.

0.65 beats 0.44, so it grabs the ball. If the nearest ball were far away, shooting now would win. This one rule replaced several hand-picked numbers in the old version, and robots now shoot with nearly full loads.

The same idea picks **where** to shoot. `bestShot` tries a grid of spots in front of the upward CELL. Close spots are more accurate, and far spots are quicker to reach. It picks the spot with the most points per second, and skips spots another robot is sitting on.

### 3. The job gets carried out

`runJob` in `jobs.ts` runs every 0.1 s. Every job follows the same pattern:

1. `arrive`: drive to the spot and turn to face the right way (`driveTo` in `driving.ts` does the steering).
2. `timer`: wait for the intake, aim or launch to finish. Each timed action randomly takes up to 15% longer or shorter, because drivers aren't perfectly consistent.
3. Do it: take the ball, launch, place. Then the job is done and the brain picks the next one.

### 4. The robot moves

`moveRobots` in `motion.ts` turns the driver's command into motion. The robot can only change speed by its acceleration each second, and turns at its drivetrain's rate. A **tank drive** can only move the way it's pointing, so it keeps only the part of the command that lines up with the robot. Mecanum and swerve can move in any direction.

`collideRobots` keeps robots out of each other, the walls, the HIVE frame and the FLOWERS. When two robots overlap, both get pushed apart, and the one with more weight × traction moves less.

### 5. The shot flies

`launch` in `shooting.ts` rolls a random number against the robot's accuracy to decide whether the shot will go in, and works out how long it's in the air. Accuracy is the slider value up close, dropping to half at the robot's longest range.

How far can a launcher reach? The CELL opening is about 5 ft up, and the ball leaves the robot about 1.2 ft up, so it has to climb about 3.8 ft. From projectile motion, the farthest a ball at speed *v* can be and still climb that high is

```
d = (v / g) × √(v² − 2 · g · climb)        g = 32.2 ft/s²
```

At 20 ft/s that's about 7.8 ft. Below about 15.5 ft/s the square root goes negative, and the ball can't get up there at all. (`physicsReach` in `shooting.ts`.)

### 6. The HIVE tips

When a shot arrives, `landShots` in `hive.ts` checks that the CELL it was aimed at is still the upward one. If so, the ball adds its weight. When the weight reaches the tip threshold, `tip` runs: +20 points, the HIVE rotates, the other CELL becomes the upward one (so robots have to go to the other end), and the balls pour out and roll across the field. The human player also gets to drop one NECTAR into the LOADING ZONE.

### 7. FLOWERS

A FLOWER (`flowers.ts`) is a tube. Balls stack up from the bottom. POLLEN can slide past the middle ring, but NECTAR is too big and gets caught. Only elements between the middle and top rings score. Whoever has the **lowest** NECTAR in there gets 5 points, and whoever has the **highest** owns the FLOWER and gets 2 points for every element in it. The tests in `tests/rules.test.ts` check this against Figure 10-5 in the manual.

### 8. The end

Robots park in time because `parkDue` in `brain.ts` checks every step whether it's time to head to the LOADING ZONE. After the buzzer, `settle` in `engine.ts` keeps the physics running (robots unpowered) until everything comes to rest. Shots already in the air still count, just like the manual says. Then `scoring.ts` adds everything up.

## Trying things

```bash
npm test                    # check the rules still hold (run this after every change)
npm run measure -- Average  # how the robots behave: hit rate, balls per trip, idle time...
npm run smoke -- Elite      # one match's event log plus a quick tournament
npm run dev                 # the website, at http://localhost:4817
```

**Changing a guess.** Open `tuning.ts`, change a number, run `npm test` and `npm run measure`, then look at the Match viewer. For example, if your drivers turn a tank drive faster than 180°/s, change `TURN_RATE.tank`.

**Adding a strategy.** Add an entry to `STRATEGIES` in `strategies.ts`. A strategy is two roles (one per robot). Each role says what the robot launches, when (and whether) it switches to FLOWERS, whether it defends, and whether it parks.

**Making the robots smarter.** Start in `brain.ts`. Keep the points-per-second idea, and check your change with `npm run measure` before and after. If the numbers get worse, the idea didn't work.

## Things the simulator doesn't do (ideas for improvements)

- Robots don't break down or get disconnected in the middle of a match.
- Alliance partners don't plan together beyond not chasing the same ball, FLOWER or shooting spot.
- Robots don't use the GARDEN on purpose (they only avoid taking from their own).
- Only PINS draw fouls. Other penalties aren't modeled.
- All positions come from the manual's drawings, not the official CAD model, so they may be off by an inch or two.
