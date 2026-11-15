// Every number quoted in docs/DEMO-SCRIPT.md and docs/SUBMISSION.md, from the real baked Gale data.
// Run from the repo root:  node planner/scripts/demo-numbers.mjs
import fs from 'node:fs';
import path from 'node:path';
import { planMission } from '../src/plan.js';
import { loadRegion, REPO } from './lib/load-gale.mjs';

const R = loadRegion('gale');
if (!R) { console.error('web/public/data/gale/ not found'); process.exit(1); }
const hm = (s) => `${Math.floor(s / 3600)} h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')} min`;
const row = (r) => {
  const b = r.budget;
  return `${r.strategy.padEnd(7)} ${b.mode.padEnd(5)} ${(b.oneWay / 1000).toFixed(1)} km one way · ${(b.distance / 1000).toFixed(1)} km round trip · ${hm(b.totalT)} · O₂ left ${b.marginPct.toFixed(0)} % · max slope ${b.maxSlope.toFixed(1)}° · steep ${b.steepPct.toFixed(0)} % · ${r.verdict.lvl.toUpperCase()}${r.poisVisited.length ? ' · stops: ' + r.poisVisited.join(', ') : ''}${r.note ? ' · note: ' + r.note : ''}`;
};
const show = (title, rs) => { console.log(`\n${title}`); rs.forEach((r) => console.log('  ' + row(r))); };

console.log(`Region: ${R.meta.name}, ${R.meta.width}×${R.meta.height} cells of ${R.meta.cellM[0]} m, elevation ${R.meta.elevRange.join(' … ')} m`);
console.log(`Base: ${R.meta.base.name} (${R.meta.base.lon} °E, ${R.meta.base.lat}°)`);
console.log(`Science sites: ${R.pois.length}, Curiosity stops on the map: ${R.traverse?.length ?? 0}`);
for (const p of R.pois) show(`Bradbury Landing → ${p.name} (on foot)`, planMission(R.args(p.id)));
show('Bradbury Landing → Glen Torridon, ROVER ASSIST', planMission(R.args('glen-torridon', { params: { rover: true } })));
show('Bradbury Landing → Pahrump Hills carrying 20 kg of kit', planMission(R.args('pahrump', { params: { kitKg: 20 } })));

const vFile = path.join(REPO, 'docs', 'validation.json');
if (fs.existsSync(vFile)) {
  const v = JSON.parse(fs.readFileSync(vFile, 'utf8')).cases;
  console.log('\nValidation (docs/validation.json, from node planner/scripts/validate-gale.mjs):');
  for (const [id, c] of Object.entries(v)) for (const [s, r] of Object.entries(c.routes)) {
    console.log(`  ${c.target.padEnd(16)} ${s.padEnd(7)} within 250 m of Curiosity's path ${r.within250Pct} % · within 100 m ${r.within100Pct} % · max off ${r.crossTrackM.max} m · ours ${r.lengthKm.ours} km vs rover ${r.lengthKm.real} km`);
  }
}
