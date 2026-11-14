# Task Board (live)

**This is the live to-do list for both people and both Claudes.** Pull often. It changes every few minutes.

People: **Moss** (product, frontend, UI/UX) and **Teammate** (data, routing, backend, AI pipeline). The split is still a proposal: see T-01.

Status values: `TODO` · `IN PROGRESS (who, time)` · `BLOCKED (on what)` · `DONE (commit)`

## 📣 FOR TEAMMATE'S CLAUDE (Fri 20:15, from Moss's Claude): you are NOT out of work. Do these in this order

**Pull first** (`git pull --rebase --autostash`). A lot changed in the last hour:

- **Real Gale data is in the repo**: `web/public/data/gale/` has `meta.json`, `elev.i16`, `slope.png`, `visible.jpg`, `thermal.jpg`, `pois.json` and the new **`traverse.json`** (Curiosity's real drive path from NASA/JPL's MSL waypoint feed). So **everything below runs offline in plain Node**: no internet, no `node_modules` (the planner is pure JS).
- **Three science sites were wrong by up to 2.2 km** and are now snapped to places Curiosity really stopped (see T-21). New facts on the real terrain (measured, full planner, `fineSlope` off): Bradbury → Yellowknife Bay **0.4 km** one way (GO); → Pahrump Hills **5.9 km** (GO); → Vera Rubin Ridge / Glen Torridon / Woodland Bay **9.4–9.9 km one way = NO-GO on foot**. Planning takes < 0.7 s even for the longest. **Your README draft and `docs/DATASETS.md` still say Glen Torridon is "a realistic single EVA" and list the old coordinates: both are now wrong** (fixed in T-22 step 0 and T-17).
- **Who owns what (avoid conflicts):** YOU own `planner/`, `data/`, `web/app/api/`, `web/lib/credits.ts` (new) and the docs. **Chat B** (visuals) owns `web/components/map/*`, `web/components/ui/*`, `web/app/*.css`, `web/components/Intro.tsx`. **Moss's logic chat** owns `web/components/MissionPlanner.tsx`, `Simulation*.tsx`, `web/lib/{region,mars-context,mars-scale,terrain,mission-timeline,plan-client}.ts`. If a planner change needs a type change in `web/lib/plan-client.ts`, make it in the **same commit** and say so in the task Result.
- **Rules as always:** claim a task (status `IN PROGRESS (Teammate, HH:MM)`, push), commit + push after every step, set `DONE (commit)` + a Result line with real numbers/outputs when the done-check passes.

**Priority order: T-22 → T-23 → T-08 → T-24 → T-25 → T-26 → T-17 (final).** If you finish everything, see "Stretch" at the bottom.

## T-27 · Abuse protection for the public /api/explain (before any API key goes live)
- **Owner:** Teammate · **Time box:** 30 min · **Priority:** do right after your current task · **Status:** DONE (see commit "T-27 done")
- **Result:** limits chosen: **20 KB body → 413**; **12 AI calls / 10 min per IP** (first `x-forwarded-for` hop); **300 AI calls / hour per instance**; **10-min cache** of identical requests (`cached: true`, no API cost); `max_tokens` 300 (tested). Over a limit = HTTP 200 + template briefing, `reason: 'rate limited'` (the demo never breaks). Logic in `web/lib/explain.ts` (`ExplainGate`, `handleExplain`, `clientIp`); `route.ts` is now 10 lines. `node --test web/app/api/_tests/api.test.mjs` → **15/15**. **Moss:** (1) needs a **redeploy** to go live. (2) When you add the key (T-19), also set a **monthly spend limit in the Anthropic console**: per-instance limits are a speed bump, not a wall. (3) README + SUBMISSION now use https://nasa-eva-planner.vercel.app.
- **Why:** the site is public now (see DECISIONS, Fri 21:15). When Moss adds `ANTHROPIC_API_KEY` (T-19), anyone could call `POST /api/explain` in a loop and run up the bill. Today it only returns the template (no key), so nothing is exposed yet.
- **Steps:**
  1. In `web/app/api/explain/route.ts` (your file) add, **before** calling Claude: (a) request body limit (reject > 20 KB with 413); (b) a per-IP limiter: at most 12 AI calls per 10 minutes per IP (`x-forwarded-for` first hop), kept in a module-level `Map` (it is per-serverless-instance, which is fine as a speed bump); over the limit → return the **template briefing** with `source: 'fallback'`, `reason: 'rate limited'` (never an error: the demo must keep working); (c) a global ceiling of 300 AI calls per hour per instance, same fallback; (d) `max_tokens` already 300: keep it.
  2. Cache: identical request bodies (hash of the JSON) return the previous AI answer for 10 minutes, so judges re-clicking the same route cost nothing.
  3. Tests in `web/app/api/_tests/api.test.mjs` for (a), (b), (c), (d) with the mocked fetch used by the other tests. `node --test web/app/api/_tests/api.test.mjs` must pass.
  4. Same idea for `/api/space-weather` is **not** needed (it is cached 30 min and uses the free NASA key).
- **Done when:** the tests pass and the Result lists the limits you chose.

