# Datasets & Region (T-04, decided Fri 13 Nov 17:05 by Teammate's Claude)

## Region: Gale Crater, Curiosity field site (region id `gale`)

| | |
|---|---|
| **Region id** | `gale` → `web/public/data/gale/` |
| **Bounds** | lon **137.30 → 137.50 °E**, lat **−4.80 → −4.55 °** (planetocentric, −180..180 east-positive) |
| **Size** | ≈ 11.8 km (E–W) × 14.8 km (N–S). The whole box is a 10–30 km walkable EVA zone |
| **Target grid** | ≈ 25 m cells → **472 × 592** (keep the longest side ≤ 1024 so A* stays under ~1 s in the Worker) |
| **Why here** | ① Gale is a **2015 NASA human Exploration Zone** proposal (workshop abstracts #1022 and #1040, "Gale Crater" in the USGS EZ compilation). It answers challenge objective O2 directly. ② It's the best-mapped ground on Mars: a 1 m merged DEM and a HiRISE colour mosaic made for Curiosity. ③ Every science POI is a place a rover has actually confirmed (habitable lake, clays, hematite), so the SCIENCE route visits real, ground-truthed targets. ④ It's not Jezero, so no overlap with Sol Atlas. |
| **Base / landing site** | Bradbury Landing, 137.4417 °E, −4.5895 ° (Curiosity's 2012 touchdown, a proven safe landing). It sits ~2.3 km inside the north edge of the box. |

## Datasets (all public, all in the USGS bucket the pipeline already uses)

Bucket root: `https://asc-pds-services.s3.us-west-2.amazonaws.com/` (same files are mirrored at `https://planetarymaps.usgs.gov/`).

| Layer → file | Dataset | Mission / instrument | Resolution | Key in bucket |
|---|---|---|---|---|
| `elev.i16`, `slope.png` (**primary**) | **MSL Gale Merged DEM v3** (Parker & Calef, USGS 2016) | HiRISE stereo, falling back to CTX → HRSC → MOLA | 1 m/px | `mosaic/Mars/MSL/MSL_Gale_DEM_Mosaic_1m_v3.tif` (3.6 GB; covers 137.124–137.681 °E, −5.099 → −4.130 °) |
| `elev.i16` (**fallback** if the 1 m read is too slow) | Mars HRSC + MOLA Blended DEM Global v2 | Mars Express HRSC + MGS MOLA | 200 m/px | `mosaic/Mars/HRSC_MOLA_Blend/Mars_HRSC_MOLA_BlendDEM_Global_200mp_v2.tif` |
| `visible.jpg` (**primary**) | MSL Gale HiRISE LRGB colour mosaic (78 quads, COG) | MRO HiRISE | 25 cm/px source | `mosaic/Mars/MSL/MSL_Gale_HiRISE-LRGB_78quads_sharp_cog.tif` (~1 GB COG) |
| `visible.jpg` (fallback) | Viking MDIM 2.1 colour | Viking Orbiter | ~232 m/px | `wms_basemaps/Mars/MDIM21_AMESColor/MDIM21_AMES_recolor_dd360_jpeg_cog.tif` |
| `thermal.jpg` | THEMIS Night IR controlled mosaic v2 | Mars Odyssey THEMIS | 100 m/px | `wms_basemaps/Mars/THEMIS_USGS/THEMIS_NightIR_ControlledMosaics_100m_v2_oct2018_cog.tif` |
| `dust.json` (T-35, Mission simulator) | **Mars Dust Activity Database (MDAD)** v1.0, Battalio & Wang 2021, *Icarus* 354, 114059. CC0. Not in the USGS bucket: Harvard Dataverse [doi:10.7910/DVN/F8R2JX](https://doi.org/10.7910/DVN/F8R2JX) (`MDAD.tab`, 2.4 MB) | MGS MOC + MRO MARCI Mars Daily Global Maps, 14,974 storm-sol records, Mars Years 24–32 | 30° Ls bins over the Gale box centre | `PYTHONUTF8=1 python data/dust_gale.py` (downloads to `data-cache/`). Storm over Gale on at most ~3 % of sols (Ls 270–300), 0 % at Ls 0–150. Approximation: storms as equal-area circles inside their latitude range; planet-encircling storms (MY 25, 28) are undercounted |

Product pages (for `meta.json` → `sources[].url` and the credits panel):
- DEM: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
- HiRISE colour / orthophoto: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm

**Pipeline notes for T-10:**
- The 1 m DEM is in an **equirectangular projection in metres**, not lon/lat degrees like the HRSC blend. Use `rasterio.warp.reproject` onto the lon/lat grid (as `stage_region` does for colour), with `Resampling.average` and an `out_shape` around 472×592, so only overviews or windows get read. Don't call `read()` on the whole file.
- If the 1 m read takes more than ~10 min through the bucket, switch to the 200 m HRSC+MOLA fallback and log it in DECISIONS. Routes still work, and slopes just come out smoother.
- Compute `fineSlope` from the 1 m DEM at a coarser step if time allows (max slope per 25 m cell). That's exactly what `CostGrid` wants.
- The THEMIS night-IR stretch must be local to the box (THEMIS mosaics are normalised image by image).

## Science POIs (`web/public/data/gale/pois.json`, the source of truth: `data/regions/gale.json`)

**Updated Fri 20:25 after T-21:** Yellowknife Bay, Pahrump Hills and Vera Rubin Ridge are now snapped to **Curiosity's real end-of-drive stops** from the NASA/JPL MSL waypoint feed (`data/msl_traverse.mjs`). The old HiRISE image-centre positions were off by 0.8–2.2 km. Glen Torridon and Woodland Bay were already within ~150 m of a real stop and stay marked `approx`.

| id | name | lon °E | lat ° | position | why it matters (one line for the UI) | source |
|---|---|---|---|---|---|---|
| `yellowknife` | Yellowknife Bay | 137.44913 | -4.58948 | real rover stop | Curiosity's first drill holes: mudstone from an ancient freshwater lake that could have supported microbial life | NASA/JPL MSL waypoint feed, rover stop at sol 166 (rover parked here for the Sheepbed drilling campaign, sols 125–297) |
| `pahrump` | Pahrump Hills | 137.37746 | -4.6627 | real rover stop | Base of Mount Sharp: lake-bed layers of the Murray formation, where the rover first drilled into the mountain | NASA/JPL MSL waypoint feed, rover stop at sol 753 (arrival at Pahrump Hills, base of Mount Sharp) |
| `vera-rubin` | Vera Rubin Ridge | 137.37809 | -4.72565 | real rover stop | Hematite-capped ridge mapped from orbit by CRISM. It records groundwater altering old lake sediments | NASA/JPL MSL waypoint feed, rover stop at sol 2128 (rover on the ridge, sols 1800–2300) |
| `glen-torridon` | Glen Torridon (clay unit) | 137.396 | -4.729 | approx. (± ~0.5 km) | The most clay-rich rocks Curiosity has drilled, with sulfur-bearing organic molecules: a prime biosignature target | Glen Torridon ridges study map centre (PMC9286800); USGS 2022 overview |
| `woodland-bay` | Woodland Bay | 137.382 | -4.732 | approx. (± ~0.5 km) | Clay-bearing outcrop with Vera Rubin Ridge to the northwest and active rippled sand nearby | HiRISE ESP_060207_1750 (image centre) |

`source` in `pois.json` = the last column. Curiosity's real drive path inside the box (1,270 stops) is in `web/public/data/gale/traverse.json`.

Suggested demo, **measured on the real terrain with the corrected site positions (Fri 20:40)**, as round trips from Bradbury Landing. Reproduce with `node planner/scripts/validate-gale.mjs` and the T-26 tests.
- → **Pahrump Hills** (5.9 km one way): SAFE/FAST 3 h 41 min, 48–49 % O₂ left, **GO**. SCIENCE adds 20 min of work at the site (46 %, GO). **The headline demo.** Our routes follow Curiosity's real path to within 250 m for 93.5–100 % of the way (docs/VALIDATION.md).
- → **Yellowknife Bay** (0.4 km): a 16-minute walk, 96 % O₂ left. Now that it's at the real rover stop it's very close, so use it as the warm-up click.
- → **Glen Torridon / Vera Rubin Ridge / Woodland Bay** (9.4–10.4 km one way): about 6–6.5 h, 1–9 % O₂ left, **NO-GO** on foot on every route. This is the "planner says no" moment, and with T-23 the "…but GO with a rover" moment.

## What I could not check (Fri 17:05)

- The USGS bucket is unreachable from Teammate's Claude sandbox (proxy 403), so the bucket keys above come from the USGS product pages, not from a listing. The DEM key is confirmed by its product page via `planetarymaps.usgs.gov`, and the colour COG key appears on the orthophoto product page. **T-10's first step:** `rio info` (or `rasterio.open`) each key to confirm it opens.
