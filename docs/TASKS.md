# Task Board (live)

**This is the live to-do list for both people and both Claudes.** Pull often. It changes every few minutes.

People: **Moss** (product, frontend, UI/UX) and **Teammate** (data, routing, backend, AI pipeline). The split is still a proposal: see T-01.

Status values: `TODO` · `IN PROGRESS (who, time)` · `BLOCKED (on what)` · `DONE (commit)`

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
- **Status:** IN PROGRESS (Moss): app built + tested locally; **only the Vercel deploy is left**
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
- **Status:** BLOCKED (Teammate's PC): **handed to Moss's Claude, Fri 17:45.** `run_pipeline.bat` keeps failing on Gianluca's Windows PC (no Python, winget install path), so per the note above, Moss's Claude runs it. **Moss's Claude:** from the repo root, `pip install rasterio numpy pillow scipy && python data/build_region.py gale` (falls back with `--dem hrsc` if the 1 m read crawls). It must end with `check: … OK`. Then commit `web/public/data/gale`, push, flip `NEXT_PUBLIC_REGION=gale`, and set this task DONE. If the build fails, paste the error under this task and Teammate's Claude fixes `data/build_region.py` right away (it watches the repo every 2 min).
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
- **Status:** IN PROGRESS (Moss): steps 1–5 work on demo data (3 routes + cards, real planner in a worker). Left: swap to the real `gale` region once T-10 lands
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
- **Status:** IN PROGRESS (Moss, 17:22)
- **Steps:**
  1. Copy Sol Atlas's `marstime.js` → `web/lib/marstime.js` (credit header). Top bar: sol, local solar time at the region, season, Earth–Mars signal delay.
  2. Add a start-time picker, then compute sunrise/sunset at the region. Add "ends X h before sunset" to each route card, and NO-GO if the walk ends after dark (pass `sun` into `verdict()`).
  3. "Mission briefing" panel: calls `/api/explain` with the computed numbers, typing-style reveal, recommended route highlighted.
  4. Space-weather badge from `/api/space-weather`.
- **Done when:** picking routes shows a briefing that quotes only the dashboard numbers.

## T-15 · "Simulate Mission" animation
- **Owner:** Moss's Claude · **Time box:** Sat 19:00
- **Status:** TODO
- **Steps:** an astronaut marker moves along the chosen route (time-compressed, ~20 s for the whole EVA), with a live HUD of elapsed time, O₂ remaining gauge (from `budget().timeline`) and distance. Pause at POIs with their "why it matters" card. The camera follows smoothly.
- **Done when:** one button plays the whole EVA end to end without stutter on a phone.

## T-16 · Desktop polish pass (phone = just not broken)
- **Owner:** Moss's Claude · **Time box:** Sat 19:00
- **Status:** IN PROGRESS (Moss, UI chat B, Fri ~18:00): a second Moss chat is doing the visual pass from `docs/design-references/README.md` in a separate worktree (`/c/tmp/nasa-ui`, branch `ui-polish`, pushes to main). **Split to avoid conflicts:** the other chat (T-13/T-20/T-15) keeps ownership of the *logic* in `MissionPlanner.tsx`; chat B adds NEW files (`web/components/ui/*`, landing intro, site-picker pills, dot-matrix stat, credits panel) + `globals.css`, and only makes small wiring edits in `MissionPlanner.tsx` AFTER the other chat has committed its T-13/T-20 changes. If you need to change something in my files, leave a note here.
- **Steps:** **Desktop first** (1440×900 and 1920×1080): loading states, empty states, a "Data & credits" panel (every NASA source + the Sol Atlas credit). Phone (390×844) is secondary: just make sure nothing overlaps or breaks.
- **Done when:** the demo flow looks polished at 1440×900, and on a phone nothing is broken.

## T-08 · Fill in the challenge checklist
- **Owner:** Moss's Claude, with Moss · **When:** Sat 19:00–21:00
- **Status:** TODO
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
- **Status:** IN PROGRESS (Teammate, 17:35): **draft written in `docs/README-draft.md`** (pitch, why Gale, how it works, NASA data table, honest limits, credits, AI use, team). Left for Sat 19:00: live URL, demo video link, 3 screenshots, confirm which DEM was baked, then move it to `README.md` at the root
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
- **Status:** TODO
- **Why:** answers challenge O6 (radiation + space weather) and the PLAN's "risk" dashboard number, with data we already compute.
- **Steps:**
  1. Planner now returns `budget.doseMSv` and `budget.steepPct` (types already in `web/lib/plan-client.ts`). On each route card add two stats: **Radiation** `${doseMSv.toFixed(2)} mSv` (tooltip: "Curiosity RAD measured 0.64 mSv/day at Gale's surface (Hassler et al. 2014)") and **Steep ground** `${steepPct.toFixed(0)} %` (tooltip: "share of the route steeper than 15°").
  2. Pass the space-weather status into planning: `plan({ ..., spaceWeather: sw.status })`. With `lvl: 'warn'` every route gets a CAUTION issue quoting `status.short` (e.g. today's CME).
  3. In the `/api/explain` body add `doseMSv` and `steepPct` to each route (optional fields, already accepted and number-checked).
- **Done when:** a card shows Radiation + Steep ground, and with today's CME warning the verdict reads CAUTION with the CME reason.
