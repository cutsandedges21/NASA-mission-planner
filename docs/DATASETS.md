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

Product pages (for `meta.json` → `sources[].url` and the credits panel):
- DEM: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m
- HiRISE colour / orthophoto: https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_orthophoto_mosaic_25cm

**Pipeline notes for T-10:**
- The 1 m DEM is in an **equirectangular projection in metres**, not lon/lat degrees like the HRSC blend. Use `rasterio.warp.reproject` onto the lon/lat grid (as `stage_region` does for colour), with `Resampling.average` and an `out_shape` around 472×592, so only overviews or windows get read. Don't call `read()` on the whole file.
- If the 1 m read takes more than ~10 min through the bucket, switch to the 200 m HRSC+MOLA fallback and log it in DECISIONS. Routes still work, and slopes just come out smoother.
- Compute `fineSlope` from the 1 m DEM at a coarser step if time allows (max slope per 25 m cell). That's exactly what `CostGrid` wants.
- The THEMIS night-IR stretch must be local to the box (THEMIS mosaics are normalised image by image).

## Science POIs (for `pois.json`)

Coordinates are **approximate (± ~0.5 km)**: they're taken from published HiRISE image centres of Curiosity at each site, or from a paper's map centre. Label them "approx." in the UI. T-10 can snap them to the exact traverse if time allows (the MSL traverse is published by NASA/JPL), but they're good enough for routing now.

| id | name | lon °E | lat ° | why it matters (one line for the UI) | source |
|---|---|---|---|---|---|
| `yellowknife` | Yellowknife Bay | 137.453 | −4.626 | Curiosity's first drill holes: mudstone from an ancient freshwater lake that could have supported microbial life | HiRISE ESP_032436_1755 (image centre); NASA MSL |
| `pahrump` | Pahrump Hills | 137.379 | −4.676 | Base of Mount Sharp: lake-bed layers of the Murray formation, where the rover first drilled into the mountain | HiRISE ESP_039280_1755 (image centre) |
| `vera-rubin` | Vera Rubin Ridge | 137.357 | −4.714 | Hematite-capped ridge mapped from orbit by CRISM. It records groundwater altering old lake sediments | HiRISE ESP_052176_1750 (image centre, Curiosity at the ridge) |
| `glen-torridon` | Glen Torridon (clay unit) | 137.396 | −4.729 | The most clay-rich rocks Curiosity has drilled, with sulfur-bearing organic molecules: a prime biosignature target | Map centre in the Glen Torridon ridges study (PMC9286800); USGS 2022 Glen Torridon overview |
| `woodland-bay` | Woodland Bay | 137.382 | −4.732 | Clay-bearing outcrop with Vera Rubin Ridge to the northwest and active rippled sand nearby | HiRISE ESP_060207_1750 (image centre, Curiosity at Woodland Bay) |

`source` in `pois.json` = the short form in the last column.

Suggested demo: base = Bradbury Landing → destination = Glen Torridon (~8.7 km straight line, a realistic single EVA). FAST cuts straight across the plains, SAFE detours around steep ground near the ridge, and SCIENCE stops at Pahrump Hills and/or Vera Rubin Ridge on the way.

## What I could not check (Fri 17:05)

- The USGS bucket is unreachable from Teammate's Claude sandbox (proxy 403), so the bucket keys above come from the USGS product pages, not from a listing. The DEM key is confirmed by its product page via `planetarymaps.usgs.gov`, and the colour COG key appears on the orthophoto product page. **T-10's first step:** `rio info` (or `rasterio.open`) each key to confirm it opens.
