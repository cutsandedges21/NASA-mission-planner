# Decision Log

Add new decisions at the bottom. Format: date, decision, why, who.
Treat everything here as settled unless there's a strong reason to change it. If you change one, add a new entry that says so. Don't delete the old one.

---

**2026-11-13: Challenge = Interplanetary Survival Guide: Martian Map** (Moss)
Why: it covers the widest range of skills (web, GIS, algorithms, AI, data viz, UX, scientific reasoning) in one project. We picked it over CLPS Lunar Mission Browser, Planet X & SPHEREx, Field Shift and Earth System Trend Detective.

**2026-11-13: Build a mission-planning platform, not a map** (Moss)
Why: "We built an intelligent mission-planning system" is far stronger for judges and resumes than "we made an interactive map of Mars".

**2026-11-13: AI is a component, not the product** (Moss)
Why: judges discount "LLM on top of data". The app computes routes and hazards itself. AI only explains the computed results.

**2026-11-13: Three route strategies: SAFE / FAST / SCIENCE** (Moss)
Why: it makes the tradeoffs visible and gives the AI something concrete to explain. It's the core of the demo.

**2026-11-13: The "wow" moment = route comparison → AI explanation → animated rover simulation** (Moss)
Why: judges remember something visual they get to experience.

**2026-11-13: Strict tiering (Tier 1 → 2 → 3)** (Moss)
Why: the biggest risk is an over-ambitious, half-finished project.

**2026-11-13: Team is two people, both working with Claude. The repo `docs/` folder is the shared source of truth** (Moss)
Why: each person's Claude needs the full context without chat history.

