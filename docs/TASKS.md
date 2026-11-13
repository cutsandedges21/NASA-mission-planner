# Task Board (live)

**This is the live to-do list for both people and both Claudes.** Pull often. It changes every few minutes.

People: **Moss** (product, frontend, UI/UX) and **Teammate** (data, routing, backend, AI pipeline). The split is still a proposal: see T-01.

Status values: `TODO` · `IN PROGRESS (who, time)` · `BLOCKED (on what)` · `DONE (commit)`

## How to work this board (every Claude, every session)

1. `git pull --rebase`, then read this file top to bottom.
2. Ask your human which person they are (Moss or Teammate) if you don't know yet.
3. Pick the **first** `TODO` task whose Owner is your person (or `Either`). Skip tasks that are `BLOCKED` or `IN PROGRESS` by someone else.
4. **Claim it:** change its status to `IN PROGRESS (Moss|Teammate, HH:MM)`, then commit `claim T-xx` and push **right away**, so the other Claude sees it.
5. Do the steps in order. **Commit and push after every step** (about every 2 minutes of work): `git pull --rebase && git push`.
6. When the done-check passes, set `DONE (commit hash)`, add one line under **Result**, and push.
7. Found new work? Add a new task at the bottom with an owner, steps and a done-check. Don't silently do extra work.

---

## T-01 · Agree on the two-person split
- **Owner:** Moss + Teammate (humans, not Claude)
- **Status:** TODO
- **Steps:**
  1. Read `docs/PLAN.md` → Team (the proposed split).
  2. Agree on it or change it.
  3. Add an entry to `docs/DECISIONS.md` with the final split. Update the Owner fields on this board if anything moved.
- **Done when:** `docs/DECISIONS.md` has a "Team split" entry.

## T-02 · Add a .gitignore and untrack build junk
- **Owner:** Either (quick, good first task)
- **Status:** TODO
- **Steps:**
  1. Create `.gitignore` at the repo root containing: `node_modules/`, `.next/`, `dist/`, `out/`, `.env*`, `!.env.example`, `__pycache__/`, `*.pyc`, `.venv/`, `target/`, `.idea/`, `.vercel/`, `.DS_Store`, `data-cache/`.
  2. `git rm -r --cached .idea`
  3. Commit `Add .gitignore, untrack build output` and push.
- **Done when:** `git ls-files | grep -E "target/|\.idea/"` prints nothing.

## T-03 · Check the vendored Sol Atlas routing runs
- **Owner:** Moss's Claude
- **Status:** IN PROGRESS (Moss, now)
- **Steps:** write `smoke-test.mjs` (synthetic hill, route around it, O₂ budget) and run it with `node`.
- **Done when:** `node smoke-test.mjs` prints `OK`.

## T-04 · Pick the Mars region + NASA datasets
- **Owner:** Teammate
- **Status:** TODO
- **Why it matters:** Sol Atlas (a competitor in the same challenge) uses **Jezero**. We should pick a different region so we don't look like a copy, and it needs a good elevation model (DEM) we can download this weekend.
- **Steps:**
  1. Read Sol Atlas's `build_data.py`, especially the `S3 = ...` bucket and the dataset keys in each `stage_*` function. That shows where real NASA/USGS rasters live (public USGS Astrogeology bucket `asc-pds-services`, no login).
  2. Find 3 candidate regions that are **not Jezero** and that have: a regional DEM (CTX ~20 m/px or HRSC ~50–200 m/px), colour/visible imagery, and something scientifically interesting for the SCIENCE route. Start with: **Gale Crater** (Curiosity), **Mawrth Vallis** or **Arcadia Planitia** (proposed human landing / water ice). Check NASA's 2015 human Exploration Zones too.
  3. For each candidate, write down: dataset name, mission, resolution, file URL, file size, and lat/lon bounds.
  4. Write it all to a new file `docs/DATASETS.md` with a **recommended region** at the top and one sentence on why.
  5. Push. Then ask Moss to approve and log it in `docs/DECISIONS.md`.
- **Done when:** `docs/DATASETS.md` exists with 3 candidates + a recommendation, and the choice is logged in DECISIONS.

## T-05 · Port routing into our own planner module with SAFE / FAST / SCIENCE
- **Owner:** Teammate
- **Status:** TODO (can start now: it's plain JavaScript and doesn't depend on the web stack)
- **Steps:**
  1. Read Sol Atlas's `pathfinding.js` and `eva.js`.
  2. Create `planner/` at the repo root: `planner/package.json` (`"type": "module"`, test script `node --test`), `planner/src/eva.js` and `planner/src/route.js` **copied from** Sol Atlas, with a header comment crediting Sol Atlas and listing your changes.
  3. In `route.js`, add a `strategy` argument to `find()`:
     - **FAST:** step cost = travel **time** (distance ÷ `walkSpeed`), slope limit as given.
     - **SAFE:** step cost = energy × a slope penalty that grows smoothly from 10°. Hard limit 15° instead of 20°. Prefer cells away from steep ground.
     - **SCIENCE:** step cost × 0.6 inside a radius (default 500 m) of each science point passed in. Optionally force a pass through the top POI as a waypoint.
  4. Add `planner/src/plan.js` exporting `planMission({ elev, w, h, cellX, cellY, fineSlope, start, end, pois })` → `[{ strategy, path, budget, verdict }]` for all three strategies (use `budget()` + `verdict()` from eva.js).
  5. Write `planner/test/plan.test.js` on synthetic grids (flat plane + a hill + a POI): SAFE max slope ≤ FAST max slope; FAST total time ≤ SAFE and SCIENCE; SCIENCE passes closer to the POI than FAST.
  6. Commit and push after each step.
- **Done when:** `cd planner && npm test` passes. Paste the test output under Result.

## T-06 · Decide the web stack + architecture
- **Owner:** Moss's Claude (Moss approves)
- **Status:** TODO
- **Steps:**
  1. Compare map renderers for a single-region Mars map with custom raster layers + an animated rover: MapLibre GL, deck.gl, CesiumJS, or plain Three.js. Must look polished and different from Sol Atlas (they use Three.js with a game HUD).
  2. Decide where routing runs (Web Worker in the browser vs a Next.js API route). The planner is pure JS, so a Worker is the likely pick.
  3. Decide the AI explanation path: which model, called server-side from a Next.js route, given **only** computed numbers.
  4. Write it to `docs/ARCHITECTURE.md`, log it in DECISIONS, and add the setup tasks (scaffold Next.js, map page, worker hookup) to this board with owners.
- **Done when:** `docs/ARCHITECTURE.md` exists and DECISIONS has a "Stack" entry.

## T-07 · Brainstorm agenda
- **Owner:** Moss's Claude, with Moss
- **Status:** TODO (after T-06)
- **Steps:** work through `docs/OPEN-QUESTIONS.md` → Brainstorm agenda with Moss. Log every decision, turn every agreed feature into a task on this board.
- **Done when:** each agenda item is answered in DECISIONS or turned into a task.
