# BIOBUZZ Strategy Lab

A Monte Carlo strategy simulator for the FIRST Tech Challenge 2026–27 game **BIOBUZZ presented by RTX**. You set how fast and accurate your robots are, then play a set of alliance strategies against each other over hundreds of simulated matches to see which one wins most often.

## What it does

- **Strategy showdown**: a round robin where every strategy plays every other strategy (plus a mirror match) from both sides of the field. It reports win rate, average score and margin, HIVE tips, FLOWER points, ranking points (RP), and how often each strategy reaches the POLLINATOR RP thresholds. It also shows a head-to-head matrix.
- **Match viewer**: replays one simulated match on a top-down field with a live score, playback speed control, a scrubber, and an event log.
- **Strategies**: seven built-in alliance strategies, plus a custom one where you set each robot's role.
- **How to use**: an in-app guide (the **How it works** button in the header, or the **How to use** tab) that walks new users through setup and explains every result.
- **Sliders**: robot drive speed, intake, launch, aim, and FLOWER placement times, launch range, accuracy, and AUTO reliability. The Game tab also has sliders for the parts the manual doesn't specify (HIVE tip threshold, NECTAR weight, FLOWER capacity, defense effect).

### Built-in strategies

| Strategy | Idea |
| --- | --- |
| Hive Only | Launch POLLEN and NECTAR into the HIVE all match, ignore FLOWERS, park |
| Pollen Hive, Nectar Flowers | Never launch NECTAR; spend all of it on FLOWERS at 60 s |
| Flower Rush @ 60s | Launch everything until 60 s, then both robots build FLOWERS |
| Split Endgame | Robot 1 tips all match; Robot 2 launches POLLEN only, then builds FLOWERS |
| Late Cap | HIVE until 20 s, then cap FLOWERS with NECTAR to steal ownership |
| Builder + Capper | Robot 2 builds FLOWERS from 60 s; Robot 1 caps with 15 s left |
| Hive + Defender | One robot scores, one defends in TELEOP |

## Running locally

```bash
npm install
npm run dev        # http://localhost:4817
```

For a quick check from the command line (it prints one match log and a small tournament):

```bash
npm run smoke -- Average   # or Rookie / Elite
```

## Hosting on GitHub Pages

The app runs entirely in the browser, so it builds to plain static files (HTML, JavaScript, CSS) that GitHub Pages can serve.

1. Push this project to a GitHub repository.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). `.github/workflows/deploy-pages.yml` builds the site and publishes it to `https://<your-username>.github.io/<repo-name>/`.

### Custom domain (biobuzz-strategy-lab.com)

`public/CNAME` holds the domain name. To make it live:

1. Buy `biobuzz-strategy-lab.com` from any domain registrar.
2. In the registrar's DNS settings, add four `A` records for `@` pointing to `185.199.108.153`, `185.199.109.153`, `185.199.110.153` and `185.199.111.153`. Also add a `CNAME` record for `www` pointing to `<your-username>.github.io`.
3. In the GitHub repo, go to **Settings → Pages**, enter `biobuzz-strategy-lab.com` under **Custom domain**, save, and tick **Enforce HTTPS** once it's available.
4. Rerun the deploy workflow. With a custom domain the site is served from `/`, and the workflow adjusts the links automatically.

To build the static files yourself, run `npm run build`. The output goes to `out/`, and you can upload that folder to any static host.

## How the model works

The simulation code lives in `src/lib/sim/`:

- `engine.ts` runs a time-stepped simulation (0.1 s steps) of all 4 robots. Every POLLEN and NECTAR is tracked individually: missed shots and tipped HIVES scatter pieces back onto the floor, where anyone can collect them. Robots follow simple decision rules (pick the best nearby piece, launch when full, switch to FLOWERS at a set time, park near the end).
- `strategies.ts` defines the strategies, the robot presets, and the default game assumptions.
- `tournament.ts` runs the round robin and adds up the results.

Rules taken from the manual, and assumptions the simulator makes where the manual is silent, are listed on the **Rules & assumptions** tab in the app.
