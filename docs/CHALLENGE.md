# The Official Challenge: What NASA Asks For

Challenge: **Interplanetary Survival Guide: Martian Map** (Intermediate · Human Exploration, Mars, Planets & Moons, Software, Space Exploration).

Source: the official challenge page, as recorded in Sol Atlas's notes on 31 Oct and 13 Nov 2026. **Re-check the live challenge page and its Resources tab yourself before submitting.**

**The ask, in NASA's words:** "create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful **Marswalk** while conducting new and exciting science along the way."

The background notes that tools like JPL's **Mars Trek** "are built for regional and global views rather than the hyperlocalized areas astronauts will target on individual spacewalks."

> ⚠️ **Impact on our plan:** the challenge is about **humans on foot (Marswalk / EVA)**, with rovers only as an optional extra. Our routes must be scored for an astronaut walking: oxygen, suit limits, daylight, walk back to base. "Rover routing" alone would miss the brief. The vendored `eva.js` already models exactly this.

> ⚠️ **Competition:** over a thousand teams picked this challenge (per Sol Atlas's notes). A layered map with a route is the baseline. The differentiators have to come from elsewhere.

## Requirements checklist

Use this as a scoring sheet. Every row must be answerable in the demo.

### Objectives

**Audited Fri 20:55 by Teammate's Claude against the repo as it is now** (`grep` of `web/components`, `web/lib`, `planner/`, `data/`). ✅ built · 🟡 partial · ⬜ not built. Only claim ✅ rows in the pitch.

| # | NASA asks for | Status | How we answer it | Files | NASA data |
|---|---|---|---|---|---|
| O1 | A map / tool / interface an astronaut could use on a surface mission, built on NASA data and tools | ✅ | Web planner: pick a science site → 3 Marswalk routes on the map, route cards (time, O₂ left, max slope, radiation, steep ground), GO/CAUTION/NO-GO, daylight bar, Mars clock, briefing, Simulate Mission | `web/components/MissionPlanner.tsx`, `map/*`, `Simulation*.tsx`, `planner/src/plan.js` | MSL Gale DEM, HiRISE colour |
| O2 | A location chosen for human explorers (2015 Exploration Zones) | ✅ | Gale Crater, proposed as a human Exploration Zone at NASA's 2015 workshop (abstracts #1022, #1040). Base = Bradbury Landing, a proven safe landing | `data/regions/gale.json`, `docs/DATASETS.md` | NASA 2015 EZ workshop |
| O3 | Start from science goals, then pick a location | ✅ | Science sites = Curiosity's habitability results (lake mudstone, Murray lake beds, hematite ridge, clays + organics), each with a "why it matters" line; SCIENCE route is built to reach them | `web/public/data/gale/pois.json`, `planner/src/plan.js` (`pickScienceStops`) | Curiosity results, MSL waypoints |
| O4 | A well-studied (or less-studied) location | ✅ | The best-studied site on Mars. 3 of 5 sites sit on Curiosity's real end-of-drive stops, and the rover's real path is drawn on the map | `data/msl_traverse.mjs`, `web/public/data/gale/traverse.json`, traverse layer in `MissionPlanner.tsx` | NASA/JPL MSL waypoint feed |
| O5 | At least three kinds of data | 🟡 → ✅ once thermal is shown | **Used in the app:** topographic (1 m DEM → routes, slope layer, 3D), optical (HiRISE colour overlay), radiation (Curiosity RAD dose per route), space weather (live DONKI). That's 4 kinds, so the requirement is met. **Not shown:** THEMIS night-IR `thermal.jpg` is baked but no component loads it (no `thermal` anywhere in `web/components`). Add it as a toggle layer next to Slope (5 min) to claim thermal too | `web/lib/region.ts`, `MissionPlanner.tsx`, `planner/src/plan.js` (`doseMSv`), `web/app/api/space-weather/route.ts` | MSL DEM, HiRISE, RAD, DONKI, THEMIS (baked only) |
| O6 | Safety first: radiation and space weather | ✅ | Each route has its EVA radiation dose (RAD's measured Gale rate, 0.64 mSv/day). A live DONKI CME forecast at Mars turns every route to CAUTION with the reason, shown as a badge and in the briefing. **Mission simulator (T-35):** 5 seeded simulations with dust storms (chance per season from NASA orbiter data, MDAD) and solar-particle alerts; flight rules decide keep going vs turn back; SAFEST / FASTEST / BALANCED; possible damage listed | `planner/src/plan.js`, `web/lib/space-weather.ts`, `RouteCards.tsx`, `Briefing.tsx` | Curiosity RAD (Hassler et al. 2014), NASA DONKI WSA-ENLIL |
| O7 | Spacesuit mobility, and carrying science equipment | ✅ | Suit model: Pandolf metabolic cost at Mars g with a pressure-suit penalty, Tobler-style speed vs slope, 20° walking limit, 8 h suit rating, 25 % O₂ reserve, 20 min work per stop. **Carried gear in the UI** (Sat 21:10): setup panel → Mode → *Science gear carried* None / 10 / 20 kg → `params.kitKg`; routes, cards, briefing and the five simulations all re-price (Pahrump Hills SAFE: 49 % → 41 % → 32 % O₂, GO → CAUTION at 20 kg, same as `docs/VALIDATION.md`) | `planner/src/eva.js`, `web/components/map/SetupPanel.tsx`, `MissionPlanner.tsx`, `docs/VALIDATION.md` | Apollo EVA metabolic data (comparison only) |
| O8 | A route that reaches the targets while avoiding big obstacles | 🟡 | SAFE avoids steep ground: quadratic penalty above 10° on both the cell-to-cell grade and the steepest slope inside each 25 m cell, limit 15°. Validated: the routes follow Curiosity's real path within 250 m for 93.5–100 % of the way. **Not built:** boulders / rock fields (below 25 m cells) | `planner/src/route.js`, `docs/VALIDATION.md` | MSL Gale DEM (1 m source) |

### Potential considerations (optional, but each one answered is a point with judges)
| # | Consideration | Status | How we answer it | Files |
|---|---|---|---|---|
| C1 | Form factor: habitat display, crew tablet, or helmet HUD | 🟡 | Built for a laptop/tablet in the habitat. Phone layout is "not broken" (route cards become a bottom sheet). No helmet HUD | `MissionPlanner.tsx` (`md:hidden` bottom sheet) |
| C2 | Static map, interactive product, or a generator for other places | 🟡 | Interactive product: ✅. Generator: **the pipeline is region-driven** (`data/regions/<id>.json` + `python data/build_region.py <id>`) and the planner runs on any grid, but **only `gale` has ever been baked**. Say exactly that | `data/build_region.py`, `data/regions/gale.json` |
| C3 | Inspiration from maps of other worlds (e.g. Apollo traverse maps) | ⬜ | Not claimed. The EVA model's Apollo comparison is in `docs/VALIDATION.md`, but no Apollo-style map styling was built | n/a |
| C4 | Past, predicted, or no specific time frame | ✅ | "Now": live Mars clock (Mars24), today's daylight at Gale, live space weather | `MarsClockBar.tsx`, `DaylightBar.tsx`, `web/lib/mars-context.ts` |
| C5 | Point-of-view images from surface missions | ⬜ | Not built (no Mastcam/Navcam images in the app) | n/a |
| C6 | Rovers carrying crew and tools, or astronauts in pairs | 🟡 → ✅ when Moss confirms in a browser | **Rover assist:** planner (T-23: Glen Torridon NO-GO on foot → GO by rover, 224 min, 76 % O₂) + UI **Mode** toggle and first-person rover view (T-28, built and builds, **not yet checked in a browser**). Two-person EVA: not built | `planner/src/route.js`, `planner/test/rover.test.js` |

### Gaps we say out loud (README + pitch)

1. **Boulders and rock fields aren't modelled.** 25 m cells see slopes, not individual rocks. NASA's rover drivers used 25 cm HiRISE images for that.
2. **No spectral (CRISM) mineral layer.** The mineral facts in the site descriptions come from published Curiosity results, not from a layer we process.
3. **One region baked.** The pipeline is generic, but only Gale has been run.
4. **Two of five site positions are approximate** (Glen Torridon, Woodland Bay, ± ~150 m–0.5 km). The other three are Curiosity's real stops.
5. **The suit model is a planning estimate** (Pandolf + suit penalty). Its 313–353 W sits at the top of Apollo's measured 228–352 W range, and it's not a validated Mars-suit model.
6. **Single astronaut.** No buddy / two-person EVA logic.
7. **The rover view's close-up ground texture and rocks are procedural**, not mapped boulders. (THEMIS thermal and carried gear are in the UI now.)

## Known gaps other teams hit (opportunities for us)

- **Spectral data (CRISM minerals)** is the data type the statement lists first, and it's hard to get. Sol Atlas couldn't get usable scenes for Jezero from the USGS bucket. The PDS Geosciences Node (ODE) is the source. A region with good CRISM coverage would be a real edge.
- **Two-person EVA** (EV1 + EV2): not done by Sol Atlas.
- **Generator for any place** (C2): Sol Atlas is hard-wired to one site. A planner that works on any region you load is a strong differentiator. It's also a natural fit for our SAFE / FAST / SCIENCE engine.
- **Rock hazard** from 1 m HiRISE elevation models (surface roughness), so boulders show up as hazards.
