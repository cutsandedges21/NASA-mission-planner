// Loads a region in the data-contract format (docs/ARCHITECTURE.md) and converts lon/lat <-> grid cells.

export type Poi = { id: string; name: string; lon: number; lat: number; why: string; source: string; /** true = position only approximate (not snapped to a NASA rover stop) */ approx?: boolean };
export type RegionMeta = {
  id: string;
  name: string;
  synthetic?: boolean;
  lon: [number, number];
  lat: [number, number];
  width: number;
  height: number;
  cellM: [number, number];
  elevRange: [number, number];
  base?: { id: string; name: string; lon: number; lat: number };
  sources: { layer: string; dataset: string; mission: string; url: string }[];
};
export type Region = {
  meta: RegionMeta;
  elev: Float32Array;
  fineSlope: Float32Array | null;
  pois: Poi[];
  /** Curiosity's real drive path inside the region, for drawing: NASA/JPL's detailed MSL traverse line
   *  (traverse-detail.json, T-34) when the region has it, else the end-of-drive stops (traverse.json). */
  traverse: GeoJSON.GeoJSON | null;
  url: (file: string) => string;
};

/** Real NASA data by default. `?region=demo` (synthetic terrain) is kept for testing; NEXT_PUBLIC_REGION overrides the build default. */
export const REGION_ID = process.env.NEXT_PUBLIC_REGION ?? 'gale';

async function loadSlope(url: string, w: number, h: number): Promise<Float32Array | null> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(img, 0, 0, w, h);
    const px = ctx.getImageData(0, 0, w, h).data;
    const out = new Float32Array(w * h);
    for (let i = 0; i < out.length; i++) out[i] = px[i * 4] / 4; // degrees × 4 in 8-bit grey
    return out;
  } catch {
    return null;
  }
}

/** The detailed line looks like NASA's own maps; the stops file is the fallback (and what the planner validation uses). */
async function loadTraverse(url: (file: string) => string): Promise<GeoJSON.GeoJSON | null> {
  for (const file of ['traverse-detail.json', 'traverse.json']) {
    const t = await fetch(url(file)).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    if (t) return t;
  }
  return null;
}

export async function loadRegion(id = new URLSearchParams(window.location.search).get('region') ?? REGION_ID): Promise<Region> {
  const url = (file: string) => `/data/${id}/${file}`;
  const meta: RegionMeta = await (await fetch(url('meta.json'))).json();
  const [buf, pois, fineSlope, traverse] = await Promise.all([
    fetch(url('elev.i16')).then((r) => r.arrayBuffer()),
    fetch(url('pois.json')).then((r) => (r.ok ? r.json() : [])),
    loadSlope(url('slope.png'), meta.width, meta.height),
    loadTraverse(url),
  ]);
  const i16 = new Int16Array(buf);
  const elev = Float32Array.from(i16);
  return { meta, elev, fineSlope, pois, traverse, url };
}

/** lon/lat → grid cell [x, y] (row 0 = north), or null if outside the region. */
export function toCell(m: RegionMeta, lon: number, lat: number): [number, number] | null {
  const x = Math.floor(((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * m.width);
  const y = Math.floor(((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * m.height);
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  return [x, y];
}

/** grid cell centre → [lon, lat] */
export function toLonLat(m: RegionMeta, x: number, y: number): [number, number] {
  return [
    m.lon[0] + ((x + 0.5) / m.width) * (m.lon[1] - m.lon[0]),
    m.lat[1] - ((y + 0.5) / m.height) * (m.lat[1] - m.lat[0]),
  ];
}

/** Image-source corners for MapLibre: top-left, top-right, bottom-right, bottom-left. */
export function corners(m: RegionMeta): [[number, number], [number, number], [number, number], [number, number]] {
  return [
    [m.lon[0], m.lat[1]],
    [m.lon[1], m.lat[1]],
    [m.lon[1], m.lat[0]],
    [m.lon[0], m.lat[0]],
  ];
}
