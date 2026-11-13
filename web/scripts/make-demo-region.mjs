// Writes a SYNTHETIC stand-in for the Gale region in the data-contract format (docs/ARCHITECTURE.md),
// so the UI can be built before the real NASA data (T-10) lands. Same bounds + grid as the real `gale`
// region, so swapping is a one-word change. Terrain is invented, loosely shaped like Gale: crater-floor
// plains in the north, rising toward Mount Sharp in the south, with an E–W ridge and a few craters.
//
// Run from web/:  node scripts/make-demo-region.mjs   → public/data/demo/
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import jpeg from 'jpeg-js';

const OUT = path.join(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1')), '..', 'public', 'data', 'demo');
fs.mkdirSync(OUT, { recursive: true });

const LON = [137.30, 137.50], LAT = [-4.80, -4.55];
const W = 472, H = 592;
const M_PER_DEG = 59274.7; // Mars radius 3396.19 km
const cellX = ((LON[1] - LON[0]) * M_PER_DEG * Math.cos(((LAT[0] + LAT[1]) / 2) * Math.PI / 180)) / W;
const cellY = ((LAT[1] - LAT[0]) * M_PER_DEG) / H;

// value noise
let seed = 1337;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const G = 64, grid = Array.from({ length: (G + 1) * (G + 1) }, rnd);
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, y) {
  const xi = Math.floor(x) & (G - 1), yi = Math.floor(y) & (G - 1), xf = x - Math.floor(x), yf = y - Math.floor(y);
  const a = grid[yi * (G + 1) + xi], b = grid[yi * (G + 1) + xi + 1], c = grid[(yi + 1) * (G + 1) + xi], d = grid[(yi + 1) * (G + 1) + xi + 1];
  const u = smooth(xf), v = smooth(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
const fbm = (x, y) => { let s = 0, amp = 1, f = 1; for (let o = 0; o < 5; o++) { s += amp * noise(x * f, y * f); amp *= 0.5; f *= 2; } return s / 1.94; };

const lonOf = (x) => LON[0] + ((x + 0.5) / W) * (LON[1] - LON[0]);
const latOf = (y) => LAT[1] - ((y + 0.5) / H) * (LAT[1] - LAT[0]); // row 0 = north
const cellOf = (lon, lat) => [Math.round(((lon - LON[0]) / (LON[1] - LON[0])) * W - 0.5), Math.round(((LAT[1] - lat) / (LAT[1] - LAT[0])) * H - 0.5)];

const craters = Array.from({ length: 14 }, () => ({ x: rnd() * W, y: rnd() * H, r: 6 + rnd() * 22 }));
const elev = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const s = y / H; // 0 north … 1 south
  let e = -4500 + 900 * Math.pow(s, 2.2);                      // plains rising toward Mount Sharp
  const ridgeY = cellOf(137.357, -4.714)[1];
  e += 120 / (1 + Math.exp(-(y - ridgeY) / 3)) * (0.6 + 0.4 * noise(x / 40, 7)); // ridge with a steep north face
  e += 60 * (fbm(x / 60, y / 60) - 0.5) + 12 * (fbm(x / 8, y / 8) - 0.5);
  for (const c of craters) {
    const d = Math.hypot(x - c.x, y - c.y) / c.r;
    if (d < 1.6) e += d < 1 ? -c.r * 3.2 * (1 - d * d) : c.r * 1.6 * Math.cos((d - 1) / 0.6 * Math.PI / 2) ** 2;
  }
  elev[y * W + x] = e;
}

// elev.i16
const i16 = new Int16Array(W * H);
let lo = Infinity, hi = -Infinity;
for (let i = 0; i < elev.length; i++) { i16[i] = Math.round(elev[i]); lo = Math.min(lo, i16[i]); hi = Math.max(hi, i16[i]); }
fs.writeFileSync(path.join(OUT, 'elev.i16'), Buffer.from(i16.buffer));

// slope + hillshade
const slope = new Uint8Array(W * H), shade = new Float32Array(W * H);
const at = (x, y) => elev[Math.min(H - 1, Math.max(0, y)) * W + Math.min(W - 1, Math.max(0, x))];
const az = 315 * Math.PI / 180, alt = 40 * Math.PI / 180;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const dzdx = (at(x + 1, y) - at(x - 1, y)) / (2 * cellX), dzdy = (at(x, y + 1) - at(x, y - 1)) / (2 * cellY);
  const sl = Math.atan(Math.hypot(dzdx, dzdy));
  slope[y * W + x] = Math.min(255, Math.round((sl * 180 / Math.PI) * 4));
  const aspect = Math.atan2(dzdy, -dzdx);
  shade[y * W + x] = Math.max(0, Math.sin(alt) * Math.cos(sl) + Math.cos(alt) * Math.sin(sl) * Math.cos(az - aspect));
}
const png = new PNG({ width: W, height: H, colorType: 0, inputColorType: 0, bitDepth: 8 });
png.data = Buffer.from(slope);
fs.writeFileSync(path.join(OUT, 'slope.png'), PNG.sync.write(png, { colorType: 0, inputColorType: 0 }));

