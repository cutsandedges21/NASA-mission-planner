// Curiosity's real positions from NASA/JPL's public MSL waypoint feed (end-of-drive stops, one per drive).
//   node data/msl_traverse.mjs            fetch + write
// What it does (Moss's Claude, Fri 19:55):
//   1. Snaps the science sites in data/regions/gale.json to places Curiosity actually stopped (a HiRISE
//      "image centre" can be kilometres from the feature: Yellowknife Bay was 1.9 km off).
//   2. Writes web/public/data/gale/traverse.json: the rover's drive path inside the region box (a map layer).
// Then re-run:  python data/build_region.py gale   (uses data-cache/, takes seconds) to regenerate pois.json.
// Feed: https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json (sol 3 … today, 1,389 stops)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED = 'https://mars.nasa.gov/mmgis-maps/MSL/Layers/json/MSL_waypoints.json';
const cfgPath = path.join(ROOT, 'data', 'regions', 'gale.json');
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

const res = await fetch(FEED);
if (!res.ok) throw new Error(`NASA feed answered ${res.status}`);
const stops = (await res.json()).features
  .map((f) => ({ sol: f.properties.sol, lon: f.properties.lon, lat: f.properties.lat }))
  .sort((a, b) => a.sol - b.sol);
console.log(`feed: ${stops.length} stops, sol ${stops[0].sol} … ${stops.at(-1).sol}`);

const M_PER_DEG = (Math.PI * 3396190) / 180;
const metres = (a, b) => Math.hypot((a.lon - b.lon) * M_PER_DEG * Math.cos((a.lat * Math.PI) / 180), (a.lat - b.lat) * M_PER_DEG);

// Each site: which sols to look at, and how to pick one stop in that window.
//   nearest: the stop whose sol is closest to `sol` (a known event)   centroid: the stop closest to the window's mean position
const SNAP = {
  yellowknife: { window: [125, 297], pick: { nearest: 166 }, note: 'rover parked here for the Sheepbed drilling campaign, sols 125–297' },
  pahrump: { window: [753, 753], pick: { nearest: 753 }, note: 'arrival at Pahrump Hills, base of Mount Sharp' },
  'vera-rubin': { window: [1800, 2300], pick: { centroid: true }, note: 'rover on the ridge, sols 1800–2300' },
};

const changes = [];
for (const poi of cfg.pois) {
  const rule = SNAP[poi.id];
  if (!rule) continue;
  const win = stops.filter((s) => s.sol >= rule.window[0] && s.sol <= rule.window[1]);
  if (!win.length) throw new Error(`no stops for ${poi.id} in sols ${rule.window}`);
  let pick;
  if (rule.pick.nearest !== undefined) pick = win.reduce((m, s) => (Math.abs(s.sol - rule.pick.nearest) < Math.abs(m.sol - rule.pick.nearest) ? s : m));
  else {
    const c = { lon: win.reduce((a, s) => a + s.lon, 0) / win.length, lat: win.reduce((a, s) => a + s.lat, 0) / win.length };
    pick = win.reduce((m, s) => (metres(s, c) < metres(m, c) ? s : m));
  }
  const moved = metres(poi, pick);
  changes.push(`${poi.id}: moved ${Math.round(moved)} m → ${pick.lon.toFixed(5)}, ${pick.lat.toFixed(5)} (sol ${pick.sol})`);
  poi.lon = +pick.lon.toFixed(5);
  poi.lat = +pick.lat.toFixed(5);
  poi.approx = false;
  poi.source = `NASA/JPL MSL waypoint feed, rover stop at sol ${pick.sol} (${rule.note})`;
}
fs.writeFileSync(cfgPath, JSON.stringify(cfg, null, 2) + '\n');
console.log(changes.join('\n'));

// drive path inside the region box, split wherever the rover leaves it
const [lo0, lo1] = cfg.lon, [la0, la1] = cfg.lat;
const inBox = (s) => s.lon >= lo0 && s.lon <= lo1 && s.lat >= la0 && s.lat <= la1;
const lines = [];
let cur = [];
for (const s of stops) {
  if (inBox(s)) cur.push([+s.lon.toFixed(5), +s.lat.toFixed(5)]);
  else if (cur.length) { lines.push(cur); cur = []; }
}
if (cur.length) lines.push(cur);
const kept = lines.reduce((n, l) => n + l.length, 0);
const out = {
  type: 'FeatureCollection',
  features: [{
    type: 'Feature',
    properties: { name: "Curiosity's real drive path", source: 'NASA/JPL MSL waypoint feed (end-of-drive stops)', sols: [stops[0].sol, stops.at(-1).sol], generated: new Date().toISOString() },
    geometry: { type: 'MultiLineString', coordinates: lines },
  }],
};
const dest = path.join(ROOT, 'web', 'public', 'data', 'gale', 'traverse.json');
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`traverse.json: ${kept} of ${stops.length} stops inside the box, ${lines.length} segment(s), ${(fs.statSync(dest).size / 1024).toFixed(0)} KB`);
