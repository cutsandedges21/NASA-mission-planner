# NASA Space Apps 2026 project page: paste-ready text

**How to use this file (Moss or Gianluca, Sunday morning, about 15 minutes):** on spaceappschallenge.org → profile icon → **My Team** → **Project** tab → **Edit**. Paste each block below into the field with the same name, click **Save Progress** after each one, then tick both boxes and press **Submit for Judging**. You can edit and resubmit until the deadline; only the last saved version is judged.

**Official rules** (Project Submission Guide, dated 13 Nov 2026: https://www.spaceappschallenge.org/resources/project-submission-guide/):

- Every required field filled in, in English.
- **Demo = a slide deck of at most 7 slides (title slide included) or a video of 30 s or less.** Over the limit = not eligible for Global Judging. Ours: 7 slides.
- Demo link and final-project link must open **without a login, password or permission**. Test both in a private browser window.
- Slides must show the team name, the team members' names and the challenge.
- No images of people under 18 anywhere in the demo or project.
- Official close: **Sunday 15 Nov, 23:59 local time**. Our own deadline: **Sunday 12:00**.
- The page accepts pasted images (JPG / PNG / GIF, up to 10 MB), not videos or documents.

**Before pasting, three checks:**

1. Moss has run `bash tools/deploy.sh` after the last push, and it printed `DEPLOY OK`.
2. https://nasa-eva-planner.vercel.app opens in a private window, and so does https://nasa-eva-planner.vercel.app/slides/eva-planner.pdf (7 pages).
3. `node tools/check-submission.mjs` prints `All checks passed`.

Numbers come from `node planner/scripts/demo-numbers.mjs` and `node planner/scripts/validate-gale.mjs` (repo root).

---

## Field: Project Name

EVA Mission Planner: Gale Crater

## Field: High-Level Project Summary

The first people on Mars will explore on foot, and every walk outside is a budget: oxygen, steep ground, daylight, and the walk back to the airlock. Mapping tools like NASA's Mars Trek are built for regional views; an astronaut needs a plan for one specific walk.

EVA Mission Planner is that tool for Gale Crater, a site proposed for human explorers at NASA's 2015 Exploration Zone workshop and explored by the Curiosity rover since 2012. You pick a target and the app computes a SAFE and a FAST route on NASA's 1-metre elevation model, then scores each one with a spacesuit model: time outside, oxygen left at the airlock, steepest slope and return time before sunset, with a GO, CAUTION or NO-GO verdict. A mission simulator then runs five seeded walks with different risk appetites, hidden ground and weather, using NASA-orbiter dust-storm records for the season.

It matters because the plan is checked against reality: on the 5.9 km walk to the foot of Mount Sharp, our FAST route stays within 250 m of the path NASA's Curiosity drivers chose for 100 % of its length, and the SAFE route for 93.5 %. Example plan: Bradbury Landing to Pahrump Hills, 11.8 km there and back, 3 h 41 min, 49 % oxygen left: GO.

*(206 words)*

## Field: Link to Project Demo

https://nasa-eva-planner.vercel.app/slides/eva-planner.pdf

*(7 slides. Source: `docs/slides/eva-planner.pptx`, built by `python tools/slides/build_deck.py`. The same PDF is in the repo at `docs/slides/eva-planner.pdf`.)*

## Field: Link to Final Project

https://nasa-eva-planner.vercel.app

*(Code: https://github.com/cutsandedges21/NASA-mission-planner. **The repository is private today.** If you want judges to read the code, make it public first: GitHub → the repo → Settings → General → Danger Zone → Change visibility → Public. Then add the link at the end of the Detailed Project Description. If it stays private, don't paste the link.)*

## Field: Detailed Project Description

**What it does**

- Shows Gale Crater in 2D or 3D on NASA imagery, with Curiosity's real drive path and five science sites the rover studied.
- Plans a walk from the base (Bradbury Landing, movable) to any site, bookmark or clicked point: a SAFE route (least oxygen, avoids steep ground) and a FAST route (least time).
- Scores each route: time outside, oxygen left at the airlock, distance, steepest slope, return time against sunset. Verdict GO / CAUTION / NO-GO with the reason. Example: Pahrump Hills, 11.8 km round trip, 3 h 41 min, 49 % oxygen left, GO.
- Explains the recommended route in a short plain-language briefing built from those numbers.
- Map layers: Thermal (Mars Odyssey THEMIS), Elevation (1 m terrain, colour-coded), Slope, and a whole-Mars Globe from NASA Mars Trek. Hovering shows coordinates, elevation and a modelled ground temperature.
- Mission simulator: five seeded simulations, each with its own risk appetite, hidden ground and weather, labelled FASTEST, SAFEST and BALANCED (plus two more), with what happened, a step-by-step route and the assumptions used. A switch forces a dust storm into every run, and a pit stop can be added between the two points.
- Rover assist: plans the same trip with an unpressurised rover. Glen Torridon is NO-GO on foot and GO by rover (3 h 44 min, 76 % oxygen left).
- Simulate: plays the walk on the map with a live oxygen gauge, or as a first-person ride over the real terrain.

**How it works**

- Data pipeline (Python, rasterio): reads only the needed window of each NASA/USGS raster and bakes a 473 × 593 grid of 25 m cells: elevation, the steepest slope inside each cell, colour and thermal images. One config file per region.
- Planner (JavaScript, in a Web Worker in the browser): A* search on the elevation grid with one cost function per strategy, scored as an out-and-back walk. Suit model: Pandolf load-carriage metabolism scaled to Mars gravity with a pressure-suit penalty, a Tobler-style speed curve, a 25 % oxygen reserve, an 8 h suit limit and a 20° slope limit. 44 automated tests, including tests on the real terrain.
- Simulator: dust-storm chance per season from the Mars Dust Activity Database (NASA MGS and MRO orbiter imagery, 14,974 storms); storm strength, hidden-ground range and pace are our assumptions and are listed in the app.
- Web app: Next.js, MapLibre GL (2D/3D map driven by our own elevation grid), three.js (first-person view).

**Benefits**

- One screen answers the question an EVA planner has to answer: can the crew get there and back on this suit, before sunset, and how much margin is left.
- It is honest about limits: three of the five science sites are NO-GO on foot (more than 6 hours, under 10 % oxygen left), and the app says so and offers the rover.
- It is checked: FAST stays within 250 m of Curiosity's real path for 100 % of the way to Pahrump Hills; SAFE for 93.5 %.

**What we hope to achieve / what's next**

- Boulder hazards from 25 cm HiRISE images and 1 m terrain roughness.
- Two-person EVAs, a carried-equipment setting, and a mineral (CRISM) layer.
- Run the same pipeline for other human landing-site candidates.

**Limits we state openly**

- Boulders aren't modelled (25 m cells). The suit model is a planning estimate. One region is baked. Two of five site positions are approximate. The hover temperature is a model, not a measurement. Simulator event sizes are assumptions.

**Tools, languages, software**

TypeScript, JavaScript, Python. Next.js, React, Tailwind CSS, MapLibre GL JS, three.js, Node.js, rasterio, NumPy, SciPy, Pillow, Blender (one illustration), Vercel (hosting), Playwright (testing).

*(about 520 words)*

## Field: Use of Super Intelligence (SI)

Yes. We used Claude Code (Anthropic's coding assistant, a large language model) during development. It wrote much of the code and documentation to our specifications, searched for datasets and citations, and ran tests. We chose the challenge, the site, the features and what to cut, and we checked the results against NASA data (for example the comparison with Curiosity's real path).

The running app uses no AI: routes, numbers, verdicts and the briefing text are computed by ordinary code in the browser, and the app needs no accounts or secrets. There are no AI-generated images, video or audio in the project. The one illustration ("Five NASA layers, one plan") was rendered in Blender from the real data files.

This is acknowledged in the repository README ("AI use"), in `docs/AI-USE.md`, in the app's Data & credits panel, and in the commit history (commits written with Claude Code carry a `Co-Authored-By: Claude` line).

## Field: NASA Data

- MSL Gale Merged DEM v3, 1 m (USGS Astrogeology; MRO HiRISE / CTX, Mars Express HRSC, MGS MOLA): elevation, slope, 3D terrain, route search. https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
- MSL Gale HiRISE colour mosaic, 25 cm (USGS, MRO HiRISE): the map imagery. https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm
- Viking MDIM 2.1 colour mosaic (Viking Orbiter): fills gaps in the colour image. https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif
- THEMIS Night IR controlled mosaic, 100 m (Mars Odyssey THEMIS): thermal layer. https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif
- NASA/JPL MSL waypoints and traverse line (Curiosity's real drive path and stops): site positions, the path on the map, validation. https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json and https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json
- NASA Mars Trek global mosaics (Viking colour, MGS MOLA relief, Mars Odyssey THEMIS day IR): the whole-Mars globe. https://trek.nasa.gov/mars/
- Mars24 time algorithm (NASA GISS; Allison & McEwen 2000): Mars clock, daylight. https://www.giss.nasa.gov/tools/mars24/
- NASA First Landing Site / Exploration Zone Workshop for Human Missions (2015): why Gale. https://www.hou.usra.edu/meetings/explorationzone2015/
- Apollo lunar EVA metabolic rates (NASA TN D-7883): check on the suit model. https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD7883Metabolic.pdf
- Curiosity REMS ground temperature at Gale (Martínez et al. 2017): the modelled hover temperature.
- Viking global mosaic of Mars, PIA00407 (NASA/JPL/USGS): the globe picture on the landing page. https://photojournal.jpl.nasa.gov/catalog/PIA00407

## Field: Space Agency Partner Data and Other References

**Space agency partner data**

- ESA Mars Express HRSC (ESA / DLR / FU Berlin): part of the MSL Gale Merged DEM we route on.

**Other data and references**

- Mars Dust Activity Database (Battalio & Wang 2021, Icarus 354, 114059; Harvard Dataverse doi:10.7910/DVN/F8R2JX, CC0), built from NASA MGS MOC and MRO MARCI daily global maps: dust-storm chance by season.
- Pandolf, Givoni & Goldman (1977), J. Appl. Physiol. 43: 577–581: metabolic cost of walking with a load.
- Tobler's hiking function: walking speed against slope.
- Parker & Calef (2016), MSL Gale Merged Orthophoto Mosaic and DEM, USGS Astrogeology.

**Software**

- Next.js (MIT), React (MIT), Tailwind CSS (MIT), MapLibre GL JS (BSD-3-Clause), three.js (MIT), rasterio, NumPy, SciPy, Pillow, Blender (GPL, one illustration), Playwright (Apache 2.0, testing), python-pptx (MIT, the slide deck), Vercel (hosting).
- Claude Code (Anthropic): development assistant, see "Use of Super Intelligence".

Full list with links: the app's **Data & credits** panel and `docs/DATASETS.md`.

---

## Images to paste into the page (optional, each under 10 MB)

| File | Caption (≤ 140 characters) |
|---|---|
| `web/public/graphics/layered-data.jpg` | Five NASA data layers of the same patch of Gale Crater, registered to one map: plan, optical, thermal, slope hazard, topography. |
| `docs/slides/img/planner-pahrump.jpg` | A planned Marswalk to Pahrump Hills: two routes, oxygen per route, a verdict, and five simulated walks. |
| `docs/slides/img/rover-view.jpg` | First-person ride along the planned route, on terrain built from NASA's 1 m elevation model and HiRISE colour. |
