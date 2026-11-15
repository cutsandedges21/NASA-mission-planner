# HANDOFF: Gianluca's Claude owns everything from now (Sat 14 Nov, 12:00 EST)

**Why:** Moss's Claude chats are about to hit their weekly limit and will stop. Moss and Gianluca (the humans) are still here. **You (Gianluca's Claude) are now the only Claude on this project.** Everything left is in this file, in order. Steps that need Moss's PC or accounts are written as copy-paste instructions for the humans.

**Deadlines (EST):** feature freeze **Sat 23:00** (bugs only after) · submitted by **Sun 11:00** · hard deadline **Sun 12:00**.

---

## 0. State right now (all checked Sat 11:55 EST)

- **Live site:** https://nasa-eva-planner.vercel.app = GitHub `main` at **80f2b9b**, deployed Sat ~11:55 from Moss's PC. It includes your T-32 (smooth routes) and T-33 (Trek map types, globe, hover readout), and Moss's T-34 (Curiosity's detailed line, geology view). Live checks: `/` 200, `/data/gale/units.json` 200, `/data/gale/units.png` 200, `/data/gale/traverse-detail.json` 200, `/api/space-weather` 200.
- **Tests (Sat 11:55, all green):** `cd planner && npm test` → 28/28 · `node --test web/app/api/_tests/api.test.mjs` → 15/15 · `cd web && node scripts/test-mission-timeline.mjs` → OK · `node web/scripts/test-rover-terrain.mjs` → OK · `cd web && npx tsc --noEmit` → clean.
- **Vercel environment variables: NONE, on purpose** (Moss: no API keys). Today `/api/explain` still exists and answers with the template briefing; Step 0 removes it. Space weather uses NASA's public `DEMO_KEY`.
- **Blender graphics (T-29): NOT delivered.** The Blender chat confirmed at ~12:00: Moss told it to stop, and nothing is on GitHub. On Moss's PC only: `tools/blender/layered_data.py` (modified, untested fix), `tools/blender/compose_labels.py` (new), and one **broken** preview `docs/graphics/layered-data-preview.png` (all five labels stacked). **There is no `docs/graphics/layered-data.png` and no `web/public/graphics/layered-data.jpg`.** `tools/blender/export_routes.mjs` does not draw `r.line` yet. Don't link any of these. The UI chat's worktree (`C:\tmp\nasa-ui`) has nothing unpushed.

## 1. Things only the humans can do (Claude: remind them, with these exact steps)

