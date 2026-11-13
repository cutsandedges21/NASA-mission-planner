# Project Plan

## Goal

We get one submission for NASA Space Apps 2026. We want to:

1. Win, or at least advance.
2. End up with a portfolio piece strong enough for resumes, internships and startup accelerators.
3. Build something that feels like a real product, not a hackathon demo.

Resume line we're aiming for:

> **NASA Space Apps Challenge – Intelligent Mars Mission Planning Platform.** Developed an interactive Martian mission-planning application using NASA datasets, geospatial visualization, route optimization, hazard analysis, and AI-assisted mission planning.

## Challenge

**Interplanetary Survival Guide: Martian Map.**

We reviewed all 14 official 2026 challenges. These were the finalists:

- Interplanetary Survival Guide: Martian Map ← **chosen**
- CLPS Lunar Mission Browser
- Planet X & SPHEREx
- Field Shift
- Earth System Trend Detective

We chose the Martian Map because it covers the most skills in one project: geospatial visualization, real NASA datasets, route optimization, terrain analysis, AI, product design and interactive simulation.

## The pitch

> "An intelligent mission-planning system that helps astronauts safely navigate the Martian surface using NASA data."

It's a **mission planner**, not "a map of Mars". Judges should experience *planning a mission*, not looking at a static map. It should feel closer to a professional mission-planning tool than a student project.

## User flow

1. Open a polished interactive Mars map.
2. Choose a base.
3. Choose a destination.
4. The system generates multiple route options.
5. A dashboard shows the tradeoffs (distance, travel time, risk, science value).
6. AI explains the recommendation.
7. A rover simulation animates the journey.

## The "wow" demo

This is the moment we want judges to remember:

1. Select a **base** (e.g. a research site near Olympus Mons) and a **destination**.
2. The app generates three routes:
   - **SAFE**: lower terrain risk, longer distance
   - **FAST**: shortest route, higher terrain risk
   - **SCIENCE**: passes near sites of geological interest
3. AI explains, for example:
   > "The Science route adds 18.4 km but passes within 2 km of three geological targets while avoiding slopes above 15°. It maintains communication visibility for 82% of the journey."
4. Press **Simulate Mission**, and the rover drives across the Martian surface.

(The numbers above are illustrative. In the real app, every number the AI says must come from our computation.)

## Features by tier

**Build in order. Don't start Tier 2 until Tier 1 works end to end. Don't start Tier 3 until Tier 2 does.**

### Tier 1: must exist
- Interactive Mars map
- Real NASA data
- Route generation
- Terrain / hazard analysis (steep slopes, rough terrain, etc.)
- Mission dashboard (distance, estimated travel time, risk, science value)
- Polished, responsive UI

### Tier 2: the differentiators
- AI mission assistant (explains *why* a route is recommended)
- Three route strategies: SAFE / FAST / SCIENCE
- Animated mission simulation (rover travels the route)
- Points of scientific interest

### Tier 3: only if everything above works
- 3D terrain
- Voice interaction
- Advanced optimization
- Multiplayer / collaboration
- Extra datasets (e.g. solar/lighting analysis, resource mapping such as water ice)

## Tech philosophy

- **Not "ChatGPT on top of NASA data".** Judges see through that.
- The system actually **calculates** routes, **analyzes** terrain and **visualizes** data. AI is an enhancement that explains the results.
- Rough stack direction: React / Next.js frontend → API → geospatial data processing → routing algorithm → AI explanation layer → deployed web app. Final choices are in `OPEN-QUESTIONS.md`.

## Team

There are **two of us**. The original plan assumed three, with these roles:

| Area | Original 3-person split |
|---|---|
| Product, frontend, UI/UX | Moss |
| NASA datasets, GIS, scientific processing | Teammate 2 |
| Backend, AI, algorithms | Teammate 3 |

**With two people, the split still needs to be agreed** (see `OPEN-QUESTIONS.md`). Proposed starting point:

- **Moss:** product lead, frontend, UI/UX, map, dashboard, simulation, AI explanation UI
- **Teammate:** NASA data + GIS processing, routing algorithm, backend API, AI prompt/explanation pipeline

Moss's background, so the plan plays to it: builds polished web apps (React/Next.js), ships fast, strong on UI/UX and Apple-quality interactive design, built ScheduleMatcher (a student scheduling app), runs a web-dev studio (mossimo).