**2026-11-13: Sol Atlas is reference only, not our base** (Moss)
Why: Sol Atlas (friend's repo, `saracen66/the-sol-explorers`) is a live 2026 entry for the **same challenge**. Forking it risks two near-identical submissions and hurts both teams. We adapted its routing, EVA, Mars-time, space-weather and data-pipeline code.

**2026-11-13: Routes are scored for astronauts on foot (Marswalk / EVA), not just rovers** (Moss's Claude, from the official challenge wording; Moss can overrule)
Why: NASA's ask is to help "a human explorer plan and carry out a successful Marswalk". SAFE / FAST / SCIENCE routes get an O₂ / time / slope / daylight budget from `eva.js`. Rover driving stays an optional mode. See `docs/CHALLENGE.md`.

**2026-11-13: Deadline Sun 15 Nov 12:00 EST. Time-boxed milestones, Tier 3 cut, feature freeze Sat 23:00, submit by Sun 11:00** (Moss)
Why: about 43 hours for 2 people. The schedule is at the top of `docs/TASKS.md`.

**2026-11-13: Stack = Next.js + TypeScript + Tailwind + MapLibre GL + OpenPlanetaryMap Mars basemap, planner in a Web Worker, Claude API for explanations, Vercel** (Moss's Claude; Moss can overrule)
Why: fastest for Moss, a clean 2D mission-control look that's deliberately unlike Sol Atlas's 3D game view, no tile server needed. Full detail and the data contract in `docs/ARCHITECTURE.md`.

**2026-11-13: Region = Gale Crater, Curiosity field site, lon 137.30–137.50 °E, lat −4.80 → −4.55 ° (region id `gale`)** (Teammate's Claude, T-04; Teammate/Moss can overrule)
Why: Gale was proposed as a NASA human Exploration Zone at the 2015 workshop (answers O2). It has the sharpest public terrain on Mars (USGS MSL Gale Merged DEM, 1 m) plus a HiRISE colour mosaic, both in the same USGS bucket Sol Atlas's pipeline reads. Every science POI has been ground-truthed by Curiosity. Not Jezero. Base = Bradbury Landing; demo walk Bradbury → Glen Torridon ≈ 8.7 km. Datasets, POIs and pipeline notes in `docs/DATASETS.md`. Fallback DEM if the 1 m read is too slow: HRSC+MOLA 200 m.

**2026-11-13: Routes are scored as a round trip by default (out to the destination and back to the airlock)** (Teammate's Claude, T-05; Moss can overrule with `roundTrip: false`)
Why: a Marswalk starts and ends at the habitat, and the challenge is about getting the explorer home safely. A* minimises the cost of both directions on every step, and "O₂ left" is what remains at the airlock. Consequence: a useful single-EVA range is about 6 km one way. Demo pair updated in `docs/DATASETS.md`.

**2026-11-13: Map is 2D by default, with an optional 3D view** (Moss)
Why: 2D is clearer for planning and works best on phones. 3D is the "show" mode for the demo. It's built with MapLibre terrain fed by our own elevation grid (no second 3D library). Details in `docs/ARCHITECTURE.md` → Map.

**2026-11-13: Desktop is the primary view, phone is secondary** (Moss)
Why: judges and the demo video use a desktop. Design and polish desktop first. Phones only need to work (no broken layout), not to shine. T-16 was downgraded accordingly.

**2026-11-13: The recommended route is picked by a fixed rule, and the AI briefing is number-checked** (Teammate's Claude, T-12; Moss can overrule)
Why: "AI explains, never decides." The rule is best verdict → SCIENCE if it visits a site → SAFE → FAST. Claude writes the 3-sentence explanation; if it quotes any number that isn't in the computed data, the server swaps in the template briefing. Judges can see the AI can't make things up. Details in ARCHITECTURE.md → AI explanation contract.

**2026-11-13: A space-weather warning makes every route at least CAUTION (never NO-GO on its own)** (Teammate's Claude; Moss can overrule)
Why: the challenge says safety first (O6), and a CME forecast to reach Mars is exactly what a flight controller flags. It stays a CAUTION because a DONKI forecast window spans days and doesn't by itself make a short EVA unsafe. Each route also reports its radiation dose from Curiosity RAD's measured Gale surface rate (0.64 mSv/day).

**2026-11-13 (Fri 20:50): The one "wow" upgrade (T-07) = Rover assist** (Moss's Claude's proposal; Moss can overrule)
Why: on the real Gale terrain, 3 of the 5 science sites are 9.4–9.9 km one way, which is NO-GO on foot. A single toggle that turns NO-GO into GO with an unpressurised rover is a clear demo beat, answers challenge consideration C6 (rovers carrying crew and tools), and is cheap because the EVA model already has rover parameters. Planner side = T-23 (Teammate), UI toggle = Moss's Claude once T-23 lands. Rejected for now: two-person EVA (needs a new crew model), CRISM minerals (data not reachable), boulder hazard (no data at 25 m).

**2026-11-13 (Fri 20:00): Science-site positions come from NASA/JPL's MSL waypoint feed, not HiRISE image centres** (Moss's Claude)
Why: image centres were up to 2.2 km from the feature they named (Yellowknife Bay). The rover's real stops are authoritative and citable. Curiosity's real drive path is also drawn on the map (`web/public/data/gale/traverse.json`) and is the basis for the planner validation (T-22).

**2026-11-13 (Fri 20:10): Default region is the real Gale data; the Vercel project stays behind Vercel login until Moss says "make it public"** (Moss's Claude)
Why: deployments are protected by default; making a site public (and, once ANTHROPIC_API_KEY is set, exposing a paid API route) is Moss's call. `?region=demo` loads the synthetic terrain.

**2026-11-13 (Fri 21:15): The Vercel site is PUBLIC: https://nasa-eva-planner.vercel.app** (Moss said "make the vercel public")
Production deployments no longer need a Vercel login (`ssoProtection` is now `preview` only: preview URLs stay protected). Latest build (real Gale data, redesign, Simulate Mission) is live. **Deploy recipe** (the Hobby plan blocks deploys whose git author isn't the account owner, so deploy from a copy with no git history): copy `web/` + `planner/` to `C:\tmp\deploy-snapshot` (no `node_modules`, `.next`, `.env.local`, `.vercel`), copy `.vercel/project.json` into it, then `cd C:\tmp\deploy-snapshot && vercel deploy --prod --yes`. Pushing to GitHub does NOT deploy (those builds are blocked), so tell Moss's Claude when you want a redeploy.
**Open risk:** once `ANTHROPIC_API_KEY` is set (T-19), the public `/api/explain` calls a paid API. Teammate: add abuse protection first (task T-27).

**2026-11-14 (Sat 11:30): Use the language best suited to each task, keep the site light, ask Moss first** (Moss)
Moss: "rather than only use typescript, use other languages that are better suited for certain tasks. At the same time, keep the website very light so a laptop with 16 GB RAM can run it smoothly. Ask me before using that language." So: before adding a new language anywhere (build scripts, services, WASM, shaders), ask Moss and log the answer here. Heavy work belongs at build time; the browser should only load small finished files. **Approved so far:** Python for build-time data steps (already used in `data/build_region.py`; Sat 11:30 also for `data/geology_gale.py`, T-34).

**2026-11-14 (Sat 12:30): The whole-planet map comes from NASA Mars Trek, reprojected in the browser, not from Trek's own viewer** (Teammate's Claude, T-33; Gianluca asked for Trek's map types and "keep it light")
Why: Trek's Cesium viewer is too heavy for our 16 GB laptops. Trek's WMTS tiles are equirectangular (CORS open), so a tiny `trek://` MapLibre protocol redraws them as Web Mercator on a canvas. No new library, and only the visible layer loads. Map types: Colour (Viking MDIM 2.1), Height (MOLA colour relief), Thermal (THEMIS day IR), Slope, plus MapLibre's built-in globe. OpenPlanetaryMap is dropped. The hover temperature is a labelled **model** (REMS range at Gale), because no live calibrated temperature map of Mars exists.

**2026-11-14 (Sat 11:50): Routes are drawn as a smoothed line; the numbers stay on the cell path** (Teammate's Claude, T-32; Gianluca and Moss asked for NASA's PIA26042 look)
Why: 8-direction A* draws 45° staircases. `smoothLine` string-pulls them only where the shortcut is never steeper than the planned route and stays within 50 m of it, then rounds the bends. The EVA budget still uses the cell path (≤ 2–8 % longer), so O₂ stays conservative and no quoted number changes.
