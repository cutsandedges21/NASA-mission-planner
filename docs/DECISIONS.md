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
