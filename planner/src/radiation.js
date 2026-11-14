// Surface radiation (galactic cosmic rays) as a function of elevation, for the dose map and the router.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
//
// Where the numbers come from (reproduce with `python data/radiation_map.py`):
// - NASA/JPL/JSC PIA03480 "Estimated Radiation Dosage on Mars" (2002): annual GCR dose equivalent at the
//   surface, 10–20 rem/yr, from Mars Odyssey MARIE + MGS MOLA elevations. Lower ground has more atmosphere
//   overhead, so it gets less dose.
// - We read ~360,000 pixels of that map back to rem/yr (shading-invariant match against its colour bar) and
//   paired each with MGS MOLA elevation (MEGDR 4 px/deg). Least-squares fit, -7 to +3 km, R² = 0.96:
//       dose(z) = 16.04 rem/yr × exp(0.0494 × z_km)   → +5.1 % dose rate per km of altitude.
// - The absolute rate stays the one Curiosity's RAD measured in Gale (0.64 mSv/day, Hassler et al. 2014), at
//   ~-4,500 m (Bradbury Landing to Yellowknife Bay, sols 1–300). The map only supplies how the rate changes
//   with altitude. In Gale (-4,529 to -2,725 m) that's about 9 % from the crater floor to the highest cells.
// Not modelled: shielding by nearby cliffs (less open sky), solar particle events (see space weather).
import { RAD_MSV_PER_DAY } from './eva.js';

/** Fit to PIA03480 vs MOLA: rem/yr = RAD_FIT.a × exp(RAD_FIT.kPerKm × z_km). */
export const RAD_FIT = { a: 16.04, kPerKm: 0.0494, r2: 0.96, zRangeKm: [-7, 3], source: 'NASA/JPL/JSC PIA03480 × MGS MOLA' };
/** Elevation (m) where Curiosity's RAD measured RAD_MSV_PER_DAY (Bradbury Landing ≈ -4,502 m in the MSL DEM). */
export const RAD_REF_ELEV_M = -4500;
/**
 * SAFE route: the step cost is multiplied by (dose rate / lowest dose rate in the region)^RAD_AVOID, so it
 * prefers lower, better-shielded ground. 1 = dose counted at its true size, no amplification.
 * Checked on Gale (Sat 14 Nov): along every route to the five science sites the rate varies < 2 % (routes stay on
 * the crater floor), so SAFE routes don't change; forcing a bigger weight (60) made detours that *raised* the dose
 * (more time outside). Avoidance matters for targets up on Mount Sharp. Override with params.radAvoid.
 */
export const RAD_AVOID = 1;

const K_PER_M = RAD_FIT.kPerKm / 1000;

/** Dose rate (mSv per Earth day) at elevation zM, scaled from Curiosity's measured 0.64 at RAD_REF_ELEV_M. */
export const doseRateMSvDay = (zM) => RAD_MSV_PER_DAY * Math.exp(K_PER_M * (zM - RAD_REF_ELEV_M));

/** Same in rem/yr straight from the PIA03480 fit (the map's own scale; it predates RAD and reads lower). */
export const mapDoseRemYr = (zM) => RAD_FIT.a * Math.exp(K_PER_M * zM);

/** Multiplier ≥ 1 for one cell vs the lowest cell (keeps A* admissible). */
export const relRate = (zM, zMinM) => Math.exp(K_PER_M * (zM - zMinM));

/**
 * Dose (mSv) for a budgeted route: each walked segment at the rate of its mean elevation, each stop at the
 * rate where it happens. Mirrors budget() in eva.js (segments with dd <= 0 are skipped there too).
 * @param {Array<{d:number,e:number}>} samples   the samples passed to budget()
 * @param {Array<{t:number}>} timeline           budget().timeline (one entry per walked segment, plus t = 0)
 * @param {number[]} stopElevs                   elevation (m) at each stop
 * @param {number} stopS                         seconds spent at each stop
 */
export function routeDoseMSv(samples, timeline, stopElevs, stopS) {
  let dose = 0;
  let k = 1;
  for (let i = 1; i < samples.length && k < timeline.length; i++) {
    if (samples[i].d - samples[i - 1].d <= 0) continue;
    const dt = timeline[k].t - timeline[k - 1].t;
    dose += (doseRateMSvDay((samples[i].e + samples[i - 1].e) / 2) * dt) / 86400;
    k++;
  }
  for (const z of stopElevs) dose += (doseRateMSvDay(z) * stopS) / 86400;
  return dose;
}
