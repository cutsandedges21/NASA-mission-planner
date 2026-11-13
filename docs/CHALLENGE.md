# The Official Challenge: What NASA Asks For

Challenge: **Interplanetary Survival Guide: Martian Map** (Intermediate · Human Exploration, Mars, Planets & Moons, Software, Space Exploration).

Source: the official challenge page, as recorded in Sol Atlas's notes on 31 Oct and 13 Nov 2026. **Re-check the live challenge page and its Resources tab yourself before submitting.**

**The ask, in NASA's words:** "create a layered, integrated view of a location or route on the Martian surface that pulls together data from multiple NASA science missions and could help a human explorer plan and carry out a successful **Marswalk** while conducting new and exciting science along the way."

The background notes that tools like JPL's **Mars Trek** "are built for regional and global views rather than the hyperlocalized areas astronauts will target on individual spacewalks."

> ⚠️ **Impact on our plan:** the challenge is about **humans on foot (Marswalk / EVA)**, with rovers only as an optional extra. Our routes must be scored for an astronaut walking: oxygen, suit limits, daylight, walk back to base. "Rover routing" alone would miss the brief. The vendored `eva.js` already models exactly this.

> ⚠️ **Competition:** over a thousand teams picked this challenge (per Sol Atlas's notes). A layered map with a route is the baseline. The differentiators have to come from elsewhere.

## Requirements checklist

Use this as a scoring sheet. Every row must be answerable in the demo.

### Objectives
| # | NASA asks for | How we answer it (fill in) |
|---|---|---|
| O1 | A map / tool / interface an astronaut could use on a surface mission, built on NASA data and tools | |
| O2 | A location chosen for human explorers (NASA's 2015 human landing **Exploration Zones** are the reference) | |
| O3 | **Start from science goals**, then pick a location that serves them | |
| O4 | A location a rover has studied well, or a less-studied one | |
| O5 | **At least three kinds of data** from: optical, thermal, spectral, topographic, geophysical, atmospheric, radiation, chemical | |
| O6 | **Safety first**: radiation and space weather | |
| O7 | Spacesuit mobility, and carrying science equipment | |
| O8 | A route that reaches the science targets while avoiding big obstacles (e.g. large rock formations) | |

### Potential considerations (optional, but each one answered is a point with judges)
| # | Consideration | How we answer it (fill in) |
|---|---|---|
| C1 | Form factor: a display in the habitat, a tablet the crew carries, or a HUD on the helmet visor | |
| C2 | A static map, an interactive product, or a **generator** for other places and data | |
| C3 | Inspiration from maps made for other worlds (e.g. Apollo traverse maps) | |
| C4 | Past, predicted, or no specific time frame | |
| C5 | Point-of-view images from Mars surface missions so the astronaut knows what to expect | |
| C6 | Rovers carrying crew and tools, or **astronauts working in pairs** | |

## Known gaps other teams hit (opportunities for us)

- **Spectral data (CRISM minerals)** is the data type the statement lists first, and it's hard to get. Sol Atlas couldn't get usable scenes for Jezero from the USGS bucket. The PDS Geosciences Node (ODE) is the source. A region with good CRISM coverage would be a real edge.
- **Two-person EVA** (EV1 + EV2): not done by Sol Atlas.
- **Generator for any place** (C2): Sol Atlas is hard-wired to one site. A planner that works on any region you load is a strong differentiator. It's also a natural fit for our SAFE / FAST / SCIENCE engine.
- **Rock hazard** from 1 m HiRISE elevation models (surface roughness), so boulders show up as hazards.
