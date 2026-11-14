# Marswalk Mission Planner: Gale Crater

**Live app:** https://nasa-eva-planner.vercel.app · **Demo video:** {{VIDEO_URL}} · **NASA Space Apps 2026:** *Interplanetary Survival Guide: Martian Map*

**Pick a science site on Mars and get three Marswalk routes computed from real NASA terrain.** For each route the planner works out the walking time, the oxygen left when you're back at the airlock, the steepest ground, the radiation dose and the daylight margin, and gives a GO / CAUTION / NO-GO verdict. An AI flight controller explains the recommendation, but can't make anything up: the route is chosen by a fixed rule, and any number the AI invents is rejected.

**And the routes hold up against reality:** on the 5.9 km walk to the foot of Mount Sharp, our FAST route stays within 250 m of the path NASA's Curiosity drivers chose for 100 % of its length, and the SAFE route for 93.5 % ([docs/VALIDATION.md](docs/VALIDATION.md)).

<!-- Moss: add 3 screenshots here (routes + cards, briefing, Simulate Mission) -->

## Why Gale Crater

- **A human Exploration Zone candidate.** Gale was proposed at NASA's 2015 First Landing Site / Exploration Zone workshop for human missions.
- **Ground-truthed science.** Every site on the map is one Curiosity studied: an ancient freshwater lake (Yellowknife Bay), lake-bed layers at the foot of Mount Sharp (Pahrump Hills), a hematite ridge (Vera Rubin Ridge), and clays with organic molecules (Glen Torridon, Woodland Bay). Three of the five sit on Curiosity's real stops from NASA/JPL's waypoint feed.
- **The sharpest terrain on Mars.** USGS made a 1 m elevation model of this area for Curiosity's drivers, so a 12 × 15 km walking zone can be planned at 25 m resolution.

## What a plan looks like (real data)

Round trips from Bradbury Landing, Curiosity's touchdown site. Reproduce with `node planner/scripts/demo-numbers.mjs`.

| Target | One way | Best route | O₂ left at the airlock | Verdict |
|---|---|---|---|---|
| Yellowknife Bay | 0.4 km | 16 min | 96 % | GO |
| **Pahrump Hills** (foot of Mount Sharp) | 5.9 km | 3 h 41 min, 0.10 mSv | 49 % | **GO** |
| Glen Torridon (clays + organics) | 9.4 km | 6 h 12 min | 6 % | **NO-GO on foot** |
| Glen Torridon, **rover assist** | 9.4 km | 3 h 44 min | 76 % | **GO** (setup panel → Mode → Rover assist) |

Carrying 20 kg of science gear turns the Pahrump walk from GO to CAUTION (32 % O₂). A live NASA solar-storm forecast turns every route to CAUTION.

## How it works

```
NASA / USGS rasters ──► data pipeline ──► region files ──► planner (in the browser) ──► map + route cards
 1 m DEM · HiRISE ·       (Python)         elevation,        A* × 3 strategies              │
 THEMIS · MSL waypoints                    slope, imagery,   + suit O₂ / time model         ▼
                                           sites, rover path                     AI briefing (number-checked)
                                                                                 + live NASA space weather
```

1. **Data pipeline** (`data/build_region.py`, one JSON config per region) reads only the needed window of each NASA/USGS raster and bakes a 473 × 593 grid of 25 m cells: elevation, the steepest slope inside each cell (from a 12.5 m grid), HiRISE colour (Viking fills the gaps) and THEMIS night-time thermal imagery.
2. **Planner** (`planner/`, plain JavaScript in a Web Worker) runs A* three times, scored as an out-and-back walk:
   - **SAFE** minimises oxygen use and penalises every degree above 10°, both between cells and inside them (limit 15°).
   - **FAST** minimises walking time (limit 20°).
   - **SCIENCE** walks least-oxygen legs through the sites that add the smallest detour, budgets 20 min of work at each, and drops a stop if it would make the walk unsafe.
   - **Rover assist** (`params: { rover: true }`, the **Mode** switch in the app) plans for an unpressurised rover: 1.4 m/s, 20° limit, seated O₂ use. Pressing ▶ on a rover route opens a first-person ride over the real Gale terrain (1 m NASA elevation model + HiRISE colour; close-up rocks are decorative).
3. **Suit model:** walking speed vs slope (Tobler-style), metabolic power from the Pandolf load-carriage equation scaled to Mars gravity with a pressure-suit penalty, a 25 % O₂ reserve, an 8 h suit limit and a 20° walking limit. It comes out at 313–353 W, at the top of Apollo's measured 228–352 W range, which fits Mars gravity being ~2.3× the Moon's.
4. **Safety:** radiation dose per route from the rate Curiosity's RAD measured at Gale (0.64 mSv/day). Live NASA DONKI forecasts of solar storms reaching Mars. Daylight vs Gale's sunset (Mars24).
5. **Recommendation** is a fixed rule: best verdict, then SCIENCE if it reaches a site, then SAFE, then FAST.
6. **AI briefing** (Claude) explains the recommended route in three sentences. The server checks every number in its reply against the computed data and uses a template if any number is new.

