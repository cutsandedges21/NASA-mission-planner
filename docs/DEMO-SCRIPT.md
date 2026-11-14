# Demo scripts (T-24)

**Every number below is reproducible:** `node planner/scripts/demo-numbers.mjs` (route numbers, rover, kit, storm) and `node planner/scripts/validate-gale.mjs` (the Curiosity-path comparison). Both run from the repo root on the real baked Gale data, take a few seconds, and need no internet. If a number on screen differs from the script, trust the screen and fix the script.

Pace: about 150 words a minute. ⚠️ marks a beat that needs a feature **not built yet** in the UI. Moss, these are your priorities. Each one has a fallback line, so the video works either way.

Clicks use the labels in the current UI (after Moss's Fri 20:10 coherence pass): **Loading** (waits for the NASA data) → **landing = target picker** (left column picks a site, the planet turns into its HiRISE terrain) → **Plan this EVA** → map. On the map: route choice in the **route cards**, **2D/3D** in the top bar, the **dock** holds the briefing + **Simulate** / frame / **slope** buttons, **Credits** in the top bar.

---

## A. 30-second version (≈ 75 words)

| Time | On screen | Clicks | Narration |
|---|---|---|---|
| 0:00 | Landing: pick Pahrump Hills, planet turns into its terrain | Pahrump Hills in the left column → **Plan this EVA** | "This is a Marswalk planner on real NASA terrain at Gale Crater, where Curiosity landed." |
| 0:07 | Three routes appear, cards show GO | none | "Pick a science site and it computes three walks: safe, fast and science. Pahrump Hills: 11.8 km there and back, 3 hours 41 minutes, 49 % oxygen left. GO." |
| 0:17 | Curiosity's dashed path under our routes | hover the dashed line | "Our route follows the path NASA's rover drivers chose: within 250 metres for the whole fast route." |
| 0:24 | Briefing in the dock | none (the dock shows it) | "An AI briefing explains it, using only the numbers we computed." |

(72 words)

---

## B. 3-minute version (≈ 450 words)

| Time | On screen | Clicks | Narration (word for word) | Numbers shown (source) |
|---|---|---|---|---|
| 0:00 | Hero: the Mars globe | none | "Picture the first crew on Mars stepping out of the airlock. Every walk, a Marswalk, is a budget: oxygen, slope, daylight, radiation. Get it wrong and you don't make it back. So we built a planner that does that maths on real NASA data." | none |
| 0:20 | Landing target picker → map of Gale with the HiRISE colour image; slope layer on | pick Pahrump Hills in the left column → **Plan this EVA**; dock **slope** button on, then off | "We're at Gale Crater, proposed as a site for human explorers at NASA's 2015 landing-site workshop, and where Curiosity has driven since 2012. The terrain is NASA's 1-metre elevation model, the colour is HiRISE. The dashed line is Curiosity's real drive path, 1,270 stops from NASA's waypoint feed." | 1,270 stops; 1 m DEM (demo-numbers header) |
| 0:45 | Base at Bradbury Landing; 3 routes + cards for Pahrump Hills | click through the **route cards** (SAFE, FAST, SCIENCE) | "Our base is Bradbury Landing. Target: Pahrump Hills, the foot of Mount Sharp. The planner runs three searches on the terrain. Safe avoids steep ground. Fast minimises walking time. Science adds work time at the site. All three are GO: 11.8 kilometres there and back, 3 hours 41 minutes, 49 % oxygen left at the airlock, and a radiation dose of a tenth of a millisievert, from Curiosity's own measurements." | SAFE 11.8 km, 3 h 41 min, 49 %, 0.10 mSv, GO; SCIENCE 4 h 01 min, 46 % (demo-numbers) |
| 1:15 | Briefing in the dock, text typing in | none (the dock shows it) | "The mission briefing is written by an AI, but it can't make anything up. The route is picked by a fixed rule, and if the AI quotes any number we didn't compute, it's thrown out and a template is used instead." | whatever the panel shows; label "Worded by Claude…" or "Template…" |
| 1:35 | Daylight bar + space-weather badge on CAUTION | point at the bar, then the badge | "It also checks the clock. This bar shows the walk against Gale's daylight. And this badge is live: NASA's DONKI service forecasts solar storms, and when one is heading for Mars every route drops to CAUTION." | live badge text; with a CME all routes CAUTION (demo-numbers "solar-storm" block) |
| 1:55 | 3D view, camera tilted along the route | top nav **2D/3D** | "Here's the same plan in 3D, draped over the real relief of Mount Sharp." | none |
| 2:10 | Simulation: walker moves, O₂ gauge drains, site card at Pahrump | **Simulate** | "Simulate Mission plays the whole walk: oxygen draining, the work stop at Pahrump Hills, and the walk home." | O₂ gauge ends ≈ 46 % (SCIENCE) |
| 2:25 | Glen Torridon NO-GO on foot → **Mode: Rover assist** → GO → ▶ first-person rover ride → science-stop card | pick Glen Torridon; setup panel **Mode** → **Rover assist**; on the route card press ▶; let the ride run to the site card; Esc / **Map** to leave | "Some targets are too far on foot. Glen Torridon, the clay layer with organic molecules, is NO-GO walking: 9.4 kilometres each way, 5 % oxygen left. Switch to rover assist and it's GO: 3 hours 44 minutes, 76 % oxygen. And here's the ride, on the real terrain from NASA's elevation model." **Fallback if the rover view misbehaves on recording day:** stay on the map and press **Simulate** instead. | foot SAFE 5 % NO-GO; rover 3 h 44 min, 76 % GO (demo-numbers); ⚠️ say "real terrain", not "real ground texture": close-up rocks are decorative |
| 2:40 | Validation slide: our routes over Curiosity's path + the numbers | none (slide) | "Is this any good? We compared our routes with the path NASA's rover drivers actually chose. Our fast route stays within 250 metres of it for its whole length, and the safe route for 93 %." | FAST 100 %, SAFE 93.5 % within 250 m (validate-gale) |
| 2:50 | Credits panel | top nav **Credits** | "Built for NASA Space Apps 2026 on NASA data from HiRISE, Curiosity, Mars Odyssey and DONKI, with routing adapted from Sol Atlas. Next: boulders from HiRISE, two-person EVAs, and any landing site you load." | none |

(~430 words of narration)

### Optional beat: Mission simulator (≈ 30 s, after 2:10 Simulate)

| On screen | Clicks | Narration (word for word) | Numbers shown (source) |
|---|---|---|---|
| Mission simulator panel, top of the map, Pahrump Hills planned | point at the three cards; click **SAFEST**, then **Step by step**; tick **What if a dust storm hits?**; click **FASTEST** | "Planning is one thing, the walk is another. The mission simulator runs five seeded simulations, each with its own appetite for risk, its own hidden ground and its own weather, and each finds its own route. It picks the fastest, the safest and the balanced one, and keeps the other two a click away. Here's the safest, step by step: heading, distance, climb, steepest ground, oxygen. How often do storms reach Gale? We used NASA orbiter maps of almost fifteen thousand dust storms. And if one hits anyway: the fast crew keeps going, the cautious one turns back." | read the times and problem counts off the cards (they depend on the season and the leave time; seeds make them repeatable) |

### Beats that need something built (Moss)

1. **2:25 Rover assist**: built (T-28, Mode toggle + first-person rover view). **Moss: check it in a browser before recording.** The fallback line uses plain Simulate.
2. **2:40 Validation slide**: a static image is enough: our routes + Curiosity's dashed path for Pahrump, with "within 250 m: FAST 100 %, SAFE 93.5 %". It can be a screenshot of the map plus text.
3. **Slope layer at 0:20**: works today (dock **slope** button). If the THEMIS thermal toggle is added (T-08 quick win), show it here too and say "and Mars Odyssey's night-time thermal image".