## T-28 · Rover assist toggle + first-person rover view (Moss's Claude, Fri 21:45)
- **Owner:** Moss's Claude · **Status:** DONE and LIVE (Sat 10:30). Watched in a real browser on localhost and on https://nasa-eva-planner.vercel.app: Glen Torridon on foot = NO-GO (4–6 % O₂) → **Rover assist** → GO (SAFE 3h44, 76 % O₂; SCIENCE 4h38, 69 %) → Simulate → first-person ride with the route on the ground, site markers, science-stop card, instruments, compass. Fixed after the first look: a white base beam veiled the whole scene at the start, the fine ground noise aliased into stripes, the route glow smeared under the camera, instruments hid behind the deck. **Teammate: C6 in `docs/CHALLENGE.md` can be ✅ now.** Not done: the ride is a time-lapse (about ×240), the ground detail is procedural.
- **What it is:** a **Mode** section in the setup panel (`On foot | Rover assist`). Rover assist plans with `params: { rover: true }` (Teammate's T-23) and the briefing is told about it. Pressing ▶ on a rover-assist route opens the **first-person rover view**: the real Gale terrain from the 1 m NASA DEM as a 3D mesh skinned with the HiRISE image, procedural ground grain + rocks (denser on steep ground), a Mars sky with the sun placed from the real local solar time, haze, the route painted on the ground, light beacons + labels at the science sites, a heading compass, instruments, and an open-seat rover deck. Drag to look around; Esc or the HUD's **Map / Rover view** switch leaves it. The same view exists for walking (**First person**). Switching views keeps the mission clock. The rover view plays at a slower pace (55 s walk + 5 s at each stop) because the map pace would be ~500 m/s at ground level; the HUD shows the time-lapse factor.
- **Files (mine):** `web/lib/rover-terrain.ts` (heightfield, tested by `node web/scripts/test-rover-terrain.mjs`), `web/lib/rover-scene.ts` (three.js scene + GLSL; loaded on demand so the map screen doesn't carry three.js), `web/components/RoverView.tsx` (camera driver + cockpit overlay), `web/components/Simulation.tsx` + `SimulationHUD.tsx` (view state, two pacings, HUD switch), `web/lib/mission-timeline.ts` (`uAtTau`, `locator.metres`). New dependency: `three` + `@types/three`.
- **Chat B, what changed in your files (small, additive):** `map/SetupPanel.tsx` got optional `rover` / `onRover` props and a **Mode** section (local `IRover` icon). `MissionPlanner.tsx` renders `{simulation.viewLayer}` right after the map container (under the panels), wraps SetupPanel / RouteCards / DockCard / the phone sheet in `{!simulation.immersive && …}` (the first-person view is full screen, so the side panels hide while it runs), and keeps `{simulation.panel}` (the HUD) above. I merged your restyled `SimulationHUD.tsx` and put the view switch (`Segmented`) in its header and a `×N` time-lapse chip next to the speed pills: please keep them when you restyle. **Please restyle** `RoverView.tsx` (cockpit SVG, compass, instruments, labels are plain Tailwind) when you have time, and consider a small "Rover" tag on the route cards when `route.budget.mode === 'rover'`.
- **Teammate:** add the beat to `docs/DEMO-SCRIPT.md`: Glen Torridon on foot = NO-GO → toggle **Rover assist** → GO (224 min, 76 % O₂) → ▶ Simulate → first-person ride → science-stop card. In `docs/CHALLENGE.md` C6 can move to ✅ once Moss has seen the rover view working (I will say so here).
- **Known limits (be honest in the pitch):** ground detail is procedural (grain, pebbles, rocks): the real data is 25 m cells and a 7 m/px colour image, so close-up texture is not real HiRISE 25 cm. Rocks are decorative, not mapped boulders.

## T-21 · Science-site positions were wrong by up to 2.2 km: snapped to NASA's real rover stops
- **Owner:** Moss's Claude · **Status:** DONE (Fri 20:05)
- **Result:** NASA/JPL's MSL waypoint feed (`https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json`, 1,389 end-of-drive stops, sol 3 → 5073) shows where Curiosity really stopped. `data/msl_traverse.mjs` moved **Yellowknife Bay 2,176 m** → (137.44913, −4.58948) (rover parked there sols 125–297), **Pahrump Hills 794 m** → (137.37746, −4.66270) (sol 753), **Vera Rubin Ridge 1,424 m** → (137.37809, −4.72565) (sol 2128, centroid of its ridge campaign). Glen Torridon (147 m from a real stop) and Woodland Bay (33 m) were already fine and stay `approx`. `data/regions/gale.json` updated; `web/public/data/gale/pois.json` regenerated with `python data/build_region.py gale` (uses `data-cache/`, check OK); new `web/public/data/gale/traverse.json` (1,270 stops inside the box, 26 KB). The old HiRISE "image centre" coordinates were up to 2 km from the feature they named.

## T-22 · Prove the planner against Curiosity's real path (our "Validity" slide)
- **Owner:** Teammate · **Time box:** 90 min · **Status:** DONE (see commit "T-22 done")
- **Result:** `node planner/scripts/validate-gale.mjs` → tables + `docs/validation.json`, ~2 s, exit 0. Write-up in `docs/VALIDATION.md`. **Pitch sentence (measured):** *On the 5.9 km walk to the foot of Mount Sharp, our FAST route stays within 250 m of the path NASA's Curiosity drivers chose for 100 % of its length, and the SAFE route for 93.5 %. On the way to Yellowknife Bay, all three stay within 113 m of it.* Energy: 313–353 W, at the top of Apollo's measured 228–352 W range, which fits Mars' higher gravity (not tuned). Sensitivity: 20 kg of kit turns Pahrump SAFE from GO to CAUTION. **Also fixed:** SAFE now penalises the steepest slope inside each cell (it used to see only cell-to-cell grade, so it was steeper than FAST on real terrain: 12.5° vs 12.3°, now 12.3° = 12.3°). Loader for Node: `planner/scripts/lib/load-gale.mjs` (zlib PNG decoder, matches PIL to the exact pixel sum). `docs/DATASETS.md` POI table + demo numbers updated.
- **Why:** judges ask "how do you know your routes are any good?" NASA's own rover drivers chose a path through this exact terrain. If our SAFE route hugs it, that is the strongest validity claim we can make, and the numbers go in the README, the video and the briefing.
- **Steps:**
  0. Fix the stale facts first: update the POI table in `docs/DATASETS.md` to the coordinates + sources now in `web/public/data/gale/pois.json`, and replace the "Glen Torridon is a realistic demo" line with the measured facts above (Pahrump Hills is the real single-EVA demo).
  1. `planner/scripts/lib/load-gale.mjs`: load the region for Node. `meta.json`, `pois.json`, `traverse.json` (GeoJSON `MultiLineString`, one segment, in drive order). `elev.i16` = little-endian Int16 metres, row 0 = north, `meta.width × meta.height` (473×593): `Float32Array.from(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2))`. `slope.png` = **8-bit grayscale, non-interlaced PNG** (473×593; checked): write a ~40-line decoder with `node:zlib` (`inflateSync` the concatenated IDAT chunks, undo PNG filters 0–4 row by row, 1 byte per pixel) → `fineSlope = Float32Array` of `value / meta.slopeScale` degrees. Export `toCell(meta, lon, lat)` and `toLonLat(meta, x, y)`: x = floor((lon − lon0)/(lon1 − lon0)·width), y = floor((lat1 − lat)/(lat1 − lat0)·height); a cell centre is +0.5 (same maths as `web/lib/region.ts`). Sanity check: elevation at Bradbury Landing (`meta.base`) ≈ −4500 m.
  2. `planner/scripts/validate-gale.mjs`: for Bradbury → Yellowknife Bay and Bradbury → Pahrump Hills (the two sites the rover really drove to in sols 0–760), run `planMission` with the decoded `fineSlope` and compare each strategy with the real path (the part of `traverse.json` from the landing until the rover first gets within 150 m of the target). Report per route:
     - cross-track distance from OUR path to the real polyline: mean, median, 90th percentile, max (m);
     - % of our path length within 100 m and within 250 m of the real path;
     - path length: ours vs the real rover's (the rover drove farther because of science stops, sand and wheel care: say that, don't hide it);
     - steepest slope along ours vs along the real path (sample the real polyline every 10 m on `fineSlope`), and % of each on ground steeper than 15°.
  3. Energy sanity: print `budget.avgW` and `budget.o2` for each route and compare with published EVA metabolic rates (Apollo averaged roughly 250–300 W; ISS EVAs are in the same range). One honest sentence: in range or not. If it is off, **say so**; don't tune silently.
  4. Sensitivity (5 lines): Pahrump SAFE verdict and O₂ margin for `kitKg` ∈ {0, 10, 20, 30} and `o2CapKg` ∈ {0.5, 0.6, 0.75} via `params`.
  5. Write `docs/VALIDATION.md`: method in 5 lines, the tables, **honest limits** (25 m cells ignore boulders; the rover has wheels, an astronaut has legs; the real traverse was shaped by science goals), and ONE pitch sentence made only of measured numbers, e.g. "Our SAFE route to Pahrump Hills stays within N m of the path Curiosity drove for X % of its length". Save the raw numbers to `docs/validation.json` so the README and the video can quote them.
- **Done when:** `node planner/scripts/validate-gale.mjs` prints the tables and exits 0, `docs/VALIDATION.md` and `docs/validation.json` exist, and the pitch sentence is true.

## T-23 · Rover assist mode in the planner ("NO-GO on foot → GO with a rover")
- **Owner:** Teammate · **Time box:** 90 min · **Status:** DONE (see commit "T-23 done")
- **Result:** rover assist works end to end. `cd planner && npm test` → 23/23 (new `test/rover.test.js`). **Bradbury → Glen Torridon, round trip:** on foot SAFE 19.1 km, 377 min, 5 % O₂ **NO-GO** · FAST 18.8 km, 372 min, 6 % **NO-GO** · SCIENCE 393 min, 4 % **NO-GO** → **by rover** SAFE/FAST 18.8 km, **224 min, 76 % O₂, GO** · SCIENCE 20.0 km, 278 min (adds a Pahrump Hills stop), 69 %, **GO**. Model: drive at `roverMs` 1.4 m/s, seated O₂ at `rideW` 150 W, science stops still on foot at `stopW`, hard limit `EVA_DEFAULTS.roverMaxSlope` = 20°, SAFE keeps its > 10° penalty; heuristics switch to rover speed so A* stays exact.
- **For Moss's Claude, the "Rover assist" toggle:** call `plan({ ...args, params: { rover: true } })` (types already in `web/lib/plan-client.ts`: `PlanArgs.params`, `Budget.mode: 'foot' | 'rover'`). Show "🚙 Rover" on cards when `budget.mode === 'rover'`. Verdict slope messages say "(rover limit 20°)". Pass the same `params` into `/api/explain` routes if you want the briefing to say "by rover" (add `mode` to each route object; it's just passed through). Demo beat: Glen Torridon on foot = NO-GO → toggle → GO.
- Optional walkback check: not done yet (it's last in the queue).
- **Why:** on foot, 3 of 5 science sites are NO-GO (9.4–9.9 km one way). Real surface missions use rovers (Apollo LRV; NASA's crewed-rover concepts). Flipping Glen Torridon from NO-GO to GO with one toggle is a great demo beat and answers challenge consideration C6 ("rovers carrying crew and tools").
- **Steps:**
  1. The EVA model already has rover parameters (`EVA_DEFAULTS.rover`, `roverMs` 1.4 m/s, `rideW` 150 W) and `budget()` honours them. What is missing is routing. In `planner/src/route.js` make `strategyCost` rover-aware when `params.rover` is true: time cost = distance / `roverMs`; hard slope limit `roverMaxSlope` (add it to `EVA_DEFAULTS`, 20°); SAFE still penalises ground above 10°; the A* heuristic must use `roverMs` in rover mode so it stays admissible.
  2. `planMission({ ..., params: { rover: true } })` must work end to end. Add `budget.mode = 'rover' | 'foot'`. Stops still cost `stopW` (working on foot at the site). Verdict text mentions the rover where relevant.
  3. In the **same commit** add `params?: Record<string, unknown>` to `PlanArgs` and `mode?: 'foot' | 'rover'` to `Budget` in `web/lib/plan-client.ts`.
  4. Tests in `planner/test/rover.test.js`: (a) synthetic grid: rover is faster than foot over the same ground, and never uses cells above `roverMaxSlope`; (b) real Gale (use T-22's loader): Bradbury → Glen Torridon is NO-GO on foot and not NO-GO with the rover (print both sets of numbers); (c) all existing planner tests still pass.
  5. In this task's Result give Moss's Claude the exact call and field names so it can add the "Rover assist" toggle to the UI.
- **Done when:** `cd planner && npm test` passes and the Result lists Glen Torridon foot vs rover (time, O₂ margin, verdict).
- **Optional, only if everything else is done:** a simple Apollo-style "walkback" check (could the crew walk home on the remaining O₂ if the rover broke down?). It is standard NASA practice, so credit it as such.

## T-08 (reassigned to Teammate) · Challenge checklist: an honest audit, not a sales sheet
- **Owner:** Teammate (was Moss's Claude) · **Time box:** 45 min · **Status:** DONE (see commit "T-08 done")
- **Result:** `docs/CHALLENGE.md` audited row by row against the code: O1–O4, O6, C4 ✅ · O5, O7, O8, C1, C2, C6 🟡 · C3, C5 ⬜, with files + datasets per row and a 7-item "Gaps we say out loud" list. **Three quick wins for Moss's Claude, each turning a 🟡 into a ✅:** (1) **THEMIS thermal layer**: `thermal.jpg` is baked but nothing loads it. Add an image source + toggle next to Slope (copy the `slope` source/layer in `MissionPlanner.tsx`, url `region.url('thermal.jpg')`). (2) **Rover assist toggle** (T-23 Result has the exact call). (3) **Carried kit** select (0/10/20 kg → `params: { kitKg }`).
- **Steps:** open `docs/CHALLENGE.md`. Take your drafted answers (in the old T-08 block further down) but **audit each one against the repo as it is now** (grep the code and read the components; chat B rebuilt the screens). For every row O1–O8 and C1–C6 write: status (✅ built / 🟡 partial / ⬜ not built), one line on the feature, the exact file(s), and the NASA dataset. Do not claim what isn't there (boulders, CRISM minerals, two-person EVA). Claim C6 only once T-23 is done. For C2 ("a generator for other places"): the pipeline is region-driven but only `gale` has been run, so say exactly that. End with a **"Gaps we say out loud"** list for the README and the pitch.
- **Done when:** every row has a status + files, and the Gaps list exists.

## T-24 · Demo scripts + submission page text
- **Owner:** Teammate · **Time box:** 90 min · **Status:** DONE (see commit "T-24 done"), waiting on Moss for the official field limits
- **Result:** `docs/DEMO-SCRIPT.md` (30 s, 72 words; 3 min, ~430 words, 10 beats with timecode / screen / clicks / narration / numbers) and `docs/SUBMISSION.md` (title, 137-character summary, 255-word description, what it does, how we built it, challenges, proud of, next, 10 NASA data links, tools, AI use). **Every number reproduces with** `node planner/scripts/demo-numbers.mjs` (new) and `node planner/scripts/validate-gale.mjs`. **Beats that need UI (Moss):** rover assist toggle at 2:25 (fallback line included), a static validation slide at 2:40, and the optional THEMIS toggle at 0:20. **Moss: please paste the official Space Apps 2026 project-page fields, character limits and video rules (length, where it's hosted) into `docs/SUBMISSION-REQUIREMENTS.md`** and Teammate's Claude will fit the text to them. **Also fixed while measuring:** under a solar-storm warning SCIENCE used to keep an extra stop (Pahrump: 37 % O₂ instead of 46 %), because the CAUTION hid the difference. Stop choice now ignores the storm caution (+ regression test, 24/24 pass).
- **Steps:**
  1. `docs/DEMO-SCRIPT.md`: (a) a 30-second version, (b) a 3-minute version. For each beat: timecode, what is on screen, the exact clicks, the narration word for word (about 150 words/minute), and the real number shown (from `docs/validation.json` and `planMission` runs on the real data). Suggested 3-minute arc: 0:00 hook (what a Marswalk is, why oxygen/slope/daylight/radiation need planning) → 0:20 Gale + real data (HiRISE colour, 1 m NASA terrain, Curiosity's real path dashed) → 0:45 Bradbury → Pahrump Hills, three routes GO/CAUTION → 1:15 mission briefing (the AI only words numbers the planner computed) → 1:35 daylight + live solar-storm warning from NASA DONKI → 1:55 3D view → 2:10 Simulate Mission (O₂ gauge, science-stop card) → 2:40 the validation claim → 2:50 what's next + credits. Mark any beat that needs a feature not built yet so Moss can prioritise.
  2. `docs/SUBMISSION.md`: paste-ready blocks for the NASA project page: title, one-line summary (≤ 140 characters), description (≤ 300 words), what it does, how we built it, challenges, what we're proud of, what's next, **NASA data and resources used** (bullets with URLs: from `web/public/data/gale/meta.json` `sources`, plus DONKI, MSL waypoints, RAD), tools, AI use. Use placeholders `{{LIVE_URL}}`, `{{REPO_URL}}`, `{{VIDEO_URL}}`.
  3. You have no internet: in this task's Result ask Moss to paste the **official Space Apps 2026 submission fields, character limits and video requirements** into `docs/SUBMISSION-REQUIREMENTS.md`, then fit your text to them.
- **Done when:** both docs exist and every number in them has the command that reproduces it next to it.

## T-25 · Credits data + AI-use disclosure
- **Owner:** Teammate · **Time box:** 40 min · **Status:** DONE (see commit "T-25 done")
- **Result:** `web/lib/credits.ts` exports `CREDITS` (20 entries: 10 NASA data, 4 models & methods, 5 software, 1 inspiration). Every URL comes from the baked `meta.json` `sources` or a publisher page, and the DOIs for Pandolf 1977, Allison & McEwen 2000 and Hassler 2014 were checked. `docs/AI-USE.md` = the disclosure (build with Claude Code, runtime briefing only, number guard + template, no AI media). **For chat B / Moss's Claude:** (1) render `CREDITS` in `web/components/map/Credits.tsx`, grouped by `group`, instead of its hard-coded `NASA_DATA` list. (2) That list has an **HRSC+MOLA 200 m** entry whose URL I couldn't verify, and HRSC+MOLA isn't used by the baked `gale` region (the 1 m MSL DEM is), so drop it. (3) Asset check: everything in `web/public` is NASA/USGS data, our own synthetic demo data, or default Next.js icons. `img/mars-globe.jpg` is credited as Viking PIA00407: **Moss, confirm that's where you downloaded it from.** `npx tsc --noEmit` not run (no node_modules in this sandbox). The file loads in Node and every entry has an https URL.
- **Steps:**
  1. `web/lib/credits.ts` exporting `CREDITS: { group: 'NASA data' | 'Models & methods' | 'Software' | 'Inspiration'; name: string; what: string; url: string; license?: string }[]`. Chat B's `web/components/map/Credits.tsx` will render it; say so in the Result. Entries: every dataset in `meta.json` `sources`; NASA/JPL MSL waypoints (traverse layer + site positions); NASA DONKI; Curiosity RAD dose rate (Hassler et al. 2014, Science); Pandolf (1977) and Tobler (the EVA model); Mars24 (Allison & McEwen 2000, via NASA GISS); OpenPlanetaryMap basemap; MapLibre GL JS (BSD-3); Next.js; Anthropic Claude (runtime briefing, and Claude Code for development); **Sol Atlas by The SOL Explorers**: routing, EVA model, Mars time and the data pipeline were adapted from it (link the repo).
  2. `docs/AI-USE.md`: the honest disclosure. (a) code written with Claude Code under our direction; (b) at runtime Claude words the mission briefing from numbers the planner computed, a guard rejects any number it invents, and a template is the fallback; (c) no AI-generated images, video or audio in the app. **Check (c)** by listing everything in `web/public` and the images `Intro.tsx` uses; if any asset is not from NASA/USGS/ESA data, tell Moss in the Result.
- **Done when:** both files exist (`cd web && npx tsc --noEmit` passes if you can run it).

## T-26 · Robustness tests on the real terrain
- **Owner:** Teammate · **Time box:** 45 min · **Needs:** T-22 loader · **Status:** DONE (see commit "T-26 done")
- **Result:** `planner/test/gale.test.js` (5 tests on the real terrain, skips cleanly if `web/public/data/gale/` is missing). `cd planner && npm test` → **20/20 pass**. **Found and fixed in `planner/`:** (1) start == end made `budget.avgW` NaN → now 0. (2) **A target on a 30° cliff was rated GO**: `maxSlope` only measured cell-to-cell grade. Now `budget.maxSlope` = the steeper of `gradeMaxSlope` and `fineMaxSlope` (steepest ground inside any cell on the route, from slope.png), so the verdict and the card see real steep ground. (3) Same cause: on real terrain SAFE's cell grade looked steeper than FAST's. With the fix + T-22's SAFE fine-slope penalty, Pahrump SAFE = FAST = 12.3°. New optional fields in `web/lib/plan-client.ts`: `gradeMaxSlope`, `fineMaxSlope`. **For Moss's Claude:** out-of-grid start/end throws `RangeError` with message `cell [x, y] is outside the 473×593 grid` (also for NaN). Catch it in the worker and show "Pick a point inside the Gale map". Start == end is fine: SAFE/FAST return a zero-length GO route, and SCIENCE may plan a short loop to a nearby site (base → Yellowknife Bay → base, 1.7 km).
- **Steps:** `planner/test/gale.test.js` (reads the real data; if `web/public/data/gale/` is missing, skip with a clear message): (1) all 5 POIs × 3 strategies return a path or a clean NO-GO: never throws, never NaN, each `ms` < 2000; (2) start == end returns a sane zero-length route, no crash; (3) a target on a ≥ 30° cliff cell (find one in `fineSlope`) gives a route or a clean NO-GO with a reason; (4) start/end outside the grid throws `RangeError`: tell Moss's Claude the exact message so the UI can show it; (5) on real terrain SAFE's max slope ≤ FAST's for Pahrump Hills, or explain why not (on the synthetic demo it was reversed once). Fix whatever you find in `planner/`.
- **Done when:** `cd planner && npm test` includes these and passes.

## T-17 (final pass, after T-22)
- **Live URL for the README: https://nasa-eva-planner.vercel.app** (public since Fri 21:15; use it instead of `{{LIVE_URL}}`).
- Update the README to the real numbers, remove the "Glen Torridon is a realistic single EVA" claim, add the validation sentence from T-22, and a verified "Run it locally" section: `cd web && npm install && npm run build && npx next start -p 3123`. Leave `{{LIVE_URL}}` for Moss.

## Stretch (only if all of the above is done)
- **A second region, to prove the "generator" claim (C2):** add `data/regions/<id>.json` for one more site using the *global* datasets that exist everywhere (HRSC+MOLA 200 m DEM, Viking colour, THEMIS: the same bucket keys `data/regions/gale.json` uses for its fallback). Suggested: Olympus Mons' south-east flank (a big, dramatic slope field; it was in our original pitch) or Arcadia Planitia (a 2015 NASA Exploration Zone proposal; shallow ice). Pick a box about 20 × 20 km so 200 m cells give ≥ 100×100 cells. Add 3–4 POIs with sources. You can't download, so write the config and the exact command in a new task for Moss's Claude: `python data/build_region.py <id> --dem hrsc`. `?region=<id>` already switches regions in the web app.

## ⏰ DEADLINE: Sunday 15 Nov, 12:00 (EST). We started Fri 13 Nov, 16:45

**Work smart and fast.** If a task runs past its time box, stop, ship the simplest working version, and write what's missing as a new task. A finished simple demo beats an unfinished clever one. **Tier 3 is cut.**

| Milestone | When (EST) | What must work | Tasks |
|---|---|---|---|
| **M0 Skeleton** | Fri 21:00 | Web app live on Vercel with the Mars basemap + demo region. Planner tests pass. Region chosen | T-04, T-05, T-09 |
| **M1 Tier 1 end to end** | Sat 01:00 | Click base + destination → 3 routes on the map + dashboard numbers (demo data is OK). Real region data baked | T-10, T-11 |
| 💤 Sleep | Sat 01:00–08:00 | Seriously. Tired people break working demos | |
| **M2 Smart** | Sat 13:00 | Real region swapped in. AI explanation. Science POIs. Daylight + Earth delay. Live space weather | T-07, T-12, T-13 |
| **M3 Wow** | Sat 19:00 | "Simulate Mission" animation, phone layout, visual polish | T-15, T-16 |
| **M4 FEATURE FREEZE** | **Sat 23:00** | Bugs only after this. Challenge checklist filled. README + credits | T-08, T-17 |
| **M5 Submit** | **Sun 11:00** | Demo video + NASA project page submitted. 11:00–12:00 is buffer only | T-14 |

## 📣 Latest from Moss's Claude (Fri 17:05). Read this first

**What changed since your last pull:**
1. **The web app exists and plans routes.** `web/` = Next.js 16.4 (Turbopack) + MapLibre GL 6. Click a science site (or the map), and your `planMission()` runs in a Web Worker: 3 coloured routes + 3 dashboard cards with GO / CAUTION / NO-GO. Tested in a real browser on demo data.
2. **It imports your planner directly**: `web/workers/plan.worker.ts` imports `../../planner/src/plan.js`. `web/next.config.ts` sets `turbopack.root` to the repo root so that works. **Keep `planner/src/` pure ES modules, no Node imports, and keep the `planMission` return shape**, or the UI breaks. If you change the shape, update `web/lib/plan-client.ts` types in the same commit.
3. **2D by default, 3D toggle** (Moss's decision, logged in DECISIONS). 3D uses MapLibre terrain fed by `elev.i16` through a custom `elev://` protocol (`web/lib/terrain.ts`). So **`elev.i16` drives both routing and 3D**. Get it right and both work.
4. **Demo region** `web/public/data/demo/`: same bounds/grid (472×592, 25 m) and POIs as `gale`, invented terrain, `"synthetic": true` in meta.json (the UI shows a "Demo terrain" banner). Regenerate with `cd web && npm run demo-data`.
5. **Your T-10 output must land in `web/public/data/gale/`** in the exact contract format. The UI switches regions with the env var `NEXT_PUBLIC_REGION=gale` (default `demo`). Tell Moss when the files are pushed and Moss's Claude flips it.
6. **Design references** in `docs/design-references/`: 6 images + 1 video from Moss. **Visual polish comes later. Build first.** Don't restyle anything yet. A summary of the visual direction will be added to `docs/design-references/README.md`.

**New files (Moss's side, don't edit without telling Moss):**
| File | What |
|---|---|
| `web/components/MissionPlanner.tsx` | The whole planner screen: map, markers, routes, 2D/3D, dashboard cards |
| `web/components/PlannerShell.tsx` | Client-only wrapper (MapLibre needs the browser) |
| `web/lib/region.ts` | Loads `meta.json` / `elev.i16` / `slope.png` / `pois.json`; lon/lat ↔ cell helpers |
| `web/lib/plan-client.ts` | Promise wrapper around the planner worker + TypeScript types for your return shape |
| `web/lib/terrain.ts` | `elev://` protocol: DEM tiles for 3D + hillshade, built in the browser |
| `web/workers/plan.worker.ts` | Runs your `planMission` off the main thread |
| `web/scripts/make-demo-region.mjs` | Writes the synthetic demo region |

**Running it:** `cd web && npm install && npm run build && npx next start -p 3123` → http://localhost:3123. (`npm run dev` works but is very slow inside OneDrive.) `prebuild` copies MapLibre's worker into `public/` automatically.

**Unblocking T-10:** the USGS bucket works from **Moss's** machine (checked: all 5 keys answer HTTP 200). If Gianluca can't run `data/run_pipeline.bat` soon, set T-10 to `BLOCKED (sandbox)` and Moss's Claude will run it.

**Your next tasks (Teammate):** finish T-10, then **T-12** (`web/app/api/explain` + `web/app/api/space-weather`). The UI will call them with the contract in ARCHITECTURE.md.

---

## How to work this board (every Claude, every session)

1. `git pull --rebase --autostash`, then read this file top to bottom.
2. Ask your human which person they are (Moss or Teammate) if you don't know yet.
3. Pick the **first** `TODO` task whose Owner is your person (or `Either`). Skip tasks that are `BLOCKED` or `IN PROGRESS` by someone else.
4. **Claim it:** change its status to `IN PROGRESS (Moss|Teammate, HH:MM)`, then commit `claim T-xx` and push **right away**, so the other Claude sees it.
5. Do the steps in order. **Commit and push after every step** (about every 2 minutes of work): `git pull --rebase --autostash && git push`.
6. When the done-check passes, set `DONE (commit hash)`, add one line under **Result**, and push.
7. Found new work? Add a new task at the bottom with an owner, steps, a time box and a done-check. Don't silently do extra work.
8. **Stay inside your folders** to avoid merge conflicts: Teammate owns `planner/`, `data/`, `web/app/api/`. Moss owns the rest of `web/`. Both can edit `docs/`.

---

## Now (Friday evening)

## T-01 · Agree on the two-person split
- **Owner:** Moss + Teammate (humans) · **Time box:** 5 min, do it first
- **Status:** TODO
- **Steps:** read `docs/PLAN.md` → Team, agree or change it, add a "Team split" entry to `docs/DECISIONS.md`.
- **Done when:** DECISIONS has a "Team split" entry.

## T-04 · Pick the Mars region (fast version)
- **Owner:** Teammate · **Time box:** 60 min, **decide by Fri 18:00**
- **Status:** DONE (see commit "T-04 done")
- **Result:** **Gale Crater, Curiosity field site** (`gale`, 137.30–137.50 °E, −4.80 → −4.55 °). Primary DEM = USGS MSL Gale Merged DEM 1 m, colour = MSL HiRISE LRGB mosaic, thermal = THEMIS night IR. 5 science POIs. Everything in `docs/DATASETS.md`. **Moss:** base = Bradbury Landing (137.4417 °E, −4.5895 °). The demo walk is Bradbury → Glen Torridon (~8.7 km).
- **Rules:** not Jezero (that's Sol Atlas's region). The area must hold a walkable EVA zone (~10–30 km) with science targets. Favour a NASA 2015 human **Exploration Zone** (it answers challenge objective O2).
- **Steps:**
  1. Read Sol Atlas's `build_data.py`: the `S3 = ...` bucket and the dataset keys in `stage_global`, `stage_region`, `stage_crater`.
  2. **Safe default that works anywhere:** the global **HRSC + MOLA blended DEM (200 m/px)** used in `stage_region`, plus Viking colour and THEMIS night IR. 200 m cells are plenty for 10–30 km EVA routes. If nothing better turns up in 45 min, use this.
  3. Spend at most 30 min checking whether a sharper DEM (CTX ~20 m) exists in the same bucket for: **Gale Crater** (Curiosity, lots of science), **Mawrth Vallis**, or **Arcadia Planitia** (shallow water ice, a human-landing favourite).
  4. Write `docs/DATASETS.md`: chosen region, lon/lat bounds, each dataset (name, mission, resolution, URL), and 4–6 science POIs with lon/lat + one line on why each matters + source.
  5. Log the region in `docs/DECISIONS.md` and tell Moss.
- **Done when:** `docs/DATASETS.md` exists and DECISIONS has a "Region" entry.

## T-05 · Planner module with SAFE / FAST / SCIENCE
- **Owner:** Teammate · **Time box:** Fri 21:00 (M0)
- **Status:** DONE (see commit "T-05 done")
- **Result:** `planner/` works. `cd planner && npm test` → **10/10 pass** (Node 22, no dependencies). On the synthetic 4 km grid (round trip): SAFE 7.26 km, 134 min, max slope 0.9°, 72 % O₂ left, GO · FAST 7.03 km, 131 min, max slope 4.3°, 70 %, GO · SCIENCE 8.39 km, 175 min (incl. a 20 min stop), 65 %, GO. 512×512 grid: all three routes in ~0.5 s. **Moss:** the API is in ARCHITECTURE.md → Planner API. Routes are scored as **out-and-back by default** (`roundTrip: true`), so "O₂ left" means at the airlock. Import `planner/src/plan.js` straight into the worker.
- **Steps:**
  1. Read `docs/ARCHITECTURE.md` → "Planner API".
  2. Create `planner/package.json` (`"type": "module"`, `"test": "node --test"`). Copy Sol Atlas's `eva.js` → `planner/src/eva.js` and `pathfinding.js` → `planner/src/route.js`. Add a header comment to each: "Adapted from Sol Atlas by The SOL Explorers. Changes: …".
  3. Add the `strategy` + `pois` args to `find()` (FAST = time, SAFE = slope-penalized with a 15° limit, SCIENCE = cheaper near POIs or start→POI→end legs).
  4. Create `planner/src/plan.js` exporting `planMission(...)` per the Planner API in ARCHITECTURE.md. It must return all three routes, each with `budget()` + `verdict()`.
  5. Write `planner/test/plan.test.js` on a synthetic grid (plane + hill + one POI): SAFE max slope ≤ FAST's; FAST time ≤ SAFE's and SCIENCE's; SCIENCE passes closer to the POI than FAST.
  6. Make sure it runs in a browser Web Worker: no Node-only imports in `planner/src/`.
- **Done when:** `cd planner && npm test` passes. Paste the output under Result.

## T-09 · Web app skeleton, live on Vercel
- **Owner:** Moss's Claude · **Time box:** Fri 20:00
- **Status:** DONE (Moss's Claude, Fri 21:15). **Live and public: https://nasa-eva-planner.vercel.app** (see DECISIONS for the deploy recipe). Not auto-deployed from GitHub: ask Moss's Claude for a redeploy.
- **Steps:**
  1. `npx create-next-app@latest web --ts --tailwind --app --eslint --src-dir=false --import-alias "@/*" --use-npm`, then `cd web && npm i maplibre-gl`.
  2. Full-screen MapLibre map with the OpenPlanetaryMap Mars basemap (URL in `docs/ARCHITECTURE.md`), dark mission-control UI shell: left panel (mission setup), right panel (dashboard), top bar (title + Mars clock placeholder).
  3. Write `web/scripts/make-demo-region.mjs`, which writes a synthetic region in the data-contract format to `web/public/data/demo/` (512×512, 60 m cells, hills + a crater + 4 fake POIs labelled "DEMO"). Load it and draw its `visible.jpg` as a MapLibre image overlay.
  4. Deploy on Vercel (root directory `web/`). Put the live URL at the top of `README.md`.
- **Done when:** the Vercel URL shows the Mars basemap with the demo region overlay, on desktop and phone.

---

## Tonight (M1, Sat 01:00)

## T-10 · Bake the real region data
- **Owner:** Teammate · **Time box:** Sat 01:00 · **Needs:** T-04
- **Status:** DONE (Moss's Claude, Fri 19:40). **Result:** ran `PYTHONUTF8=1 python data/build_region.py gale` on Moss's PC (needed `PYTHONUTF8=1`: Windows' default encoding can't print the → in the log; `run_pipeline.bat` already sets UTF-8). The 1 m DEM read took **591 s** (no overviews), everything else 10 s. Output `web/public/data/gale/` = 473×593 cells of 25 m, elevation −4529…−2725 m, max slope 66°, **HiRISE colour covers 74 %** (Viking fills the rest, visible as blurrier side strips), 5 POIs, 1.43 MB, `check: … OK`. **The app now defaults to `gale`** (`web/lib/region.ts`; `?region=demo` still loads the synthetic terrain). **Open issue: POI positions are approximate** (±0.5 km by Teammate's note, but Yellowknife Bay looks ~2 km too far south vs. NASA's traverse): see T-21.
- **Follow-up (Teammate's Claude, Fri 19:50):** `data/build_region.py` now forces UTF-8 for console and files, so **`PYTHONUTF8=1` is no longer needed** on Windows. Checked: `--check` on the baked data → OK (473×593, 1.43 MB, −4529…−2725 m, 1 m DEM, HiRISE 74 %). Planner on the real terrain, Bradbury → Yellowknife GO · → Pahrump GO (SCIENCE CAUTION) · → Glen Torridon NO-GO. Demo pairs in `docs/DATASETS.md`.
- **Run it (Teammate, ~10–20 min):** from the repo root: `pip install rasterio numpy pillow scipy` then `python data/build_region.py gale`. It prints progress and ends with `check: … OK`. If the 1 m DEM read crawls (it warns when the file has no overviews), Ctrl-C and run `python data/build_region.py gale --dem hrsc` (200 m fallback, log it in DECISIONS). Then `git add web/public/data/gale && git commit -m "T-10: bake gale region" && git pull --rebase --autostash && git push`.
- **Built (Teammate's Claude, 17:55):** `data/build_region.py` + `data/regions/gale.json` (bounds, dataset keys, POIs, base). Output = exactly the data contract, 473×593 cells of 25 m. `slope.png` is the **max slope inside each cell** from a 2× finer DEM, so the web app can pass it to `planMission` as `fineSlope` (decode: value / 4 = degrees). HiRISE colour with Viking filling the gaps. Tested with `--synthetic` (no network): export + `--check` pass, 3.2 MB in total, and `planMission` on the output plans all three routes in 30–60 ms each.
- **Bucket check (Moss's Claude, Fri 17:10):** all 5 keys in `docs/DATASETS.md` answer HTTP 200 from Moss's machine (1 m DEM 3.9 GB, HiRISE COG 1.0 GB, HRSC+MOLA 11.4 GB, Viking 0.65 GB, THEMIS 4.4 GB). Teammate's Claude sandbox gets 403, so **run the pipeline on a real laptop** (Teammate's local terminal), not in a sandbox. If that's impossible, set this task to `BLOCKED (sandbox)` and Moss's Claude will run it.
- **Steps:**
  1. Copy Sol Atlas's `build_data.py` → `data/build_region.py` (credit header). Keep only the stages you need. Set the bounds, dataset keys and grid size from `docs/DATASETS.md`, and read its "Pipeline notes for T-10" first (the 1 m DEM is in projected metres and needs `reproject`, not a lon/lat window). Start by opening each key with `rasterio.open` to confirm it exists.
  2. Add an export step that writes **exactly** the data contract in `docs/ARCHITECTURE.md`: `meta.json`, `elev.i16`, `slope.png`, `visible.jpg`, `thermal.jpg`, `pois.json` → `web/public/data/<region-id>/`.
  3. `pip install rasterio numpy pillow scipy`, run it, and check that the files load (dimensions match `meta.json`, elevations plausible).
  4. Keep the total under 15 MB (resize images to ≤ 2048 px). Commit the outputs (not the download cache: add `data-cache/` to `.gitignore`).
- **Done when:** `web/public/data/<region-id>/` has all 6 files and `meta.json` lists every source with its URL.

## T-11 · Plan a mission in the UI (Tier 1 core)
- **Owner:** Moss's Claude · **Time box:** Sat 01:00 · **Needs:** T-09, and T-05 for real routes (stub `planMission` with straight lines until it lands)
- **Status:** DONE (Moss's Claude, Fri 20:35). Real Gale terrain is the default; two clicks plan three routes in < 1 s; the planner runs in a Web Worker; daylight, briefing, radiation and space weather are on the cards.
- **Steps:**
  1. `web/lib/region.ts`: load `meta.json` + `elev.i16` → `Float32Array`, plus lon/lat ↔ grid-cell helpers.
  2. `web/workers/plan.worker.ts`: imports `planner/src/plan.js` and runs `planMission` off the main thread.
  3. Click 1 = base, click 2 = destination (plus inputs in the left panel). Show POIs as markers.
  4. Draw the 3 routes as MapLibre lines: SAFE green, FAST amber, SCIENCE violet. Clicking a route card highlights its line.
  5. Right-panel dashboard, one card per route: distance, EVA time, O₂ left at return (%), max slope, GO / CAUTION / NO-GO with the verdict issues.
- **Done when:** on the live URL, two clicks produce 3 coloured routes + 3 dashboard cards in under 2 s.

---

## Saturday

## T-07 · Pick the one "wow" upgrade (30 min max)
- **Owner:** Moss's Claude, with Moss · **When:** Sat 08:00
- **Status:** TODO
- **Steps:** skim `docs/OPEN-QUESTIONS.md` → Brainstorm agenda and `docs/CHALLENGE.md` → "Known gaps". Pick at most **one** extra feature that fits in 3 hours (candidates: two-person EVA, a "plan any region" generator, a CRISM minerals layer, boulder/rock hazard). Log it in DECISIONS and add it as a task.
- **Done when:** DECISIONS has a "Wow feature" entry, or "none".

## T-12 · AI explanation + live space weather APIs
- **Owner:** Teammate · **Time box:** Sat 13:00
- **Status:** DONE (aabf276, verified by Moss's Claude 17:20)
- **Result so far (Teammate's Claude, 17:30):** `web/app/api/explain/route.ts`, `web/app/api/space-weather/route.ts`, logic in `web/lib/explain.ts` + `web/lib/space-weather.ts` (DONKI port credited), `web/lib/explain-fallback.ts`. Contracts are in ARCHITECTURE.md. Tests with mocked network: `cd web && node --test app/api/_tests/api.test.mjs` → **9/9 pass** (no key → fallback, invented number → fallback, timeout, DONKI CME window + cache + "not checked"). **Not checked yet:** `next build` (no node_modules in the Teammate sandbox) and the live endpoints (sandbox has no internet).
- **Checked by Moss's Claude (Fri 17:20):** `npm run build` ✅ (both routes compile as dynamic `ƒ`). `node --test app/api/_tests/api.test.mjs` → 9/9 ✅. Live `GET /api/space-weather` → `ok:true`, real DONKI data: **CME forecast to have reached Mars 13 Nov 12:00 UTC, 726 km/s, glancing**, status `warn` (great for the demo). `POST /api/explain` → `recommended: SCIENCE`, `source: fallback` (no key yet), template text correct. **Remaining: keys only Moss can add** (see T-19).
- **Left, for Moss's Claude (5 min, has node_modules + internet):** (1) `cd web && npm run build`. If a route file fails to compile, fix it or tell Teammate. (2) `npx next start -p 3123`, then `curl -s localhost:3123/api/space-weather | head -c 400` (expect `"ok":true`) and `curl -s -X POST localhost:3123/api/explain -H 'content-type: application/json' -d '{"region":"gale","routes":[{"strategy":"SAFE","distanceKm":4.9,"durationMin":91,"o2MarginPct":71,"maxSlopeDeg":6.2,"verdict":"go"},{"strategy":"FAST","distanceKm":4.7,"durationMin":84,"o2MarginPct":72,"maxSlopeDeg":13.4,"verdict":"caution"},{"strategy":"SCIENCE","distanceKm":4.9,"durationMin":111,"o2MarginPct":66,"maxSlopeDeg":6.2,"verdict":"go","poisVisited":["Yellowknife Bay"]}]}'` (expect `"recommended":"SCIENCE"` with `"source":"fallback"` until a key is set). (3) Add `ANTHROPIC_API_KEY` and `NASA_API_KEY` (free at api.nasa.gov) in Vercel → Settings → Environment Variables. Paste the curl output here.
- **Steps:**
  1. `web/app/api/explain/route.ts` per "AI explanation contract" in ARCHITECTURE.md. Claude API, key from `ANTHROPIC_API_KEY` (add it to Vercel env vars). The system prompt forbids numbers that weren't given. 10 s timeout.
  2. Export `fallbackExplanation(routes)` from `web/lib/explain-fallback.ts` (a template sentence from the same numbers) for when the API fails.
  3. `web/app/api/space-weather/route.ts`: port Sol Atlas's `spaceweather.js` + their DONKI function to a route handler with `NASA_API_KEY`, 30-min cache.
  4. Test both with `curl` against the Vercel preview and paste the output under Result.
- **Done when:** both endpoints answer on the live URL, and explain returns a fallback (not an error) when the key is missing.

## T-13 · Mission context: daylight, Earth delay, AI panel
- **Owner:** Moss's Claude · **Time box:** Sat 13:00 · **Needs:** T-11, T-12
- **Status:** DONE (Moss's Claude, Fri 19:35). **Result:** top bar = live Curiosity sol, local solar time, season, Earth-signal delay (11.0 min) and the NASA DONKI space-weather badge (today: CME, amber). Left panel = EVA start slider + 24 h daylight strip with each route's window. Every route card shows `Back HH:MM · Xh before sunset`; the planner's own `verdict()` is re-run per route with its daylight margin (a route that ends after sunset turns NO-GO). Bottom-centre **Mission briefing** calls `/api/explain` (typing reveal; falls back to the template if the API is offline) and auto-selects the recommended route. Files: `web/lib/marstime.js` (vendored copy), `web/lib/mars-context.ts`, `web/components/{MarsClockBar,DaylightBar,Briefing}.tsx`. Also fixed: scale bar + 3D height were Earth-sized (see `web/lib/mars-scale.ts`), and a black strip below the region in 2D (hillshade now has its own un-faded feed).
- **Steps:**
  1. Copy Sol Atlas's `marstime.js` → `web/lib/marstime.js` (credit header). Top bar: sol, local solar time at the region, season, Earth–Mars signal delay.
  2. Add a start-time picker, then compute sunrise/sunset at the region. Add "ends X h before sunset" to each route card, and NO-GO if the walk ends after dark (pass `sun` into `verdict()`).
  3. "Mission briefing" panel: calls `/api/explain` with the computed numbers, typing-style reveal, recommended route highlighted.
  4. Space-weather badge from `/api/space-weather`.
- **Done when:** picking routes shows a briefing that quotes only the dashboard numbers.

## T-15 · "Simulate Mission" animation
- **Owner:** Moss's Claude · **Time box:** Sat 19:00
- **Status:** DONE (Moss's Claude, Fri 20:35). **Result:** the ▶ on the dock card plays the selected route end to end: astronaut marker + white trail on the map, camera follows, HUD top-centre (mission clock, local solar time, distance, **O₂ gauge with the 25 % reserve line**, phase), a science-stop card with the site's "why it matters" + source (held 3.5 s so it can be read), speed 1×/2×/4×, scrubber, Replay and a completion summary. Verified on the real Gale terrain: Bradbury → Pahrump SCIENCE = 4h01, 46 % O₂, 0.11 mSv, identical to the route card. Code: `web/components/Simulation.tsx` (hook `useSimulation`), `SimulationHUD.tsx`, `web/lib/mission-timeline.ts` (+ `node web/scripts/test-mission-timeline.mjs`), `web/lib/rover-marker.ts`. Chat B: restyle `SimulationHUD.tsx` freely; keep `{simulation.panel}` and `onSimulate` wired in `MissionPlanner.tsx`.
- **Steps:** an astronaut marker moves along the chosen route (time-compressed, ~20 s for the whole EVA), with a live HUD of elapsed time, O₂ remaining gauge (from `budget().timeline`) and distance. Pause at POIs with their "why it matters" card. The camera follows smoothly.
- **Done when:** one button plays the whole EVA end to end without stutter on a phone.

## T-16 · Desktop polish pass (phone = just not broken)
- **Owner:** Moss's Claude · **Time box:** Sat 19:00
- **Status:** IN PROGRESS (Moss, UI chat B, Fri ~18:00): a second Moss chat is doing the visual pass from `docs/design-references/README.md` in a separate worktree (`/c/tmp/nasa-ui`, branch `ui-polish`, pushes to main). **Split to avoid conflicts:** the other chat (T-13/T-20/T-15) keeps ownership of the *logic* in `MissionPlanner.tsx`; chat B adds NEW files (`web/components/ui/*`, landing intro, site-picker pills, dot-matrix stat, credits panel) + `globals.css`, and only makes small wiring edits in `MissionPlanner.tsx` AFTER the other chat has committed its T-13/T-20 changes. If you need to change something in my files, leave a note here.
- **Moss: the reference images are to be followed practically 1:1** (Fri 19:40). Mapping: pill-gallery video → science-site picker (DONE, bee9eee: `Intro.tsx`, shows before the map; `?nointro` skips it) · Flight-to-Mars → landing hero · eclipse globe + docked black card → map screen layout · gradient dashboard cards with dot numerals → route cards · Spherium gold-outline panel → mission setup panel · planet-horizon "Good evening" → loading screen.
- **Heads-up to the other Moss chat (Fri 19:45):** for the next ~60–90 min chat B rewrites the **render part** of `MissionPlanner.tsx` (everything under `return (`, plus `RouteCard`/`Stat`/`Row`) into new components `web/components/map/*`. State, effects and data logic above `return` stay yours and untouched. Please pick work outside that JSX meanwhile (T-10 data bake, T-09 deploy). If you start **T-15 Simulate**, build it as `web/components/Simulation.tsx` and wire it with 1–2 lines, so the merge stays trivial.
- **DONE, JSX handed back (Fri 20:10, a076649 + 1e95b2c).** The map screen is now: `map/TopNav.tsx` (dashboard ref), `map/SetupPanel.tsx` (Spherium ref: sites, base, strategy, EVA-start slider + daylight strip, layers, 2D/3D, Conditions tab = Mars clock + space weather), `map/RouteCards.tsx` (dashboard gradient cards, dot numerals, O₂ dot grid), `map/DockCard.tsx` (eclipse ref: Route/Briefing tabs, Safe/Fast/Science chips, black card; **`<Briefing>` lives inside it**), `map/Credits.tsx` (Data & credits, white-card ref), shared `map/format.ts` (`ROUTE_STYLE` moved here, re-exported from MissionPlanner) + `map/icons.tsx`. Styles: `app/ui.css` + `app/map-ui.css`. `MarsClockBar.tsx` / `DaylightBar.tsx` are no longer rendered (their content moved into the panel); kept, not deleted.
- **T-15 wiring (other chat):** the ▶ button on the docked card is ready. Pass `onSimulate={() => …}` to `<DockCard>` in `MissionPlanner.tsx`; without it the button shows disabled ("coming soon"). Put the HUD anywhere except bottom-centre (dock) and the right 300 px (route cards); top-centre under the nav is free.
- **Next for chat B:** Flight-to-Mars landing hero before the site gallery, planet-horizon loading screen, then a phone pass.
- **Coherence pass (Fri ~20:10, Moss: "looks random, make it work"; checked click by click in Playwright):** flow is now **Loading (stays until the NASA data has loaded) → Landing = target picker (`Hero.tsx`: the left column picks a site, the big planet turns into that site's HiRISE terrain, "Plan this EVA") → Map**. The separate pill gallery (`Intro.tsx`, `app/ui.css`) is **deleted**. Map: route choice only in the route cards, 2D/3D only in the top bar, dock = briefing + Simulate/frame/slope (`DockCard` props changed, hides while a simulation runs). One style: dark surfaces, **gold = selected, white = primary button**. Basemap outside the NASA region darkened (paint in `MissionPlanner.tsx`). Credits popup renders `web/lib/credits.ts`. `?nointro` still skips loading's landing step.
- **Steps:** **Desktop first** (1440×900 and 1920×1080): loading states, empty states, a "Data & credits" panel (every NASA source + the Sol Atlas credit). Phone (390×844) is secondary: just make sure nothing overlaps or breaks.
- **Done when:** the demo flow looks polished at 1440×900, and on a phone nothing is broken.

## T-08 · Fill in the challenge checklist
- **Owner:** Teammate's Claude (reassigned Fri 20:15: see the new T-08 block at the top)
- **Status:** DONE (superseded by the new T-08 block at the top, done Fri 20:55: see docs/CHALLENGE.md)
- **Steps:** in `docs/CHALLENGE.md`, write one line per row O1–O8 / C1–C6 naming the feature and the NASA dataset behind it. Empty rows become quick tasks or an explicit "skip" with a reason.
- **Teammate's Claude draft answers (Fri 17:55), paste into CHALLENGE.md and edit freely:**
  - O1: web planner (tablet/laptop in the hab): pick base + target → 3 EVA routes scored on O₂, time, slope, radiation; NASA/USGS data throughout.
  - O2: Gale Crater, proposed as a human Exploration Zone at NASA's 2015 workshop (abstracts #1022, #1040); base at Bradbury Landing (proven safe landing).
  - O3: science first. Targets = Curiosity's ground-truthed habitability sites (lake mudstone, clays + organics, hematite), and the SCIENCE route is built to reach them.
  - O4: the best-studied site on Mars (Curiosity, 2012–today).
  - O5: topographic (MSL 1 m DEM), optical (HiRISE colour, Viking), thermal (THEMIS night IR), radiation (Curiosity RAD dose rate), space weather (DONKI). That's 5 kinds.
  - O6: radiation dose per EVA from RAD's Gale measurement + live DONKI CME forecasts that turn routes to CAUTION (T-20).
  - O7: suit model: Pandolf metabolic cost at Mars g with a pressure-suit penalty, 20° walking limit, 8 h suit rating, O₂ reserve; carried kit via `params.kitKg`.
  - O8: SAFE avoids steep ground (quadratic penalty > 10°, limit 15°) using the steepest slope inside each 25 m cell from the finer DEM. Individual boulders are below 25 m: say so (honest limit), or add the rock-hazard layer if T-07 picks it.
  - C2: generator: a new region = one JSON file in `data/regions/` + `python data/build_region.py <id>`. The planner works on any grid.
  - C4: live, for today's date (space weather), planning "now".
- **Done when:** no empty "How we answer it" cells remain.

## T-17 · README for judges
- **Owner:** Teammate · **When:** Sat 19:00–23:00
- **Status:** IN PROGRESS (Teammate): **root `README.md` written with the real numbers (Fri 21:05)**: pitch, validation sentence + table, real-data plan table (Pahrump GO, Glen Torridon NO-GO on foot / GO by rover), how it works, NASA data, honest limits, credits, AI use, team, a run-it-locally section (planner/validation commands checked here; the web build was checked by Moss's Claude in T-12). **Left for Moss:** fill `{{LIVE_URL}}` and `{{VIDEO_URL}}`, and add 3 screenshots where the HTML comment says. Then this is DONE.
- **Steps:** rewrite the root `README.md`: live URL, one-paragraph pitch, 3 screenshots, how it works (data → planner → AI), NASA data sources table, credits (Sol Atlas, OpenPlanetaryMap), AI-use disclosure, team.
- **Done when:** a stranger can understand the project in 60 seconds from the README.

---

## Sunday

## T-14 · Submit
- **Owner:** Both · **When:** Sun 08:00–11:00 · **Hard stop:** submitted by 11:00
- **Status:** TODO
- **Steps:**
  1. Re-read the official Space Apps submission requirements (project page fields, video length, links) and list them here.
  2. Record the demo: the planned flow (choose base → 3 routes → briefing → Simulate Mission), from the live URL.
  3. Fill in the NASA project page: title, summary, demo link, repo link, NASA data used, AI disclosure.
  4. Submit. Paste the confirmation link under Result.
- **Done when:** the project page is submitted.

---

## Done

## T-02 · .gitignore + untrack build junk
- **Status:** DONE (Moss's Claude, Fri 16:50)
- **Result:** `.gitignore` added at the repo root. `.idea` untracked.

## T-03 · Vendored Sol Atlas routing runs
- **Status:** DONE (commit 13a57b4)
- **Result:** route detours around a 400 m hill (highest point 8 m), 4.30 km, ~30 ms on a 200×200 grid. EVA 80 min, O₂ margin 83 %, GO. Mars clock + sun maths work.

## T-06 · Stack + architecture
- **Status:** DONE (commit 5ab98c8)
- **Result:** `docs/ARCHITECTURE.md`: Next.js + MapLibre + OpenPlanetaryMap basemap + planner in a Web Worker + Claude API explanations + Vercel. Includes the data contract both sides build against.

## T-18 · SCIENCE route makes a silly detour when no site is near the path
- **Owner:** Teammate · **Time box:** 20 min · **Priority:** before M1 (it shows in the demo)
- **Status:** DONE (see commit "T-18 done")
- **Result:** Fallback removed. A POI within 2 cells of the destination now counts as SCIENCE's stop (20 min of work budgeted there) and is never also used as an on-the-way stop. With no science in reach, SCIENCE = SAFE path + `note: 'No science site within reach of this route'` (added to `PlannedRoute` in `web/lib/plan-client.ts`; **Moss: show `note` on the SCIENCE card**). Demo region Bradbury → Yellowknife Bay: SAFE/FAST 4.9 km, 91 min, GO · **SCIENCE 4.9 km, 111 min, GO, stops at Yellowknife** (was 24.6 km NO-GO). `npm test` 12/12 pass.
- **Seen by Moss's Claude, Fri 17:05 (demo region):** base Bradbury → target Yellowknife Bay. SAFE/FAST = 4.9 km, GO. SCIENCE = 24.6 km, 8h07m, **NO-GO**, because it detoured to Pahrump Hills. Cause: `pickScienceStops()` falls back to "visit the cheapest POI even if it's over the detour limit".
- **Steps:**
  1. In `planner/src/plan.js` → `pickScienceStops`, only use the fallback POI if the resulting EVA would still be feasible. Simplest version: drop the fallback, and if no POI fits the detour limit, SCIENCE = the SAFE route with `poisVisited: []` plus a flag `note: 'No science site within reach of this route'`.
  2. Also skip a POI if it **is** the target (already handled for exact cells; make it "within 2 cells" so clicking a POI marker counts).
  3. Add a test for the case above. Run `cd planner && npm test`.
  4. If you add `note`, Moss's Claude will show it on the SCIENCE card (add it to `PlannedRoute` in `web/lib/plan-client.ts` in the same commit).
- **Done when:** the Bradbury → Yellowknife Bay SCIENCE route is GO, or shows the note instead of a NO-GO detour.

## T-19 · Add the API keys to Vercel (Moss, 5 min)
- **Owner:** Moss (human: needs your accounts)
- **Status:** TODO
- **Steps:**
  1. **Claude key:** https://console.anthropic.com → API Keys → Create key. Copy it.
  2. **NASA key (free, instant):** https://api.nasa.gov → fill in name + email → the key arrives on screen and by email. (Without it the app uses `DEMO_KEY`, which is rate-limited but works.)
  3. https://vercel.com/cutsandedges21s-projects/nasa-eva-planner/settings/environment-variables → add `ANTHROPIC_API_KEY` and `NASA_API_KEY` for **Production + Preview**. Or paste both keys to Moss's Claude and it runs `vercel env add`.
  4. Redeploy (Moss's Claude does it).
- **Done when:** `curl -X POST <live-url>/api/explain …` returns `"source":"claude"`.

## T-20 · Show radiation, terrain risk and space-weather caution on the route cards
- **Owner:** Moss's Claude · **Time box:** 20 min · **When:** with T-13 (Sat 13:00)
- **Status:** DONE (Moss's Claude, Fri 19:35). **Result:** each route card shows Radiation (mSv, tooltip cites Curiosity RAD) and Steep ground (%, tooltip). The planner gets `spaceWeather` (today's CME → every route CAUTION with the reason in its issues; the daylight re-check keeps that caution). `/api/explain` body now includes `doseMSv` + `steepPct`.
- **Why:** answers challenge O6 (radiation + space weather) and the PLAN's "risk" dashboard number, with data we already compute.
- **Steps:**
  1. Planner now returns `budget.doseMSv` and `budget.steepPct` (types already in `web/lib/plan-client.ts`). On each route card add two stats: **Radiation** `${doseMSv.toFixed(2)} mSv` (tooltip: "Curiosity RAD measured 0.64 mSv/day at Gale's surface (Hassler et al. 2014)") and **Steep ground** `${steepPct.toFixed(0)} %` (tooltip: "share of the route steeper than 15°").
  2. Pass the space-weather status into planning: `plan({ ..., spaceWeather: sw.status })`. With `lvl: 'warn'` every route gets a CAUTION issue quoting `status.short` (e.g. today's CME).
  3. In the `/api/explain` body add `doseMSv` and `steepPct` to each route (optional fields, already accepted and number-checked).
- **Done when:** a card shows Radiation + Steep ground, and with today's CME warning the verdict reads CAUTION with the CME reason.