## Validation

We compared our routes with the path Curiosity actually drove (NASA/JPL waypoints), sampled every 10 m:

| Bradbury Landing → | Route | Within 100 m | Within 250 m | Max distance from Curiosity's path |
|---|---|---|---|---|
| Yellowknife Bay | all three | 96.2 % | 100 % | 113 m |
| Pahrump Hills | FAST | 62.1 % | **100 %** | 204 m |
| Pahrump Hills | SAFE | 53.0 % | 93.5 % | 311 m |

Curiosity drove 8.4 km to Pahrump Hills against our 5.9 km, because it made science stops on the way and protected its wheels. Method, energy check, sensitivity and limits: [docs/VALIDATION.md](docs/VALIDATION.md). Reproduce: `node planner/scripts/validate-gale.mjs`.

## NASA data used

| What | Dataset | Mission / instrument | Resolution |
|---|---|---|---|
| Elevation + slope | MSL Gale Merged DEM v3 (USGS, Parker & Calef 2016) | MRO HiRISE / CTX, Mars Express HRSC, MGS MOLA | 1 m source → 25 m grid |
| Colour imagery | MSL Gale HiRISE colour mosaic (USGS) | MRO HiRISE | 25 cm source (74 % of the box) |
| Colour (gap fill) | Viking MDIM 2.1 colour mosaic | Viking Orbiter | ~232 m |
| Thermal (night IR) | THEMIS Night IR controlled mosaic v2 (USGS) | Mars Odyssey THEMIS | 100 m (baked; not yet shown in the UI) |
| Rover path + site positions | MSL waypoints (end-of-drive stops) | NASA/JPL, Curiosity | 1,270 stops in the box |
| Radiation | RAD surface dose rate (Hassler et al. 2014) | Curiosity RAD | 0.64 mSv/day |
| Space weather | DONKI WSA-ENLIL CME forecasts | NASA CCMC, Goddard | live |

All sources with links: `web/lib/credits.ts` (also shown in the app's Credits panel). Challenge checklist, row by row: [docs/CHALLENGE.md](docs/CHALLENGE.md).

## Honest limits

- **Boulders aren't modelled.** 25 m cells see slopes, not individual rocks.
- **No mineral (CRISM) layer.** Mineral facts in the site descriptions come from published Curiosity results.
- **One region baked.** The pipeline is region-driven, but only Gale has been run.
- **Two site positions are approximate** (Glen Torridon, Woodland Bay). The other three are Curiosity's real stops.
- **The suit model is a planning estimate**, not a validated Mars-suit model.
- **One astronaut.** No two-person EVA logic yet.

## Credits

- **Routing, EVA oxygen model, Mars time and the data pipeline** are adapted from **[Sol Atlas](https://github.com/saracen66/the-sol-explorers) by The SOL Explorers**. Every adapted file lists its changes.
- Data: NASA, JPL-Caltech, USGS Astrogeology, ESA/DLR/FU Berlin (HRSC), University of Arizona (HiRISE), Arizona State University (THEMIS), NASA CCMC (DONKI), NASA GISS (Mars24).
- Basemap: OpenPlanetaryMap. Map: MapLibre GL JS (BSD-3). App: Next.js.

## AI use

Built with Claude Code (Anthropic) as a coding assistant under our direction. In the app, Claude only words the mission briefing from computed numbers, and it's number-checked with a template fallback. No AI-generated images, video or audio. Details: [docs/AI-USE.md](docs/AI-USE.md).

## Team

- **Moss** (MossimoB): product, frontend, UI/UX
- **Gianluca** (Gianluca-Vanier): data, routing, backend, AI pipeline

## Run it locally

```
# web app (Node 20+)
cd web && npm install && npm run build && npx next start -p 3123     # → http://localhost:3123

# planner tests (no dependencies) and the numbers in this README
cd planner && npm test
node planner/scripts/validate-gale.mjs        # from the repo root
node planner/scripts/demo-numbers.mjs

# re-bake the Gale data from NASA/USGS (needs internet; ~15 min)
pip install rasterio numpy pillow scipy
python data/build_region.py gale
```

Optional environment variables for the web app: `ANTHROPIC_API_KEY` (AI briefing; without it the template briefing is used) and `NASA_API_KEY` (space weather; falls back to NASA's shared `DEMO_KEY`).
