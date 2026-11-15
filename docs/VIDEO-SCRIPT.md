# Video script: EVA Mission Planner

Target 45 s, best 30 s, hard max 60 s. Pace ≈ 150 words a minute, slower in the hook.
Numbers come from `node planner/scripts/demo-numbers.mjs` and `validate-gale.mjs`. If the screen shows a different number, say the screen's number.

⚠️ **Space Apps rule:** a demo *video* must be **30 s or less** or the project is not eligible for Global Judging (docs/SUBMISSION.md). If this video goes in the submission form, use the 30 s cut.

Structure: **Distress → Problem → What we built → Proof it works → What else it does → Close.**

---

## A. 45-second version (≈ 110 words)

| Time | Beat | On screen | Narration |
|---|---|---|---|
| 0:00–0:09 | **Distress** | Black. Heavy breathing in a helmet. An O₂ gauge ticks down to 40 %, turns amber. A sunset clock: 2:00:00 counting down. Cut to a steep ridge, first-person view. | "You're six kilometres from the airlock. Oxygen: forty percent. Sunset in two hours. And the ground ahead is steeper than it looked." |
| 0:09–0:13 | **Problem** | Hard cut to silence. White text on black: *On Mars there is no rescue.* | "On Mars, one bad route and you don't come back." |
| 0:13–0:25 | **What we built** | App: pick Pahrump Hills → **Plan this EVA** → SAFE and FAST routes draw on the HiRISE map, cards show 3 h 41 min · 49 % O₂ · **GO**. | "So we built an EVA planner on real NASA terrain at Gale Crater. Pick a site, and it finds a safe route and a fast one: time outside, oxygen left, GO or NO-GO." |
| 0:25–0:32 | **Proof** | Curiosity's dashed drive path under our FAST route. On-screen text: *within 250 m for 100 % of the route.* | "And our route stays within 250 metres of the path NASA's Curiosity drivers actually chose." |
| 0:32–0:42 | **What else** | Fast cuts, ~2 s each: Glen Torridon NO-GO → **Rover assist** → GO · tick **What if a dust storm hits?** · first-person ride over the terrain with the O₂ gauge. | "Too far to walk? Switch to the rover. Dust storm? Simulate it from fifteen years of NASA storm records. Then ride the walk in first person." |
| 0:42–0:45 | **Close** | Logo + *nasa-eva-planner.vercel.app* + team name. | "Plan the walk. Make it home." |

## B. 30-second cut (≈ 70 words, submission-safe)

| Time | Beat | On screen | Narration |
|---|---|---|---|
| 0:00–0:06 | Distress | O₂ gauge dropping to 40 %, sunset countdown, helmet breathing. | "Six kilometres from the airlock. Oxygen: forty percent. Sunset in two hours." |
| 0:06–0:09 | Problem | Black, white text. | "On Mars, one bad route and you don't come back." |
| 0:09–0:19 | What we built | Pick Pahrump Hills → SAFE + FAST routes → GO card. | "Our planner runs on real NASA terrain at Gale Crater. Pick a site: it finds a safe and a fast route, oxygen left, GO or NO-GO." |
| 0:19–0:23 | Proof | Curiosity's path under our route. | "It matches the path Curiosity's drivers chose, within 250 metres." |
| 0:23–0:30 | What else + close | Rover → dust storm → first-person, 1 s each, then logo + URL. | "Rover mode. Dust storms. A first-person ride. Plan the walk. Make it home." |

---

## Recording notes

- **The hook carries the video.** Record it slow, low voice, with breathing under it. Everything after it can be faster.
- **Hook footage:** the first-person ride already has an O₂ gauge. Start it on a long route (Glen Torridon on foot) so the gauge is low and the terrain is steep. No new footage needed.
- **No people under 18 on screen** (Space Apps rule).
- **Don't say "AI plans your route."** The app uses no AI; the routes are computed. "It finds" / "it computes" is accurate.
- Say "real NASA terrain", not "real ground": close-up rocks in first person are decorative.
- Radiation and space weather were removed from the app (a49759a), so they're left out of the script.
