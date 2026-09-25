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
npm test           # checks the rules (scoring, HIVE calibration, FLOWERS, physics)
npm run measure -- Average   # how the robots behave: hit rate, elements per trip, idle time
npm run smoke -- Average     # one match log plus a small tournament (or Rookie / Elite)
```

These addresses open a section directly. The home page is unchanged.

- https://biobuzz-strategy-lab.com/match
- https://biobuzz-strategy-lab.com/results
- https://biobuzz-strategy-lab.com/robots

## Hosting on GitHub Pages

The app runs entirely in the browser, so it builds to plain static files (HTML, JavaScript, CSS) that GitHub Pages can serve.

1. Push this project to a GitHub repository.
2. In the repository, open **Settings → Pages** and set **Source** to **GitHub Actions**.
3. Push to `main` (or run the workflow from the **Actions** tab). `.github/workflows/deploy-pages.yml` builds the site and publishes it to `https://<your-username>.github.io/<repo-name>/`.

### Custom domain (biobuzz-strategy-lab.com)

The site stays on GitHub Pages. A domain bought at Wix only needs its DNS pointed at GitHub. Wix cannot change name servers; edit the records in the Wix account instead.

`public/CNAME` already contains `biobuzz-strategy-lab.com`.

1. In Wix, open **Domains**, click the domain actions icon next to `biobuzz-strategy-lab.com`, and choose **Manage DNS Records**. If the domain is assigned to a Wix site, disconnect that site first so Wix does not overwrite the records.
2. Delete the existing root `A` records (they currently point at Wix, `185.230.63.x`). Add four `A` records with a blank host name:
   - `185.199.108.153`
   - `185.199.109.153`
   - `185.199.110.153`
   - `185.199.111.153`
3. Edit the `www` `CNAME`. Change the value from `initial.wixdns.net` to `6603guildofgears.github.io` (no `https://`).
4. After those records show up in a DNS lookup, set **Settings → Pages → Custom domain** to `biobuzz-strategy-lab.com` and rerun the deploy workflow. The workflow then serves the site from `/`. Turn on **Enforce HTTPS** after GitHub finishes the certificate (often about an hour). Leave any mail records (`MX`, `TXT`) alone.

To build the static files yourself, run `npm run build`. The output goes to `out/`, and you can upload that folder to any static host.

## How the model works

The simulation code lives in `src/lib/sim/`, split into small files by topic (field, HIVE, FLOWERS, robot brain, driving, physics, scoring). **[docs/HOW_IT_WORKS.md](docs/HOW_IT_WORKS.md)** walks through it, following one robot through a cycle.

- Every match runs in 0.1 s steps. Every POLLEN and NECTAR is tracked: missed shots and tipped HIVES scatter elements back onto the floor, where anyone can collect them.
- Robots decide what to do by **expected points per second**: grab another ball only if it adds points faster than the current trip earns them, and shoot from the spot that earns the most points per second.
- Field layout, point values and rules come from the Competition Manual (`rules.ts`, `field.ts`). Everything the manual doesn't say is a clearly labeled guess in `tuning.ts`.
- The **Rules & assumptions** tab in the app lists both.
