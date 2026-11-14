// Radiation map type: NASA/JPL/JSC PIA03480 worldwide (reprojected by data/radiation_map.py) and, over the
// planning region, the dose rate the planner uses, from the 1 m DEM elevation (planner/src/radiation.js).
import { doseRateMSvDay } from '../../planner/src/radiation.js';

/** The colour bar of PIA03480 (jet-like), dark blue = low dose → dark red = high. */
const STOPS: [number, [number, number, number]][] = [
  [0, [0, 0, 143]], [0.125, [0, 0, 255]], [0.375, [0, 255, 255]], [0.625, [255, 255, 0]], [0.875, [255, 0, 0]], [1, [128, 0, 0]],
];
export const RAD_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

function colour(t: number): [number, number, number] {
  const k = Math.max(0, STOPS.findIndex((s, j) => j < STOPS.length - 1 && t <= STOPS[j + 1][0]));
  const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
  const f = Math.max(0, Math.min(1, (t - t0) / (t1 - t0)));
  return [0, 1, 2].map((i) => c0[i] + (c1[i] - c0[i]) * f) as [number, number, number];
}

/** Dose rate (mSv per Earth day) at an elevation in metres: Curiosity RAD's 0.64, scaled with PIA03480. */
export const radRate = (elevM: number): number => doseRateMSvDay(elevM);

/** Region overlay: dose rate per cell, colours stretched over the region's own range (returned for the legend). */
export async function radiationColourUrl(elev: Float32Array, w: number, h: number): Promise<{ url: string; lo: number; hi: number }> {
  let zLo = Infinity, zHi = -Infinity;
  for (const z of elev) { if (z < zLo) zLo = z; if (z > zHi) zHi = z; }
  const lo = radRate(zLo), hi = radRate(zHi);
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < elev.length; i++) {
    const [r, g, b] = colour((radRate(elev[i]) - lo) / (hi - lo || 1));
    img.data[i * 4] = r; img.data[i * 4 + 1] = g; img.data[i * 4 + 2] = b; img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return { url: URL.createObjectURL(await c.convertToBlob({ type: 'image/png' })), lo, hi };
}

/** Image-source corners of /data/mars/radiation.png (Web Mercator, whole planet to ±85°). */
export const RAD_GLOBAL_CORNERS: [[number, number], [number, number], [number, number], [number, number]] = [
  [-179.999, 84.99], [179.999, 84.99], [179.999, -84.99], [-179.999, -84.99],
];
export const RAD_GLOBAL_URL = '/data/mars/radiation.png';
