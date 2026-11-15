# Video script: EVA Mission Planner

**Format:** filmed on an iPhone in the computer science lab. Moss and Gianluca talk to the camera, the demo is the iPhone filming the laptop screen, and a whiteboard shows who built what, the tech stack and our AI use. No effects, no music, no editing beyond cutting the clips together.

**Length:** about 48 s spoken (about 120 words). 45 s target, 60 s hard max.

⚠️ **Space Apps rule:** a demo video in the submission form must be **30 s or less**, or the project can't go to Global Judging (docs/SUBMISSION.md). Our submission uses the 7 slides. Don't upload this video as the demo link unless it's under 30 s.

---

## Before you film (10 min)

1. **Whiteboard:** write it out using the layout below.
2. **Laptop:** open https://nasa-eva-planner.vercel.app full-screen (F11), brightness at max, close other tabs. Wait until the map has loaded.
3. **iPhone:** landscape, 4K 30 fps, lock focus and exposure on the screen (press and hold until **AE/AF LOCK** shows). Hold it steady, or lean it on something. Turn off the lab's ceiling light over the laptop if it reflects on the screen.
4. **Sound:** quiet room, phone about 1 m from whoever is talking. Do one test clip and play it back.

## Script

| # | Time | Shot | Who | Says |
|---|---|---|---|---|
| 1 | 0:00–0:08 | Moss on camera, chest up, lab behind | **Moss** | "On Mars, every step outside costs oxygen. Earth is up to twenty minutes away by radio, so no one can warn you in time." |
| 2 | 0:08–0:12 | Gianluca on camera | **Gianluca** | "NASA's own maps cover whole regions, not the few kilometres of one walk." |
| 3 | 0:12–0:26 | Laptop screen. Click **Pahrump Hills** → **Plan this EVA**. The SAFE and FAST routes draw, then hold on the route card (3 h 41 min · 49 % O₂ · GO). | **Moss** (voice) | "So we built EVA Mission Planner. Pick a science target in Gale Crater, and it plans a safe walk and a fast one on NASA terrain: time outside, oxygen left, GO or NO-GO." |
| 4 | 0:26–0:30 | Laptop: point at Curiosity's dashed path under the route | **Gianluca** (voice) | "And it matches reality: within 250 metres of Curiosity's real path." |
| 5 | 0:30–0:34 | Laptop: setup panel → Mode → **Rover assist** (Glen Torridon turns GO), then press ▶ for the first-person ride | **Moss** (voice) | "It also plans rover trips, dust storms and the gear you carry." |
| 6 | 0:34–0:38 | Whiteboard, slow pan left to right | **Gianluca** (pointing) | "Here's who built what, and our stack." |
| 7 | 0:38–0:46 | Both in front of the whiteboard, pointing at the AI box | **Moss** | "We're open about AI: Claude Code built our first-person rover view, and helped with our tests, deploy scripts and docs. No AI runs in the app. Every number is computed." |
| 8 | 0:46–0:48 | Both on camera | **Both** | "EVA Mission Planner. Try it live." |

**Too long?** Cut line 5 first (saves about 4 s).

## Whiteboard layout

```
EVA MISSION PLANNER  ·  Interplanetary Survival Guide: Martian Map
Team [TEAM NAME]  ·  nasa-eva-planner.vercel.app

MOSS                              GIANLUCA
- NASA data pipeline (1 m          - Route checks vs Curiosity's
  terrain + HiRISE colour)           real path (validation)
- Map, 2D/3D, app design           - Mission simulator + dust storms
- Simulate Mission (O2 gauge)        (NASA orbiter storm records)
- Rover assist + first-person      - Rover-assist route planner
  view                             - NASA Mars Trek layers + Globe
- Curiosity's path + geology       - Data sources + credits, README
- Science-gear option, deploy      - Automated tests

TECH STACK
Next.js 16 · React 19 · TypeScript · Tailwind CSS
MapLibre GL (map, 2D/3D) · Three.js (first-person view)
Route planner: JavaScript, A* search, runs in a Web Worker
Data pipeline: Python (NumPy, SciPy, Pillow) · Hosting: Vercel

AI USE (Claude Code)
- First-person rover view: 100 % AI
- Also AI: automated tests, deploy + submission-check
  scripts, the 3D data-layers graphic script, docs wording
- No AI inside the app: routes + numbers are computed
```

The split comes from the git history (`git log --author=...`). Moss and Gianluca, check it and fix anything that's wrong before you write it up.

## Accuracy

- Say "it plans" or "it computes", never "AI plans".
- Don't mention radiation or space weather: they were removed from the app (a49759a).
- "Up to twenty minutes": the Earth–Mars radio delay is 3 to 22 minutes one way.
