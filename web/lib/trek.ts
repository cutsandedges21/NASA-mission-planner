// NASA Mars Trek global layers in MapLibre, without Trek's heavy 3D viewer (T-33).
// Trek serves equirectangular WMTS tiles (https://trek.nasa.gov/tiles/Mars/EQ/...; CORS *). MapLibre wants
// Web Mercator, so the `trek://` protocol reprojects on a canvas: longitude maps 1:1, latitude in 16
// horizontal strips (error well under a pixel). Only tiles in view are built, the browser caches
// Trek's responses, and MapLibre overzooms past each layer's native level, so the CPU idles once the map is still.
import * as maplibregl from 'maplibre-gl';

const TREK = 'https://trek.nasa.gov/tiles/Mars/EQ';
const SIZE = 256;
const STRIPS = 16;

export type MapType = 'colour' | 'height' | 'thermal' | 'slope' | 'radiation';

export type TrekLayer = { layer: string; ext: 'jpg' | 'png'; maxL: number; name: string; credit: string; palette?: boolean };

/** Global NASA layers behind each map type (the Gale region's own layers sit on top). Max levels checked Sat 14 Nov. */
export const TREK_LAYERS: Record<'colour' | 'height' | 'thermal', TrekLayer> = {
  colour: { layer: 'Mars_Viking_MDIM21_ClrMosaic_global_232m', ext: 'jpg', maxL: 7, name: 'Viking MDIM 2.1 colour mosaic, 232 m', credit: 'NASA/USGS Viking MDIM 2.1 via NASA Mars Trek' },
  height: { layer: 'Mars_MGS_MOLA_ClrShade_merge_global_463m', ext: 'jpg', maxL: 7, name: 'MGS MOLA colour shaded relief, 463 m', credit: 'NASA MGS MOLA via NASA Mars Trek' },
  thermal: { layer: 'THEMIS_DayIR_ControlledMosaics_100m_v2_oct2018', ext: 'png', maxL: 9, name: 'Mars Odyssey THEMIS day IR, 100 m', credit: 'NASA/ASU Mars Odyssey THEMIS via NASA Mars Trek / USGS Astrogeology', palette: true },
};

/** MapLibre raster source for a Trek layer (overzoomed by MapLibre beyond its native level). */
export function trekSource(key: keyof typeof TREK_LAYERS): maplibregl.RasterSourceSpecification {
  const t = TREK_LAYERS[key];
  return { type: 'raster', tiles: [`trek://${key}/{z}/{x}/{y}`], tileSize: SIZE, maxzoom: t.maxL + 1, attribution: t.credit };
}

