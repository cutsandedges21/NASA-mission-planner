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
