// Exports what the Blender scenes draw on top of the terrain: our planned routes (real planner output), the science
// sites, the base, and Curiosity's real drive path, all in metres east (x) / south (z) of the region's NW corner.
//   node tools/blender/export_routes.mjs        → tools/blender/build/routes.json
import fs from 'node:fs';
import path from 'node:path';
import { planMission } from '../../planner/src/plan.js';
import { loadRegion, toMetres, REPO } from '../../planner/scripts/lib/load-gale.mjs';

const R = loadRegion('gale');
if (!R) throw new Error('web/public/data/gale/ not found');
const m = R.meta;
const [cx, cy] = m.cellM;
const cell = ([x, y]) => [Math.round((x + 0.5) * cx * 10) / 10, Math.round((y + 0.5) * cy * 10) / 10];
const at = (lon, lat) => toMetres(m, lon, lat).map((v) => Math.round(v * 10) / 10);

const pick = (target, extra = {}) => {
  const out = {};
  for (const r of planMission(R.args(target, extra))) {
    if (r.path) out[r.strategy] = r.path.map(cell);
  }
  return out;
};

const out = {
  sizeM: [m.width * cx, m.height * cy],
  grid: { w: m.width, h: m.height, cellM: m.cellM },
  base: { name: m.base.name, xz: at(m.base.lon, m.base.lat) },
  pois: R.pois.map((p) => ({ id: p.id, name: p.name, xz: at(p.lon, p.lat) })),
  traverse: (R.traverse ?? []).map(([lon, lat]) => at(lon, lat)),
  routes: {
    pahrump: pick('pahrump'),
    glenTorridonRover: pick('glen-torridon', { params: { rover: true } }),
  },
};
const dest = path.join(REPO, 'tools', 'blender', 'build', 'routes.json');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, JSON.stringify(out));
console.log(`routes.json: ${out.pois.length} sites, ${out.traverse.length} rover stops, routes ${Object.keys(out.routes.pahrump).join('/')} + rover (${(fs.statSync(dest).size / 1024).toFixed(0)} KB)`);
