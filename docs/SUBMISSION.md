# NASA Space Apps 2026 project page: paste-ready text (T-24)

> **Before pasting:** Moss, put the official field names, character limits and video rules into `docs/SUBMISSION-REQUIREMENTS.md` (Teammate's Claude has no internet). Then trim each block below to fit. Placeholders: `{{LIVE_URL}}`, `{{REPO_URL}}`, `{{VIDEO_URL}}`. Numbers come from `node planner/scripts/demo-numbers.mjs` and `node planner/scripts/validate-gale.mjs` (repo root).

---

### Project title
**Marswalk Mission Planner: Gale Crater**

### One-line summary (≤ 140 characters)
Plan safe Marswalks on real NASA terrain: three routes scored on oxygen, slope, daylight and radiation, checked against Curiosity's path.
*(137 characters)*

### Links
- Live app: {{LIVE_URL}}
- Code: {{REPO_URL}}
- Demo video: {{VIDEO_URL}}

### Project description (≤ 300 words)
The first humans on Mars will explore on foot, and every walk outside is a budget: oxygen, steep ground, daylight, radiation, and the walk back to the airlock. Mapping tools like Mars Trek are built for regional views. An astronaut needs a plan for one specific walk.

Marswalk Mission Planner is that tool for Gale Crater, proposed for human explorers at NASA's 2015 landing-site workshop and explored by Curiosity since 2012. You pick a science site, and the app computes three routes on NASA's 1-metre elevation model of Gale: SAFE (avoids steep ground), FAST (least walking time) and SCIENCE (adds work time at the sites). Each is scored with a spacesuit model for walking time, oxygen left at the airlock, steepest slope, and radiation dose from Curiosity's own measurements, and gets a GO, CAUTION or NO-GO verdict. A live NASA DONKI feed warns when a solar storm is forecast to reach Mars, and a daylight bar shows the walk against Gale's sunset.

An AI briefing explains the recommended route. It can't invent anything: the route is chosen by a fixed rule, and any number the AI quotes that we didn't compute is rejected.

We checked the routes against reality. On the 5.9 km walk to the foot of Mount Sharp, our FAST route stays within 250 m of the path NASA's Curiosity drivers chose for 100 % of its length, and SAFE for 93.5 %. Example plan: Bradbury Landing → Pahrump Hills, 11.8 km round trip, 3 h 41 min, 49 % oxygen left: GO.
*(255 words)*

### What it does
- Shows Gale Crater with HiRISE colour imagery, a slope-hazard layer, 3D relief and Curiosity's real drive path (1,270 stops).
- Plans three EVA routes from Bradbury Landing to any of 5 science sites, or any point you click.
- Scores each route: time, O₂ left at the airlock, max slope, share of steep ground, radiation dose; verdict GO / CAUTION / NO-GO with reasons.
- Live space weather (NASA DONKI) and Mars clock, daylight and Earth signal delay (Mars24).
- Mission briefing worded by AI from computed numbers only.
- "Simulate Mission": plays the walk with a live oxygen gauge and the science stop.

### How we built it
- **Data pipeline (Python, rasterio):** reads only the needed window of NASA/USGS rasters from the USGS cloud bucket and bakes a 473 × 593 grid of 25 m cells: elevation, the steepest slope inside each cell, colour and thermal images. It's driven by one config file per region.
- **Planner (JavaScript, in a Web Worker):** A* search on the elevation grid with three cost functions (O₂ with a slope penalty, walking time, O₂ with science stops), scored as an out-and-back walk. Suit model: Pandolf load-carriage metabolism scaled to Mars gravity with a pressure-suit penalty, a Tobler-style speed curve, an O₂ reserve and suit limits. 24 automated tests, including tests on the real terrain.
- **Web app:** Next.js + MapLibre GL, a 2D/3D map driven by our own elevation grid, API routes for the AI briefing (Claude) and NASA DONKI.
- **Validation:** compared our routes with Curiosity's real path from the NASA/JPL waypoint feed.

### Challenges we ran into
- Our first science-site positions (from HiRISE image centres) were off by up to 2.2 km. We snapped them to Curiosity's real stops.
- On real terrain the SAFE route sometimes hid steep pitches inside 25 m cells, and a route ending on a cliff was rated GO. We now use the steepest slope inside each cell.
- Making AI useful without letting it make things up: a fixed recommendation rule plus a number check on its text.

### Accomplishments we're proud of
- Routes that agree with NASA's rover drivers: FAST within 250 m of Curiosity's path for 100 % of the way to Pahrump Hills.
- Everything is computed from NASA data, and the AI only words it.
- An honest verdict: 3 of 5 sites are NO-GO on foot (6–6.5 h, ≤ 9 % O₂ left), and the app says so.

### What's next
- Rover assist in the UI (the planner already does it: Glen Torridon goes from NO-GO on foot to GO by rover, 3 h 44 min, 76 % O₂).
- Boulder hazards from 25 cm HiRISE images and 1 m terrain roughness.
- Two-person EVAs, carried-kit settings, and a mineral (CRISM) layer.
- Run the same pipeline for other human landing sites.

### NASA data and resources used
- MSL Gale Merged DEM v3, 1 m (USGS; MRO HiRISE/CTX, Mars Express HRSC, MGS MOLA): https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
- MSL Gale HiRISE colour mosaic (USGS, MRO HiRISE): https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm
- Viking MDIM 2.1 colour mosaic: https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif
- THEMIS Night IR controlled mosaic (Mars Odyssey): https://asc-pds-services.s3.us-west-2.amazonaws.com/wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif
- NASA/JPL MSL waypoints (Curiosity's drive path): https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json
- NASA DONKI WSA-ENLIL CME forecasts (via api.nasa.gov): https://kauai.ccmc.gsfc.nasa.gov/DONKI/
- Curiosity RAD surface dose (Hassler et al. 2014, Science 343): https://doi.org/10.1126/science.1244797
- Mars24 time algorithm (NASA GISS): https://www.giss.nasa.gov/tools/mars24/
- NASA 2015 Exploration Zone workshop: https://www.hou.usra.edu/meetings/explorationzone2015/
- Apollo EVA metabolic data (NASA TN D-7883), for checking the suit model: https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD7883Metabolic.pdf

### Tools
Next.js, React, TypeScript, Tailwind, MapLibre GL JS, Python (rasterio, NumPy, SciPy, Pillow), Node.js, Vercel, OpenPlanetaryMap basemap; routing, EVA model, Mars time and pipeline adapted from Sol Atlas.

### Use of AI
We built the project with Claude Code (Anthropic) as a coding assistant under our direction. In the app, Claude only words the mission briefing from numbers our planner computed. The route choice is a fixed rule, a guard rejects any invented number, and a template is the fallback. No AI-generated images, video or audio. Full disclosure: `docs/AI-USE.md`.