### 1.1 Deploying (Moss's PC only)
Gianluca's account can't deploy: the Vercel Hobby plan blocks deploys whose git author isn't the owner, and the CLI is logged in on Moss's PC. **Moss runs one command in Git Bash, from the repo root:**
```
bash tools/deploy.sh
```
It deploys exactly what's on GitHub `main` (~2 min). If the build fails, the old site stays live.
**Daily limit (found Sat 20:20 EST):** Vercel Hobby allows **100 deployments per 24 h** for the whole account; the 15:02 deploy failed with `Resource is limited ... api-deployments-free-per-day`. Cause: every `git push` created 2 blocked deployments (projects `nasa-eva-planner` and `nasa-mission-planner` were both linked to the repo). Git deployments are now disabled on both projects (`createDeployments: disabled`), so pushing is free; ~17 deploys are left until Sun 10:00. Deploy on purpose (tested commits), not after every push. Check the count with `vercel api "/v6/deployments?teamId=team_FPJXre77iqiRUL0WvZ4TRloH&limit=100&since=<ms 24 h ago>"`.
`bash tools/deploy.sh --check` runs every step except the deploy (tested OK on Moss's PC Sat 12:15: Vercel login `cutsandedges21`, GitHub reachable). Every run writes **`C:	mpdeploy-log.txt`**. **Moss has no Claude:** if a deploy fails, Moss sends that log to Gianluca. **You** read it and reply in plain words with the exact fix: build error → fix the code, push, ask for another deploy; not logged in → `vercel login` (cutsandedges21 account); `rm` failure → close windows inside `C:	mpdeploy-snapshot`; network → retry. The script prints these same hints.
**Claude:** when you want a deploy, push first, then write `DEPLOY NEEDED: <commit>` in the SYNC LOG and tell Gianluca to text Moss. Deploy at least: (a) after the §2 docs/fixes, (b) right before feature freeze (Sat ~22:30), (c) after any Sunday bug fix.

### 1.2 API keys: NONE. Decided by Moss, Sat ~12:05
**Moss: "we will not be using any API keys, remove anything that would need them."** T-19 is cancelled. The Claude-API briefing path gets removed (your §2 Step 0). Space weather stays: it uses NASA's public `DEMO_KEY` (no account, no key of ours), cached 30 min on the server.

### 1.3 Blender graphics (T-29, Moss's PC only)
Blender runs only on Moss's PC, and that chat stopped on Moss's instruction (state in §0). **Treat T-29 as CUT** unless Moss restarts it and the files land on GitHub by **Sat 20:00**. Rule: a graphic exists only if it's on GitHub. **Now:** remove or avoid every reference to `layered-data.png` / `layered-data.jpg` / the descent video in README, SUBMISSION, DEMO-SCRIPT and CHALLENGE (T-30 had pre-written those paths as "final": undo that). Set T-29's status in `docs/TASKS.md` to `CUT (Sat 12:00, not delivered; WIP only on Moss's PC)`. Don't commit Moss's local Blender files yourself (you can't reach them anyway).

### 1.4 Submission (T-14, both humans, Sun 08:00–11:00): NO VIDEO, a SLIDE DECK
**Moss, Sat ~12:05: "we will not be submitting a video, we will be presenting with a slide deck."** You (Gianluca's Claude) build the deck (§2 Step 6). The humans present it and fill in the Space Apps project page (team login). You prepare every text field so they only paste.

---

## 2. Your task list, in order (Gianluca's Claude)

Keep the protocol: `git pull --rebase --autostash` before each step, push after, one SYNC LOG line per start and finish, **times from `TZ=EST5 date +%H:%M`** (`TZ=America/Toronto` prints UTC in Git Bash on Windows: 5 h ahead).

### Step 0 · Remove everything that needs an API key (Moss's decision, Sat ~12:05) (45 min, do first)
No runtime AI and no keys. The briefing becomes a plain-language explanation **written in the browser from the computed numbers** (the template we already have), so there's no server call: lighter and can't fail.
1. `web/components/Briefing.tsx`: stop calling `fetch('/api/explain')`. Build the briefing directly with the template in `web/lib/explain-fallback.ts`, with the same inputs the API got. Check that file is pure (no Node-only imports) before importing it in a client component. Change the label (line ~91, "Template briefing from the computed numbers (AI offline)") to **"Written from the computed route numbers"**. Remove every "AI", "Claude" and "AI offline" wording in the UI. Keep the recommended-route logic exactly as it is (it's computed, not AI).
2. Delete `web/app/api/explain/route.ts` and `web/lib/explain.ts` (Claude client, `ExplainGate` rate limiter, cache: all only existed for the paid API). Delete their tests in `web/app/api/_tests/api.test.mjs` and keep the space-weather tests. `grep -rn "explain\|ANTHROPIC\|anthropic" web --include=*.ts --include=*.tsx --include=*.mjs` (skip `.next`, `node_modules`) must find only the template code.
3. `web/lib/credits.ts`: remove any runtime Claude/Anthropic entry. **Keep** the development-time disclosure (Claude Code was used to write the code and docs): Space Apps requires AI-use disclosure.
4. Space weather: keep it. It reads `NASA_API_KEY ?? 'DEMO_KEY'`, and no key is set, so it runs on NASA's public DEMO_KEY. Check that a DONKI failure or 429 shows "space weather unavailable" and the planner still works (simulate by pointing the URL at a bad host locally).
5. Docs: `docs/DECISIONS.md` already has the entry. Update `CLAUDE.md` one-line summary ("has AI explain the recommendation" → "explains the recommendation in plain language from the computed numbers"), `README.md`, `docs/SUBMISSION.md`, `docs/ARCHITECTURE.md` (no `/api/explain`, no env vars), `docs/CHALLENGE.md`, `docs/AI-USE.md` (**no AI at runtime**; Claude Code used during development; geology outlines note from Step 1), `docs/PLAN.md` (mark the runtime-AI part as dropped). Mark T-12's AI part and T-19 and T-27 as `CANCELLED (no API keys, Moss Sat 12:05)` in `docs/TASKS.md`.
6. Tests + `cd web && npx tsc --noEmit && npx eslint` green → push → `DEPLOY NEEDED` (Moss runs `bash tools/deploy.sh`).
- **Done when:** the live site shows a briefing with no network call to `/api/explain` (DevTools → Network), `/api/explain` returns 404, no UI text mentions AI or Claude, and the docs agree.

### Step 1 · T-34 leftovers: credits + docs for the new layers (20 min)
- `web/lib/credits.ts` (same shape as the existing `CREDITS` entries), add:
  1. **"MSL traverse line (NASA/JPL MMGIS)"**: `https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json`. Curiosity's detailed drive line, drawn on the map (`web/public/data/gale/traverse-detail.json`, built by `node data/msl_traverse_detail.mjs`, simplified to 1 m: 2,494 of the 12,919 points inside the box).
  2. **"PIA26042: Curiosity's Path to Gediz Vallis Ridge and Beyond"**: NASA/JPL-Caltech/ESA/University of Arizona/JHUAPL/MSSS/USGS Astrogeology Science Center, `https://photojournal.jpl.nasa.gov/catalog/PIA26042`. Used as the **guide** for the approximate rock-unit outlines (colours and unit names); no pixels copied.
- `docs/DATASETS.md`: one row for each of the two above.
- `docs/AI-USE.md`: add "The rock-unit outlines (Geology → Rock units) were derived by us, with Claude Code, from NASA data: the ridge and the clay/sulfate boundary come from the MSL DEM, and the Greenheugh Pediment was traced by hand on the HiRISE mosaic and checked against Curiosity's two drives onto it (sols 2702, 3413). Guided by NASA/JPL PIA26042. Approximate; not an official geologic map; not AI-generated imagery."
- Also confirm your T-33 additions (Trek layers, model temperature) are in credits + AI-USE.
- **Done when:** `cd web && npx tsc --noEmit` is clean, the Data & credits panel shows both entries (check on localhost), pushed, SYNC LOG line.

### Step 2 · T-30 (adapted): bring every document up to date with what was built today (60 min)
New since the docs were last written: **T-32** smooth route lines · **T-33** Trek map types (Colour/Height/Thermal/Slope), Globe, hover readout (lat/lon, elevation, *model* temperature) · **T-34** Curiosity's detailed NASA drive line + **Geology → Rock units** (sulfate-bearing unit, clay-bearing unit, Greenheugh Pediment, Gediz Vallis Ridge, dashed Gediz Vallis Channel, labels; approximate; Gale only) · Simulate follows the smooth line.
- `README.md`: feature list + a short "Five NASA layers, one plan" section. **Only reference images that exist on GitHub.** Today that's `docs/graphics/t34-geology-3d.jpg` (a 3D screenshot of the geology view). Layer table: take missions and resolutions from `web/public/data/gale/meta.json` `sources` and your `web/lib/trek.ts`.
- `docs/SUBMISSION.md`: same features, an image list (existing files only), captions ≤ 140 characters.
- `docs/DEMO-SCRIPT.md`: add the beat **"Geology"**: Environment → Geology → **Rock units** → switch to 3D → orbit to look south up Mount Sharp (the view in `t34-geology-3d.jpg`) → "This is the same geology NASA shows for Curiosity's climb: clay-bearing unit, sulfate-bearing unit, Greenheugh Pediment, Gediz Vallis Ridge. The white line is Curiosity's real drive, from NASA/JPL." Write the narration word for word. **There is no video:** turn `DEMO-SCRIPT.md` into the *presentation script* (speaker notes per slide + the optional live-demo clicks, Step 6).
- `docs/CHALLENGE.md`: O5 ("layered, integrated view from multiple NASA missions"): point to Trek layers + geology + HiRISE/THEMIS/DEM. Update any row the new features change.
- `docs/ARCHITECTURE.md`: list the new data files `traverse-detail.json`, `units.png`, `units.json` and the build commands (§3).
- **Done when:** every relative path in those files exists (`git ls-files`), pushed, SYNC LOG line.

### Step 3 · T-31: `node tools/check-submission.mjs` (60 min)
Spec unchanged (see T-31 in `docs/TASKS.md`), with one change: **you have internet now** (you checked Trek CORS on Sat), so part (b) runs online: `https://nasa-eva-planner.vercel.app/`, `/data/gale/meta.json`, `/data/gale/units.json`, `/api/space-weather` (`ok: true`), and `/api/explain` must return **404** (removed in Step 0). Also fail if README, SUBMISSION or the slide outline mention `ANTHROPIC_API_KEY`, "API key" or claim AI at runtime. Add to (a): fail if any referenced image is missing. **Run it after every docs change and before the final deploy.**

### Step 4 · Route line colour: ask Gianluca (5 min)
The reference image (PIA26042) draws the route as one **thin, pale** line. Ours (after your T-32) are thin but keep the strategy colours (SAFE green, FAST gold, SCIENCE purple), and those clash with the gold/green geology tints when Rock units is on. Options for Gianluca: (a) keep as is; (b) when Geology is on, draw the selected route white with a dark casing and the others dimmed. That's a small edit to the `routes` paint in `MissionPlanner.tsx`, keyed on the `geology` state, which already exists there (search `const [geology`). Do what Gianluca picks; default (a).

### Step 5 · Feature-freeze check (Sat 21:30–23:00)
1. All tests (§0 list) + `cd web && npx eslint` + `node tools/check-submission.mjs`.
2. Push, `DEPLOY NEEDED` → Moss runs `bash tools/deploy.sh`.
3. Click through the **live** site at 1440×900 and write the results in the SYNC LOG: loading screen → landing picks a target → Plan this EVA → 3 route cards + briefing → each Map type → Globe → Geology → Rock units in 2D and 3D (labels readable, not upside down when you rotate) → Rover assist on Glen Torridon (NO-GO → GO) → ▶ Simulate (marker follows the smooth line and reaches the end exactly as the clock ends) → first-person rover view → Data & credits. Then a phone width (390×844): nothing overlaps.
4. After 23:00: bug fixes only, each one deployed.

### Step 6 · The slide deck (replaces the video; Moss, Sat 12:05) (2–3 h, start after Step 2, finish by Sat 22:30)
**Official limit (Space Apps 2026 Project Submission Guide): at most 7 slides including the title slide, or the project is not eligible for Global Judging.** The 10 suggested slides below must be merged into 7. Taken by Moss's Claude (freeze chat) Sat 20:24: see `docs/SLIDES.md`.
We **present with slides**. You build the deck; the humans present it.
1. **Requirements first:** find the official Space Apps 2026 rules for presenting/submitting with slides (max slides, max minutes, file format, where the link goes on the project page) and write them at the top of T-14 with the source URL. Follow them over anything below.
2. **Outline first, then build:** write `docs/SLIDES.md`: one section per slide with title, the on-slide words (short), the visual, and **speaker notes word for word with a time per slide**. Get Gianluca's OK on the outline (Moss's too if he's around) before building.
3. **Suggested slides** (cut to the official limit): (1) Title: Mars EVA Planner, team, challenge *Interplanetary Survival Guide: Martian Map* · (2) The problem: astronauts on foot (Marswalk) are limited by O₂, slope, daylight and radiation · (3) What we built: one screenshot of the planner with 3 routes · (4) Real NASA data, layered: HiRISE colour, MSL 1 m DEM, slope, THEMIS, Trek global layers, Curiosity's real drive line, **rock units view** (`docs/graphics/t34-geology-3d.jpg`) · (5) How the routes are computed: SAFE / FAST / SCIENCE, cost model, smooth lines that never cut onto steeper ground · (6) Do the routes make sense? Our routes vs Curiosity's real path: **numbers only from `docs/VALIDATION.md` / `docs/validation.json`** · (7) GO / NO-GO: O₂ budget, daylight, space weather; Rover assist turns Glen Torridon NO-GO into GO (re-run `node planner/scripts/demo-numbers.mjs` for the current numbers) · (8) Simulate Mission + first-person rover view (screenshot) · (9) Honest limits + next steps (HANDOFF §3 list) · (10) Credits + AI use: NASA/USGS/JPL datasets, Claude Code used in development, **no AI at runtime**.
4. **Screenshots:** take fresh ones from the **live** site after the Step 0 deploy, at 1920×1080 with Playwright. Store them in `docs/slides/img/`. Never use a picture of a feature that isn't live.
5. **Build:** generate an editable **.pptx** (opens in PowerPoint, Keynote and Google Slides) from a script in `tools/slides/`, so it can be rebuilt when numbers change. Python + `python-pptx` is approved (Python is the approved build-time language). Any other language: ask Gianluca/Moss first. Style: dark background, white text, the app's gold accent, big visuals, few words. Output `docs/slides/eva-planner.pptx`, plus a PDF copy if a converter is available (otherwise the humans export it).
6. **Live demo (optional, in the talk):** if the rules allow, a 60–90 s live demo slot with click-by-click notes in `DEMO-SCRIPT.md`, and a screenshot slide as the fallback if Wi-Fi fails.
- **Done when:** `docs/SLIDES.md` approved, the `.pptx` builds from the script, every number on a slide traces to a repo file, timing fits the official limit, and the SYNC LOG says where the file is.

### Step 7 · Optional, ONLY if Moss or Gianluca says yes: "What Curiosity saw here" (60 min, must land before 23:00)
Moss asked whether NASA's raw images are useful. Answer given: the linked feed (Mars 2020/Perseverance) is Jezero crater, not our map, but **Curiosity's raw images** come from the same NASA API and fit our science sites. **Not approved yet.** Spec if it is:
- API (checked Sat: CORS `*`, works from the browser): `https://mars.nasa.gov/api/v1/raw_image_items/?order=sol%20desc&per_page=24&page=0&condition_1=msl:mission&condition_2=<SOL>:sol:gte&condition_3=<SOL>:sol:lte`. Sol 753 returned `total: 614`; items have `sol`, `instrument` (e.g. `MAST_RIGHT`) and a JPG link (`https_url` or `url`: inspect one item and use whichever holds `https://mars.jpl.nasa.gov/msl-raw-images/...jpg`). Prefer Mastcam/Navcam full frames; skip thumbnails, calibration and engineering frames (inspect the fields on one response first).
- Sols per site (nearest NASA waypoint to our POI, computed Sat): Yellowknife Bay **166** (stops within 150 m: sols 50–333) · Pahrump Hills **753** (747–951) · Vera Rubin Ridge **2128** (1985–2218) · Woodland Bay **2590** (2468–2613) · Glen Torridon **2943** (only one stop within 150 m).
- UI: 3–4 thumbnails on the science-site card / landing target, captioned "Curiosity, sol N, <camera>. NASA/JPL-Caltech/MSSS raw image", **loaded only when that site is opened** (keep the site light). Add NASA/JPL raw images to credits + DATASETS.

### Step 8 · Sunday 08:00–11:00: prepare T-14 so the humans only paste
- `docs/SUBMISSION.md` final: title, one-paragraph summary, live URL, repo URL, NASA data list, AI-use disclosure, team.
- No video. Final deck exported (Step 6) and its file path + a PDF copy listed in `docs/SUBMISSION.md`. Re-check the official Space Apps 2026 requirements for a slide/presentation submission and write them in T-14.
- `node tools/check-submission.mjs` passes. Last deploy done and clicked through.

---

## 3. Map of what Moss's chats built today (so you can fix it without them)

| What | Files | Rebuild / test |
|---|---|---|
| Curiosity's detailed drive line (display only) | `data/msl_traverse_detail.mjs` → `web/public/data/gale/traverse-detail.json` (56 KB); loaded by `web/lib/region.ts` `loadTraverse()` (falls back to `traverse.json`); drawn by the `traverse` layer in `MissionPlanner.tsx` (solid, thin, `#f5efe6`) | `node data/msl_traverse_detail.mjs` (needs internet). **`traverse.json` (end-of-drive stops) is unchanged on purpose: T-22 validation numbers are measured on it** |
| Geology (approximate rock units) | `data/geology_gale.py` → `web/public/data/gale/units.png` (946×1186 RGBA tints on the region corners, 43 KB) + `units.json` (outlines, label points + ridge angle, channel line, 24 KB) | `PYTHONUTF8=1 python data/geology_gale.py` needs `data-cache/` (DEM + HiRISE `.npy` from `data/build_region.py`; **only on Moss's PC**, gitignored) + numpy, scipy, rasterio, shapely, Pillow. Checks built in: the ridge reaches the rover's sol-3940 spot; the rover's pediment drives (sols 2702, 3413) are inside the traced outline (or within 120 m). Numbers: ridge 0.20 km², pediment 1.79 km², clay 9.35 km², sulfate 22.15 km², clay/sulfate boundary −4,030 m (rover's elevation on sol 3209). **You can't re-run it without `data-cache/`; edit the JSON/PNG only if you must** |
| Geology on the map | `web/lib/geology-layer.ts` (`addGeology`, `setGeologyVisible`, `GEOLOGY_LEGEND`, `GEOLOGY_NOTE`); state `geology` + effect "8b" in `MissionPlanner.tsx`; toggle **Environment → Geology: Off / Rock units** + legend in `map/SetupPanel.tsx` (only when region id is `gale`) | Tint layer sits **under `hillshade`** (relief shades it). Labels are HTML markers: unit labels face the screen; the ridge label follows the ridge and is kept upright on rotate (`uprightAll`) |
| Simulate follows the smooth line | `web/lib/mission-timeline.ts` `makePathLocator(path, cellX, cellY, toLonLat, refOneWay?)`; `Simulation.tsx` passes `route.line ?? route.path` with `refOneWay = budget.oneWay` | The line is ≤ 8 % shorter than the cell path, so distances are stretched onto the budget's base; timing is unchanged. `cd web && node scripts/test-mission-timeline.mjs` |
| Deploy | `tools/deploy.sh` | Moss's PC only (§1.1) |

**Honest limits to keep in every doc:** rock-unit outlines are approximate (pediment hand-traced; the clay unit's north edge is a straight line along Vera Rubin ridge; no CRISM mineral data); route-planning cells are 25 m (no boulders); the first-person ground detail and rocks are procedural; temperature is a model (your T-33).

## 4. Rules that still apply (from Moss)
- **Languages:** use the language best suited to each task, keep the website light enough for a 16 GB laptop, and **ask Moss (or Gianluca, while Moss is offline) before adding a new language.** Log the answer in `docs/DECISIONS.md`. Python is approved for build-time data steps.
- Routes, hazards and stats are computed from data; the briefing only restates computed numbers. Never make numbers up. Real NASA data beats synthetic. **No runtime AI and no API keys** (Moss, Sat 12:05).
- Every step you write must be actionable (owner, files, commands, done-check).
- Windows checkouts turn files to CRLF: normalise line endings in patch scripts.