// visible.jpg: butterscotch tint × hillshade, darker low ground
const rgba = Buffer.alloc(W * H * 4);
for (let i = 0; i < W * H; i++) {
  const h01 = (elev[i] - lo) / (hi - lo), s = 0.35 + 0.75 * shade[i];
  const n = 0.9 + 0.2 * noise((i % W) / 3, ((i / W) | 0) / 3);
  rgba[i * 4] = Math.min(255, (150 + 60 * h01) * s * n);
  rgba[i * 4 + 1] = Math.min(255, (95 + 45 * h01) * s * n);
  rgba[i * 4 + 2] = Math.min(255, (62 + 25 * h01) * s * n);
  rgba[i * 4 + 3] = 255;
}
fs.writeFileSync(path.join(OUT, 'visible.jpg'), jpeg.encode({ data: rgba, width: W, height: H }, 85).data);

// pois.json: real Gale POIs from docs/DATASETS.md (positions approx.), on DEMO terrain
const pois = [
  { id: 'yellowknife', name: 'Yellowknife Bay', lon: 137.453, lat: -4.626, why: 'Mudstone from an ancient freshwater lake that could have supported microbial life', source: 'HiRISE ESP_032436_1755; NASA MSL' },
  { id: 'pahrump', name: 'Pahrump Hills', lon: 137.379, lat: -4.676, why: 'Lake-bed layers of the Murray formation at the base of Mount Sharp', source: 'HiRISE ESP_039280_1755' },
  { id: 'vera-rubin', name: 'Vera Rubin Ridge', lon: 137.357, lat: -4.714, why: 'Hematite-capped ridge recording groundwater altering old lake sediments', source: 'HiRISE ESP_052176_1750' },
  { id: 'glen-torridon', name: 'Glen Torridon', lon: 137.396, lat: -4.729, why: 'The most clay-rich rocks Curiosity has drilled, with sulfur-bearing organics', source: 'PMC9286800; USGS 2022' },
  { id: 'woodland-bay', name: 'Woodland Bay', lon: 137.382, lat: -4.732, why: 'Clay-bearing outcrop with active rippled sand nearby', source: 'HiRISE ESP_060207_1750' },
];
fs.writeFileSync(path.join(OUT, 'pois.json'), JSON.stringify(pois, null, 2));

const meta = {
  id: 'demo', name: 'Gale Crater (DEMO terrain, not real data)', synthetic: true,
  lon: LON, lat: LAT, width: W, height: H, cellM: [+cellX.toFixed(3), +cellY.toFixed(3)], elevRange: [lo, hi],
  base: { id: 'bradbury', name: 'Bradbury Landing', lon: 137.4417, lat: -4.5895 },
  sources: [{ layer: 'all', dataset: 'Synthetic placeholder from web/scripts/make-demo-region.mjs', mission: 'none', url: '' }],
};
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 2));
console.log(`demo region: ${W}x${H}, cell ${cellX.toFixed(1)}x${cellY.toFixed(1)} m, elev ${lo}..${hi} m → ${OUT}`);