// --- false colour for IR brightness (dark = cold → bright = warm), 256-entry LUT -------------------------------
const STOPS: [number, [number, number, number]][] = [
  [0, [12, 7, 40]], [0.25, [86, 16, 110]], [0.5, [187, 55, 84]], [0.75, [249, 142, 9]], [1, [252, 255, 164]],
];
export const THERMAL_LUT = (() => {
  const lut = new Uint8Array(256 * 3);
  for (let i = 0; i < 256; i++) {
    const t = i / 255;
    const k = Math.min(STOPS.length - 2, STOPS.findIndex((s, j) => j < STOPS.length - 1 && t <= STOPS[j + 1][0]));
    const [t0, c0] = STOPS[k], [t1, c1] = STOPS[k + 1];
    const f = (t - t0) / (t1 - t0);
    for (let c = 0; c < 3; c++) lut[i * 3 + c] = Math.round(c0[c] + (c1[c] - c0[c]) * f);
  }
  return lut;
})();
/** CSS gradient matching THERMAL_LUT, for legends. */
export const THERMAL_GRADIENT = `linear-gradient(90deg, ${STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

function colourise(img: ImageData) {
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i];
    d[i] = THERMAL_LUT[v * 3]; d[i + 1] = THERMAL_LUT[v * 3 + 1]; d[i + 2] = THERMAL_LUT[v * 3 + 2];
  }
}

/** False-colour a greyscale image (e.g. the region's THEMIS night-IR thermal.jpg). Returns a blob URL. */
export async function falseColourUrl(url: string): Promise<string> {
  const bmp = await createImageBitmap(await (await fetch(url)).blob());
  const c = new OffscreenCanvas(bmp.width, bmp.height);
  const ctx = c.getContext('2d')!;
  ctx.drawImage(bmp, 0, 0);
  const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
  colourise(img);
  ctx.putImageData(img, 0, 0);
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }));
}

// --- source tiles ------------------------------------------------------------------------------------------------
const cache = new Map<string, Promise<ImageBitmap | null>>();
function srcTile(t: TrekLayer, L: number, r: number, c: number): Promise<ImageBitmap | null> {
  const url = `${TREK}/${t.layer}/1.0.0/default/default028mm/${L}/${r}/${c}.${t.ext}`;
  let p = cache.get(url);
  if (!p) {
    p = fetch(url)
      .then((res) => (res.ok ? res.blob().then((b) => createImageBitmap(b)) : null))
      .catch(() => null);
    cache.set(url, p);
    if (cache.size > 256) cache.delete(cache.keys().next().value!); // small LRU-ish bound on decoded tiles
  }
  return p;
}

const latOf = (yNorm: number) => (Math.atan(Math.sinh(Math.PI * (1 - 2 * yNorm))) * 180) / Math.PI;

async function mercTile(key: keyof typeof TREK_LAYERS, z: number, x: number, y: number): Promise<ArrayBuffer> {
  const t = TREK_LAYERS[key];
  const n = 2 ** z;
  const L = Math.max(0, Math.min(t.maxL, z - 1)); // EQ level with about the same pixel size
  const pxPerDeg = (2 ** L * SIZE) / 180;
  const lon0 = (x / n) * 360 - 180, lon1 = ((x + 1) / n) * 360 - 180;
  const sx0 = (lon0 + 180) * pxPerDeg, sx1 = (lon1 + 180) * pxPerDeg;
  // plan every strip's draws first, fetch all needed source tiles at once
  type Draw = { r: number; c: number; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number };
  const draws: Draw[] = [];
  for (let s = 0; s < STRIPS; s++) {
    const py0 = (s * SIZE) / STRIPS, py1 = ((s + 1) * SIZE) / STRIPS;
    const sy0 = (90 - latOf((y + py0 / SIZE) / n)) * pxPerDeg;
    const sy1 = (90 - latOf((y + py1 / SIZE) / n)) * pxPerDeg;
    for (let r = Math.floor(sy0 / SIZE); r <= Math.floor((sy1 - 1e-6) / SIZE); r++) {
      for (let c = Math.floor(sx0 / SIZE); c <= Math.floor((sx1 - 1e-6) / SIZE); c++) {
        const ix0 = Math.max(sx0, c * SIZE), ix1 = Math.min(sx1, (c + 1) * SIZE);
        const iy0 = Math.max(sy0, r * SIZE), iy1 = Math.min(sy1, (r + 1) * SIZE);
        if (ix1 <= ix0 || iy1 <= iy0) continue;
        draws.push({
          r, c, sx: ix0 - c * SIZE, sy: iy0 - r * SIZE, sw: ix1 - ix0, sh: iy1 - iy0,
          dx: ((ix0 - sx0) / (sx1 - sx0)) * SIZE, dw: ((ix1 - ix0) / (sx1 - sx0)) * SIZE,
          dy: py0 + ((iy0 - sy0) / (sy1 - sy0)) * (py1 - py0), dh: ((iy1 - iy0) / (sy1 - sy0)) * (py1 - py0),
        });
      }
    }
  }
  const keys = [...new Set(draws.map((d) => `${d.r}/${d.c}`))];
  const imgs = new Map(await Promise.all(keys.map(async (k) => {
    const [r, c] = k.split('/').map(Number);
    return [k, await srcTile(t, L, r, c)] as const;
  })));
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d', { willReadFrequently: !!t.palette })!;
  for (const d of draws) {
    const img = imgs.get(`${d.r}/${d.c}`);
    if (img) ctx.drawImage(img, d.sx, d.sy, d.sw, d.sh, d.dx, d.dy, d.dw + 0.01, d.dh + 0.6); // +0.6 hides strip seams
  }
  if (t.palette) {
    const img = ctx.getImageData(0, 0, SIZE, SIZE);
    colourise(img);
    ctx.putImageData(img, 0, 0);
  }
  const blob = await canvas.convertToBlob(t.ext === 'png' ? { type: 'image/png' } : { type: 'image/jpeg', quality: 0.88 });
  return blob.arrayBuffer();
}

let registered = false;
/** Register trek://<colour|height|thermal>/{z}/{x}/{y}. Safe to call more than once. */
export function registerTrek() {
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('trek', async (params: maplibregl.RequestParameters) => {
    const m = /trek:\/\/(\w+)\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m || !(m[1] in TREK_LAYERS)) throw new Error(`bad trek url ${params.url}`);
    return { data: await mercTile(m[1] as keyof typeof TREK_LAYERS, +m[2], +m[3], +m[4]) };
  });
}

// --- approximate elevation anywhere on Mars (MOLA 8-bit, Trek) -------------------------------------------------
// Trek's Mars_MGS_MOLA_DEM_mosaic_global_463m_8 is an 8-bit stretch of the MOLA DEM (native level 5).
// Linear fit against known heights (Olympus Mons 21,229 m, Arsia 17,761, Elysium 14,028, Hellas −7,152, Gale −4,501):
// metres ≈ −8,897 + 123.7 × DN, residuals within ±0.5 km (measured Sat 14 Nov). Used only outside the region's 1 m DEM.
const MOLA8 = { layer: 'Mars_MGS_MOLA_DEM_mosaic_global_463m_8', L: 5, a: -8897, b: 123.7 };
export const MOLA8_ERR_M = 500;
const molaCache = new Map<string, Promise<Uint8ClampedArray | null>>();

function molaTile(r: number, c: number) {
  const k = `${r}/${c}`;
  let p = molaCache.get(k);
  if (!p) {
    p = fetch(`${TREK}/${MOLA8.layer}/1.0.0/default/default028mm/${MOLA8.L}/${r}/${c}.png`)
      .then((res) => (res.ok ? res.blob() : null))
      .then(async (b) => {
        if (!b) return null;
        const bmp = await createImageBitmap(b);
        const cv = new OffscreenCanvas(SIZE, SIZE);
        const ctx = cv.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(bmp, 0, 0);
        return ctx.getImageData(0, 0, SIZE, SIZE).data;
      })
      .catch(() => null);
    molaCache.set(k, p);
  }
  return p;
}

/** Elevation (m, MOLA areoid) at lon/lat from the 8-bit MOLA mosaic, ±0.5 km; null if unavailable. */
export function molaElevation(lon: number, lat: number): Promise<number | null> {
  const n = 2 ** MOLA8.L * SIZE;
  const X = Math.floor(((((lon + 180) % 360) + 360) % 360) / 360 * 2 * n);
  const Y = Math.min(n - 1, Math.max(0, Math.floor(((90 - lat) / 180) * n)));
  const r = Math.floor(Y / SIZE), c = Math.floor(X / SIZE);
  const read = (d: Uint8ClampedArray | null) => {
    if (!d) return null;
    const i = ((Y % SIZE) * SIZE + (X % SIZE)) * 4;
    return d[i + 3] ? MOLA8.a + MOLA8.b * d[i] : null;
  };
  return molaTile(r, c).then(read);
}

// --- the region's own elevation as a colour relief (same ramp as the HoverReadout legend) ----------------------
const HEIGHT_STOPS: [number, [number, number, number]][] = [
  [0, [43, 42, 143]], [0.2, [47, 127, 208]], [0.4, [63, 181, 122]], [0.6, [233, 216, 74]], [0.8, [217, 84, 47]], [1, [243, 233, 228]],
];
export const HEIGHT_GRADIENT = `linear-gradient(90deg, ${HEIGHT_STOPS.map(([t, c]) => `rgb(${c.join(',')}) ${t * 100}%`).join(', ')})`;

/** Colour-relief PNG of an elevation grid (row 0 = north), stretched between its 1st and 99th percentile. Returns a blob URL. */
export async function elevationColourUrl(elev: Float32Array, w: number, h: number): Promise<string> {
  const sorted = Float32Array.from(elev).sort();
  const lo = sorted[Math.floor(sorted.length * 0.01)], hi = sorted[Math.floor(sorted.length * 0.99)];
  const c = new OffscreenCanvas(w, h);
  const ctx = c.getContext('2d')!;
  const img = ctx.createImageData(w, h);
  for (let i = 0; i < elev.length; i++) {
    const t = Math.max(0, Math.min(1, (elev[i] - lo) / (hi - lo || 1)));
    const k = Math.min(HEIGHT_STOPS.length - 2, Math.floor(t * (HEIGHT_STOPS.length - 1)));
    const [t0, c0] = HEIGHT_STOPS[k], [t1, c1] = HEIGHT_STOPS[k + 1];
    const f = (t - t0) / (t1 - t0);
    img.data[i * 4] = c0[0] + (c1[0] - c0[0]) * f;
    img.data[i * 4 + 1] = c0[1] + (c1[1] - c0[1]) * f;
    img.data[i * 4 + 2] = c0[2] + (c1[2] - c0[2]) * f;
    img.data[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return URL.createObjectURL(await c.convertToBlob({ type: 'image/png' }));
}
