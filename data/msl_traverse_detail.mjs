// Curiosity's detailed drive line from NASA/JPL's MMGIS "MSL traverse" layer, for drawing on the map (T-34).
//   node data/msl_traverse_detail.mjs        fetch + write web/public/data/gale/traverse-detail.json
// Why a separate file: traverse.json (end-of-drive stops, data/msl_traverse.mjs) looks jagged when drawn, but the
// planner validation (T-22, docs/VALIDATION.md) is measured on it, so it stays as it is. This file is display only.
// Feed: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json (one MultiLineString per drive, lon/lat/elev).
// Output: one Feature, MultiLineString clipped to the region box, Douglas-Peucker simplified to TOL_M metres.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_traverse.json';
const TOL_M = 1.0;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions', 'gale.json'), 'utf8'));
const out = path.join(ROOT, 'web', 'public', 'data', 'gale', 'traverse-detail.json');

const res = await fetch(FEED);
if (!res.ok) throw new Error(`NASA feed answered ${res.status}`);
const drives = (await res.json()).features;

// Join the drives into continuous runs (each drive starts where the last one ended), split where the rover leaves the box.
const [lo0, lo1] = cfg.lon, [la0, la1] = cfg.lat;
const inBox = ([lon, lat]) => lon >= lo0 && lon <= lo1 && lat >= la0 && lat <= la1;
const runs = [];
let cur = [];
let total = 0;
for (const f of drives) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) {
    for (const c of line) {
      total++;
      const p = [c[0], c[1]];
      if (inBox(p)) cur.push(p);
      else if (cur.length) { runs.push(cur); cur = []; }
    }
  }
}
if (cur.length) runs.push(cur);

// Douglas-Peucker in local metres (equirectangular around the box centre is plenty at this size).
const M_PER_DEG = (Math.PI * 3396190) / 180;
const kx = M_PER_DEG * Math.cos((((la0 + la1) / 2) * Math.PI) / 180), ky = M_PER_DEG;
function segDist(p, a, b) {
  const [px, py] = [(p[0] - a[0]) * kx, (p[1] - a[1]) * ky];
  const [bx, by] = [(b[0] - a[0]) * kx, (b[1] - a[1]) * ky];
  const L = bx * bx + by * by;
  const t = L ? Math.max(0, Math.min(1, (px * bx + py * by) / L)) : 0;
  return Math.hypot(px - t * bx, py - t * by);
}
function simplify(pts) {
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, j] = stack.pop();
    let best = -1, bi = -1;
    for (let k = i + 1; k < j; k++) {
      const d = segDist(pts[k], pts[i], pts[j]);
      if (d > best) { best = d; bi = k; }
    }
    if (best > TOL_M) { keep[bi] = 1; stack.push([i, bi], [bi, j]); }
  }
  return pts.filter((_, k) => keep[k]);
}
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const lines = runs.filter((r) => r.length > 1).map((r) => simplify(r).map(([a, b]) => [r6(a), r6(b)]));
const kept = lines.reduce((n, l) => n + l.length, 0);
const inside = runs.reduce((n, r) => n + r.length, 0);

const fc = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: {
      name: "Curiosity's real drive path (detailed)",
      source: 'NASA/JPL MMGIS MSL traverse layer (MSL_traverse.json)',
      url: FEED,
      simplifiedM: TOL_M,
      generated: new Date().toISOString(),
    },
    geometry: { type: 'MultiLineString', coordinates: lines },
  }],
};
fs.writeFileSync(out, JSON.stringify(fc));
console.log(`feed: ${drives.length} drives, ${total} points; inside the box: ${inside} points in ${lines.length} run(s)`);
console.log(`kept ${kept} points (${TOL_M} m tolerance) → ${path.relative(ROOT, out)} (${(fs.statSync(out).size / 1024).toFixed(0)} KB)`);
