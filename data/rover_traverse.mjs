// A rover's real drive inside any region box, from NASA/JPL's public MMGIS feeds (Sun 15 Nov, multi-region).
//   node data/rover_traverse.mjs jezero M20      Perseverance → web/public/data/jezero/traverse(-detail).json
//   node data/rover_traverse.mjs gale MSL        Curiosity (Gale keeps its own scripts: msl_traverse*.mjs)
// Writes the same two files Gale has:
//   traverse.json         end-of-drive stops (<MISSION>_waypoints.json), one MultiLineString split where the rover leaves the box
//   traverse-detail.json  the detailed drive line (<MISSION>_traverse.json), Douglas-Peucker simplified to 1 m (display only)
// Science-site positions are not moved here: they're picked by sol in data/regions/<id>.json (see each POI's "source").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const [id, mission] = process.argv.slice(2);
if (!id || !mission) throw new Error('usage: node data/rover_traverse.mjs <region> <MSL|M20>');
const NAME = { MSL: 'Curiosity', M20: 'Perseverance' }[mission] ?? mission;
const BASE = `https://mars.nasa.gov/mmgis-maps/${mission}/Layers/json/${mission}_`;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'regions', `${id}.json`), 'utf8'));
const outDir = path.join(ROOT, 'web', 'public', 'data', id);
const TOL_M = 1.0;

const [lo0, lo1] = cfg.lon, [la0, la1] = cfg.lat;
const inBox = ([lon, lat]) => lon >= lo0 && lon <= lo1 && lat >= la0 && lat <= la1;
const M_PER_DEG = (Math.PI * 3396190) / 180;
const kx = M_PER_DEG * Math.cos((((la0 + la1) / 2) * Math.PI) / 180), ky = M_PER_DEG;

async function get(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`NASA feed ${url} answered ${res.status}`);
  return res.json();
}
function split(points) {
  const runs = [];
  let cur = [];
  for (const p of points) {
    if (inBox(p)) cur.push(p);
    else if (cur.length) { runs.push(cur); cur = []; }
  }
  if (cur.length) runs.push(cur);
  return runs.filter((r) => r.length > 1);
}
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
const fc = (props, lines) => ({ type: 'FeatureCollection', features: [{ type: 'Feature', properties: { ...props, generated: new Date().toISOString() }, geometry: { type: 'MultiLineString', coordinates: lines } }] });

// 1. end-of-drive stops
const wp = (await get(BASE + 'waypoints.json')).features.map((f) => f.properties).sort((a, b) => a.sol - b.sol);
const stops = split(wp.map((p) => [+p.lon.toFixed(5), +p.lat.toFixed(5)]));
fs.writeFileSync(path.join(outDir, 'traverse.json'), JSON.stringify(fc({ name: `${NAME}'s real drive path`, source: `NASA/JPL ${mission} waypoint feed (end-of-drive stops)`, url: BASE + 'waypoints.json', sols: [wp[0].sol, wp.at(-1).sol] }, stops)));
console.log(`traverse.json: ${stops.reduce((n, r) => n + r.length, 0)} of ${wp.length} stops inside the box (sols ${wp[0].sol}–${wp.at(-1).sol})`);

// 2. detailed line
const drives = (await get(BASE + 'traverse.json')).features;
const pts = [];
for (const f of drives) {
  const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const line of lines) for (const c of line) pts.push([c[0], c[1]]);
}
const r6 = (v) => Math.round(v * 1e6) / 1e6;
const lines = split(pts).map((r) => simplify(r).map(([a, b]) => [r6(a), r6(b)]));
const dest = path.join(outDir, 'traverse-detail.json');
fs.writeFileSync(dest, JSON.stringify(fc({ name: `${NAME}'s real drive path (detailed)`, source: `NASA/JPL MMGIS ${mission} traverse layer`, url: BASE + 'traverse.json', simplifiedM: TOL_M }, lines)));
console.log(`traverse-detail.json: ${drives.length} drives, ${pts.length} points; kept ${lines.reduce((n, l) => n + l.length, 0)} in ${lines.length} run(s), ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
