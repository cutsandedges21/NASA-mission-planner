# Video script: EVA Mission Planner

**Length:** 45 s target, 30 s best, 60 s hard max. Voice-over at about 150 words a minute.
**Tone:** a NASA/JPL mission trailer, not a student pitch. Calm, confident voice, low music that builds, real product footage, numbers on screen.

⚠️ **Space Apps rule:** a demo *video* in the submission form must be **30 s or less**, or the project is not eligible for Global Judging (docs/SUBMISSION.md). Use cut B there. Cut A is for the local judges, social media and the README.

---

## What the judges score, and where the video proves it

Space Apps judges on five criteria. Every beat below hits at least one.

| Criterion (official wording) | Our proof in the video | Beat |
|---|---|---|
| **Impact**: how much good the project can do | Built for the first crew on Mars, who plan walks with Earth up to 20 min away by radio | Hook |
| **Relevance**: answers the challenge it was entered in | Uses NASA's own problem statement: maps cover regions, not a single walk | Problem |
| **Creativity**: new idea or approach | Turns orbital terrain into a walk plan with oxygen, sunset and a GO / NO-GO verdict, not just a map | Solution + demo |
| **Validity**: scientifically sound, does what it claims | Our route tracks the path NASA's Curiosity drivers chose, within 250 m | Proof |
| **Presentation**: tells the story: challenge, solution, why it matters | Problem → product → proof → range → close, all in 45 s | Whole video |

---

## A. 45-second version (≈ 110 words)

| Time | Beat | Picture | On-screen text | Voice-over |
|---|---|---|---|---|
| 0:00–0:08 | **Hook** | Slow 3D push over Mount Sharp at dawn (app 3D view, HiRISE colour). Low drone music. | *GALE CRATER, MARS* | "The first astronauts on Mars will step outside with a fixed supply of oxygen, a hard sunset, and Earth up to twenty minutes away." |
| 0:08–0:14 | **Problem** | Zoom out to the Globe view: all of Mars, then the tiny Gale box. | NASA's own words, as a quote card: *"built for regional and global views rather than the hyperlocalized areas astronauts will target"* | "But today's Mars maps show whole regions. Not the few kilometres a crew has to walk, and walk back." |
| 0:14–0:16 | **Product** | Title card, music lifts. | **EVA MISSION PLANNER** | "EVA Mission Planner plans that walk." |
| 0:16–0:28 | **Demo** | Screen recording: pick Pahrump Hills → **Plan this EVA** → SAFE and FAST routes draw on the map → zoom on the route card. | *3 h 41 min · 49 % O₂ at the airlock · GO* | "Pick a science target. It searches NASA's one-metre terrain and returns a safe walk and a fast one: time outside, oxygen left at the airlock, GO or NO-GO." |
| 0:28–0:34 | **Proof** | Curiosity's dashed path under our FAST route, slow zoom along it. | *Within 250 m of Curiosity's real path, 100 % of the way* | "And it holds up: our route tracks the path NASA's Curiosity drivers chose, within 250 metres." |
| 0:34–0:40 | **More** | Four fast cuts, about 1.5 s each: Glen Torridon NO-GO → **Rover assist** → GO · dust-storm simulation · science-gear slider · first-person ride with the O₂ gauge. | *Rover assist · Dust storms · Science gear · First person* | "Rover assist. Dust storms from fifteen years of orbiter records. Carried gear. A first-person walkthrough." |
| 0:40–0:45 | **Close** | End card: logo, team name, challenge, URL. Music resolves. | *Five NASA data layers. One plan.* · Team [TEAM NAME] · Interplanetary Survival Guide: Martian Map · nasa-eva-planner.vercel.app | "Five NASA data layers. One plan. Built for the first crew." |

Product footage runs from 0:14 to 0:40, more than half the video, as the hackathon guides advise.

## B. 30-second cut (≈ 72 words, for the submission form)

| Time | Picture | On-screen text | Voice-over |
|---|---|---|---|
| 0:00–0:07 | 3D push over Mount Sharp | *GALE CRATER, MARS* | "The first astronauts on Mars will step outside with fixed oxygen, a hard sunset, and Earth up to twenty minutes away." |
| 0:07–0:10 | Globe → Gale box | NASA quote card | "Today's maps show regions, not the walk." |
| 0:10–0:22 | Title card → Pahrump Hills → routes → card | **EVA MISSION PLANNER** · *3 h 41 min · 49 % O₂ · GO* | "EVA Mission Planner plans it. Pick a science target, and it computes a safe and a fast route on NASA's one-metre terrain, with oxygen left and a GO or NO-GO." |
| 0:22–0:26 | Curiosity's path under our route | *Within 250 m of Curiosity's path* | "It tracks Curiosity's real path within 250 metres." |
| 0:26–0:30 | End card | Team · challenge · URL | "Built for the first crew." |

---

## Production checklist

1. **Captions burned in.** Judges watch many videos in a row, often muted. Every spoken number also appears on screen.
2. **Record the app at 1920×1080, 60 fps,** browser full-screen, no bookmarks bar, no other tabs. Use smooth cursor moves and zoom in on the route card in the edit.
3. **One voice, one mic,** in a quiet room. Record the voice-over first, then cut the footage to it.
4. **Music:** one royalty-free cinematic track (YouTube Audio Library or Pixabay). Keep it under the voice.
5. **Footage you already have:** the 3D view (Mount Sharp), the Globe button, the route cards, Curiosity's dashed path, Rover assist, the simulator's dust-storm toggle, the science-gear slider, the first-person ride.
6. **Accuracy:**
   - Say "it computes" or "it plans", never "AI". The app uses no AI.
   - "One-metre terrain" is the NASA/USGS source model; the planner works on 25 m cells. Don't say "one-metre routes."
   - Earth–Mars radio delay is 3 to 22 minutes one way, so "up to twenty minutes" is safe.
   - No radiation or space weather: they were removed from the app (a49759a).
7. **Rules:** no people under 18 on screen; team name, members and challenge on the end card; public link, no login.

## Sources

- Challenge text: spaceappschallenge.org/2026/challenges/interplanetary-survival-guide-martian-map (the quote card is from its Background section).
- Judging criteria: Space Apps FAQ (sa-2019.s3.amazonaws.com/media/documents/Space_Apps_FAQ_2019_.pdf); the same five criteria are listed for 2026 by mindshipglobal.com.
- Video structure: Devpost, "6 tips for making a winning hackathon demo video" (info.devpost.com/blog/6-tips-for-making-a-hackathon-demo-video); AngelHack demo tips (angelhack.com/blog/10-tips-to-help-you-rock-your-next-hackathon-demo).
- Numbers: `node planner/scripts/demo-numbers.mjs`, `node planner/scripts/validate-gale.mjs`.
