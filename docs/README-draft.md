# Marswalk Mission Planner: Gale Crater

> **SUPERSEDED (Fri 21:05):** the real README is now `README.md` at the repo root. This early draft is kept only for history. Don't edit it.

**Live app:** TODO (Vercel URL) · **NASA Space Apps 2026:** *Interplanetary Survival Guide: Martian Map* · **Demo video:** TODO

**Pick a base, pick a science target, and get three Marswalk routes computed from real NASA terrain.** For each route the planner works out the walking time, the oxygen left when the astronaut gets back to the airlock, the steepest slope, and a GO / CAUTION / NO-GO verdict. An AI flight controller then explains the trade-off. It can't invent numbers: if it tries, the app shows a template briefing built from the computed data instead.

![Planner with three routes](TODO-screenshot-1.png)

## Why Gale Crater

- **A NASA human Exploration Zone candidate.** Gale was proposed at NASA's 2015 First Landing Site / Exploration Zone workshop for human missions.
- **Ground-truthed science.** Every target on the map is a place the Curiosity rover actually studied: an ancient freshwater lake (Yellowknife Bay), lake-bed layers at the foot of Mount Sharp (Pahrump Hills), a hematite ridge (Vera Rubin Ridge) and the clay unit with organic molecules (Glen Torridon).
- **The sharpest terrain on Mars.** USGS made a 1 m elevation model of this area for Curiosity's drivers, so a 12 × 15 km walking zone can be planned at 25 m resolution.

## How it works

```
NASA / USGS rasters ──► data pipeline ──► region files ──► planner (in the browser) ──► dashboard + map
 DEM · HiRISE · THEMIS    (Python)         elev, slope,      A* × 3 strategies           │
                                           imagery, POIs     + EVA O₂ / time model       ▼
                                                                                  AI briefing (number-checked)
                                                                                  + live NASA space weather
```

1. **Data pipeline** (`data/build_region.py`) reads only the needed window from each NASA/USGS dataset and bakes a 473 × 593 grid of 25 m cells: elevation, the steepest slope inside each cell (from a 2× finer DEM), HiRISE colour imagery and THEMIS night-time thermal imagery.
2. **Planner** (`planner/`, pure JavaScript in a Web Worker) runs A* three times:
   - **SAFE** minimises oxygen use and penalises every degree above 10° (hard limit 15°).
   - **FAST** minimises walking time (limit 20°).
   - **SCIENCE** walks least-oxygen legs through the science sites that add the smallest detour, and budgets 20 min of work at each.

   Routes are scored as **out-and-back**: a Marswalk has to end at the airlock.
3. **EVA model:** walking speed vs slope (Tobler-style), metabolic power from the Pandolf load-carriage equation scaled to Mars gravity with a pressure-suit penalty, O₂ from metabolic energy, a 25 % O₂ reserve, an 8 h suit limit and a 20° walking limit.
4. **Recommendation** is a fixed rule: best verdict wins; on a tie, SCIENCE if it reaches a site, then SAFE, then FAST.
5. **AI briefing** (Claude) explains the recommended route in three sentences. The server checks every number in the reply against the computed data and falls back to a template if any number is new.
6. **Space weather:** live NASA DONKI WSA-ENLIL forecasts of solar storms (CMEs) reaching Mars in the next 3 days.

![Mission briefing](TODO-screenshot-2.png)
![Simulate Mission](TODO-screenshot-3.png)

## NASA data used

| What | Dataset | Mission / instrument | Resolution |
|---|---|---|---|
| Elevation + slope | MSL Gale Merged DEM v3 (USGS, Parker & Calef 2016) | MRO HiRISE / CTX, Mars Express HRSC, MGS MOLA | 1 m/px source, 25 m grid |
| Colour imagery | MSL Gale HiRISE colour mosaic (USGS) | MRO HiRISE | 25 cm/px source |
| Colour (gap fill) | Viking MDIM 2.1 colour mosaic | Viking Orbiter | ~232 m/px |
| Thermal (night IR) | THEMIS Night IR controlled mosaic v2 (USGS) | Mars Odyssey THEMIS | 100 m/px |
| Space weather | DONKI WSA-ENLIL simulations | NASA CCMC / Goddard | live |
| Basemap | OpenPlanetaryMap Mars basemap | MOLA / Viking-based | global |

Confirmed (Fri 19:45): the baked region uses the **1 m MSL Gale DEM**, and HiRISE colour covers 74 % of the box (Viking fills the rest).

Challenge checklist (O1–O8, C1–C6): see [docs/CHALLENGE.md](docs/CHALLENGE.md).

## Honest limits

- Science-site positions are approximate (± ~0.5 km), taken from published HiRISE image centres. They're labelled "approx." in the app.
- 25 m cells catch slopes and ridges, not individual boulders.
- The EVA model is a planning estimate, not a validated suit model.

## Credits

- **Routing and EVA oxygen model** adapted from **Sol Atlas** by The SOL Explorers. Every adapted file says what changed.
- Data: NASA, JPL-Caltech, USGS Astrogeology, ESA/DLR/FU Berlin (HRSC), University of Arizona (HiRISE), Arizona State University (THEMIS), NASA CCMC (DONKI).
- Basemap: OpenPlanetaryMap.

## AI use

- **In the app:** Claude (Anthropic) writes the three-sentence mission briefing from numbers our code computed. It doesn't choose routes or produce any numbers, and its replies are number-checked (see "How it works").
- **Building it:** both of us worked with Claude as a coding assistant (planning, code, data research). Every dataset and coordinate is cited to its source.

## Team

- **Moss** (MossimoB): product, frontend, UI/UX
- **Gianluca** (Gianluca-Vanier): data, routing, backend, AI pipeline

## Run it locally

```
cd web && npm install && npm run build && npx next start -p 3123   # http://localhost:3123
cd planner && npm test                                              # planner tests
python data/build_region.py gale                                    # re-bake the region (needs internet)
```
