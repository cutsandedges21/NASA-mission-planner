# Validation: our routes vs the path Curiosity actually drove (T-22)

Reproduce: `node planner/scripts/validate-gale.mjs` (repo root, ~2 s, no internet). Raw numbers: [`docs/validation.json`](validation.json).

## Method (5 lines)

1. Terrain: the baked `gale` region (USGS MSL Gale Merged DEM v3, 1 m source, 25 m cells, plus the steepest slope inside each cell from a 12.5 m grid).
2. Real path: NASA/JPL's MSL waypoint feed (Curiosity's end-of-drive stops, `web/public/data/gale/traverse.json`) from Bradbury Landing until the rover first came within 150 m of the target.
3. Ours: `planMission()` from Bradbury Landing to the same target, all three strategies, default suit model.
4. Cross-track: our path resampled every 10 m, each point's distance to the nearest point on the real polyline.
5. Slopes: both paths sampled every 10 m on the same fine-slope grid.

## Results

**Bradbury Landing → Yellowknife Bay** (real path: 18 rover stops). All three strategies give the same route here: the ground is flat.

| Route | Mean | Median | p90 | Max | ≤ 100 m | ≤ 250 m | Length, ours / rover | Max slope, ours / rover |
|---|---|---|---|---|---|---|---|---|
| SAFE = FAST = SCIENCE | 45 m | 46 m | 70 m | 113 m | 96.2 % | 100 % | 0.42 / 0.39 km | 6.3° / 5.3° |

**Bradbury Landing → Pahrump Hills**, base of Mount Sharp (real path: 242 rover stops, sols 0–753)

| Route | Mean | Median | p90 | Max | ≤ 100 m | ≤ 250 m | Length, ours / rover | Max slope, ours / rover |
|---|---|---|---|---|---|---|---|---|
| SAFE | 105 m | 94 m | 207 m | 311 m | 53.0 % | 93.5 % | 5.92 / 8.41 km | 12.3° / 9.0° |
| FAST | 85 m | 79 m | 162 m | 204 m | 62.1 % | **100 %** | 5.92 / 8.41 km | 12.3° / 9.0° |
| SCIENCE | 105 m | 96 m | 207 m | 311 m | 52.4 % | 93.5 % | 5.92 / 8.41 km | 12.5° / 9.0° |

Neither our routes nor the rover's path touch ground steeper than 15° (0 % on both).

**Why the rover drove farther (8.41 vs 5.92 km):** Curiosity didn't drive straight to Pahrump. It made science stops on the way (Darwin, Cooperstown, the Kimberley), steered around sharp, rocky ground after its wheels started getting punctured in 2013, and followed a science plan, not a single-EVA plan. Our route is the direct walk. The rover's length is measured between end-of-drive stops, so its true driven distance is a little longer still.

**Why the rover's max slope is lower (9.0° vs 12.3°):** wheel care made the drivers avoid even moderate slopes. Our SAFE limit is 15° for a walker, so 12° pitches are acceptable to it. Both are well under the 20° walking limit.

## Energy sanity check

| Route (round trip, on foot) | Walking power | O₂ used | O₂ left at the airlock | Verdict |
|---|---|---|---|---|
| Yellowknife Bay, 0.8 km | 353 W | 0.025 kg | 96 % | GO |
| Pahrump Hills SAFE, 11.8 km, 3 h 41 min | 324 W | 0.306 kg | 49 % | GO |
| Pahrump Hills FAST | 328 W | 0.309 kg | 48 % | GO |
| Pahrump Hills SCIENCE (+20 min of work at the site) | 324 W walking, 313 W overall | 0.322 kg | 46 % | GO |

NASA's Apollo records give an overall average lunar EVA metabolic rate of 234 kcal/h (≈ 272 W), with crew energy use ranging from 822 to 1,267 kJ/h (≈ 228–352 W) across the lunar surface EVAs. **Our 313–353 W is at the top of the Apollo range.** That's expected rather than a bug: Mars gravity (0.38 g) is about 2.3× the Moon's, and the model adds a pressure-suit penalty, so walking costs more than on the Moon. We have not tuned the model to hit a number. Sources: NASA TN D-7883 (Apollo lunar EVA metabolic assessment, https://www.nasa.gov/wp-content/uploads/static/history/alsj/tnD7883Metabolic.pdf) and NASA NTRS 19910001262 (https://ntrs.nasa.gov/api/citations/19910001262/downloads/19910001262.pdf).

## Sensitivity: Bradbury → Pahrump Hills, SAFE

| Carried kit | O₂ capacity 0.5 kg | 0.6 kg (default) | 0.75 kg |
|---|---|---|---|
| 0 kg | CAUTION 39 % | GO 49 % | GO 59 % |
| 10 kg | CAUTION 30 % | GO 41 % | GO 53 % |
| 20 kg | NO-GO 19 % | CAUTION 32 % | GO 46 % |
| 30 kg | NO-GO 5 % | NO-GO 21 % | CAUTION 37 % |

Carrying 20 kg of science gear turns this walk from GO to CAUTION. With 30 kg, it needs a bigger O₂ supply.

## Honest limits

- **25 m cells don't see boulders.** Rocks smaller than a cell are invisible. The rover drivers saw them in 25 cm HiRISE images and in their own cameras.
- **Wheels aren't legs.** The rover's route was shaped by wheel wear, sand traps and comms, and an astronaut's would be shaped by O₂ and fatigue. Close agreement means our cost model finds the same *corridors* NASA's drivers found, not that the two problems are identical.
- **Endpoints are rover stops.** The target positions themselves come from the same NASA waypoint feed (T-21), so arriving at the right place is by construction. The *path in between* is what this test measures.
- **The rover path is a polyline between end-of-drive stops**, so cross-track distances carry an error of a few tens of metres.
- **Two traverses** (Yellowknife Bay and Pahrump Hills) are the only targets inside our box that Curiosity drove to directly from the landing site.

## The pitch sentence (only measured numbers)

> **On the 5.9 km walk to the foot of Mount Sharp, our FAST route stays within 250 m of the path NASA's Curiosity drivers chose for 100 % of its length, and the SAFE route for 93.5 %. On the way to Yellowknife Bay, all three routes stay within 113 m of it.**
