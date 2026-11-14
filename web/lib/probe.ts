// What the hover readout shows for one point: coordinates, elevation, and a modelled surface temperature (T-33).
// Elevation: the region's 1 m NASA DEM (resampled to 25 m) inside the region, Trek's MOLA mosaic (±0.5 km) outside.
// Temperature: there is no live, calibrated temperature map of Mars, so this is a MODEL, labelled as such:
//   - Curiosity REMS ground-temperature sensor at Gale: a typical sol runs from ~188 K (−85 °C) just before sunrise
//     to ~268 K (−5 °C) around 13:00 local solar time (Martínez et al. 2017, Space Sci. Rev. 212; Hamilton et al. 2014).
//   - Other latitudes: the daytime peak scales with noon insolation (T ∝ cos(zenith)^¼, radiative balance).
//   - Inside the region, the night side is nudged by THEMIS night-IR brightness (bright at night = high thermal
//     inertia = rock/bedrock that stays warmer; dark = dust/sand that cools faster), at most ±8 K.
import { marsTime, localTime, dayLength } from './marstime';
import { molaElevation, MOLA8_ERR_M } from './trek';
import type { Region } from './region';

const DEG = Math.PI / 180;
const GALE_LAT = -4.59;
const T_MIN = 188, T_MAX = 268, T_PEAK_H = 13;
const NIGHT_NUDGE_K = 8;
export const TEMP_MODEL_ERR_C = 15;

export type Probe = {
  lon: number; lat: number;
  elevM: number | null;
  elevSrc: 'dem' | 'mola' | null;
  tempC: number;
  ltst: number;
  inRegion: boolean;
};

let thermal: { w: number; h: number; d: Float32Array } | null = null;
let thermalFor: string | null = null;

/** Load the region's THEMIS night-IR brightness once (z-scores), for the night-side temperature nudge. */
export async function loadThermal(region: Region) {
  const url = region.url('thermal.jpg');
  if (thermalFor === url) return;
  thermalFor = url;
  try {
    const m = region.meta;
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    const c = new OffscreenCanvas(m.width, m.height);
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(bmp, 0, 0, m.width, m.height);
    const px = ctx.getImageData(0, 0, m.width, m.height).data;
    const v = new Float32Array(m.width * m.height);
    let s = 0, s2 = 0;
    for (let i = 0; i < v.length; i++) { v[i] = px[i * 4]; s += v[i]; s2 += v[i] * v[i]; }
    const mean = s / v.length, sd = Math.sqrt(Math.max(1e-6, s2 / v.length - mean * mean));
    for (let i = 0; i < v.length; i++) v[i] = Math.max(-2, Math.min(2, (v[i] - mean) / sd)) / 2; // −1..1
    thermal = { w: m.width, h: m.height, d: v };
  } catch {
    thermal = null;
  }
}

function cellOf(region: Region, lon: number, lat: number): [number, number] | null {
  const m = region.meta;
  const fx = ((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * m.width;
  const fy = ((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * m.height;
  return fx >= 0 && fy >= 0 && fx < m.width && fy < m.height ? [fx, fy] : null;
}

function demAt(region: Region, fx: number, fy: number): number {
  const m = region.meta, e = region.elev, w = m.width;
  const cx = Math.min(w - 1, Math.max(0, fx - 0.5)), cy = Math.min(m.height - 1, Math.max(0, fy - 0.5));
  const x0 = Math.floor(cx), y0 = Math.floor(cy), x1 = Math.min(w - 1, x0 + 1), y1 = Math.min(m.height - 1, y0 + 1);
  const tx = cx - x0, ty = cy - y0;
  return e[y0 * w + x0] * (1 - tx) * (1 - ty) + e[y0 * w + x1] * tx * (1 - ty) + e[y1 * w + x0] * (1 - tx) * ty + e[y1 * w + x1] * tx * ty;
}

/** Modelled ground temperature (K) at a latitude and local true solar time. `nudge` in −1..1 (night side only). */
export function modelSurfaceK(lat: number, ltst: number, decl: number, nudge = 0): number {
  const { rise, set } = dayLength(lat, decl);
  const noonCos = Math.cos((lat - decl) * DEG), galeCos = Math.cos((GALE_LAT - decl) * DEG);
  if (set - rise <= 0.01 || noonCos <= 0) return Math.max(148, T_MIN - 30); // polar night: down toward CO₂ frost point
  const peak = Math.max(T_MIN + 5, T_MAX * Math.pow(Math.max(0.02, noonCos) / galeCos, 0.25));
  const peakH = Math.min(T_PEAK_H, (rise + set) / 2 + 1);
  const tSet = T_MIN + 0.35 * (peak - T_MIN);
  let T: number, night: number;
  if (ltst >= rise && ltst <= peakH) {
    T = T_MIN + (peak - T_MIN) * Math.sin((Math.PI / 2) * ((ltst - rise) / (peakH - rise)));
    night = 1 - (ltst - rise) / (peakH - rise);
  } else if (ltst > peakH && ltst <= set) {
    T = tSet + (peak - tSet) * Math.cos((Math.PI / 2) * ((ltst - peakH) / (set - peakH)));
    night = 0.3 * ((ltst - peakH) / (set - peakH));
  } else {
    const nightLen = 24 - (set - rise);
    const since = (ltst - set + 24) % 24;
    T = T_MIN + (tSet - T_MIN) * Math.exp((-3 * since) / nightLen);
    night = 1;
  }
  return T + NIGHT_NUDGE_K * nudge * night;
}

/** Everything the readout needs for one point. Elevation outside the region may arrive later (MOLA tile fetch). */
export function probe(region: Region | null, lon: number, lat: number, ms = Date.now()): { now: Probe; later?: Promise<number | null> } {
  const mt = marsTime(ms);
  const { ltst } = localTime(mt, ((lon % 360) + 360) % 360);
  const cell = region ? cellOf(region, lon, lat) : null;
  let nudge = 0, elevM: number | null = null, elevSrc: Probe['elevSrc'] = null, later: Promise<number | null> | undefined;
  if (cell && region) {
    elevM = demAt(region, cell[0], cell[1]);
    elevSrc = 'dem';
    if (thermal) nudge = thermal.d[Math.min(thermal.h - 1, Math.floor(cell[1])) * thermal.w + Math.min(thermal.w - 1, Math.floor(cell[0]))];
  } else {
    later = molaElevation(lon, lat);
    elevSrc = 'mola';
  }
  const tempC = modelSurfaceK(lat, ltst, mt.decl, nudge) - 273.15;
  return { now: { lon, lat, elevM, elevSrc, tempC, ltst, inRegion: !!cell }, later };
}

export { MOLA8_ERR_M };
