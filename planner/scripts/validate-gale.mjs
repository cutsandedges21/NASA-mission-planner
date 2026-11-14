// T-22: compare our SAFE / FAST / SCIENCE routes with the path NASA's Curiosity drivers actually chose.
// Run from the repo root:  node planner/scripts/validate-gale.mjs   (writes docs/validation.json)
import fs from 'node:fs';
import path from 'node:path';
import { planMission } from '../src/plan.js';
import { loadRegion, toMetres, REPO } from './lib/load-gale.mjs';

const R = loadRegion('gale');
if (!R) { console.error('web/public/data/gale/ not found: bake it with python data/build_region.py gale'); process.exit(1); }
const { meta, fineSlope } = R;
const W = meta.width, H = meta.height, [CX, CY] = meta.cellM;
const STEEP = 15;

// --- geometry helpers (local metres: x east, y south, from the region's NW corner)
const cellToM = ([x, y]) => [(x + 0.5) * CX, (y + 0.5) * CY];
const len = (pl) => pl.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - pl[i - 1][0], p[1] - pl[i - 1][1]) : 0), 0);
function resample(pl, step = 10) {
  const out = [pl[0]];
  for (let i = 1; i < pl.length; i++) {
    const [ax, ay] = pl[i - 1], [bx, by] = pl[i];
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(d / step));
    for (let k = 1; k <= n; k++) out.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  return out;
}
function distToPolyline([px, py], pl) {
  let best = Infinity;
  for (let i = 1; i < pl.length; i++) {
    const [ax, ay] = pl[i - 1], [bx, by] = pl[i];
    const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy;
    const t = L2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L2)) : 0;
    best = Math.min(best, Math.hypot(px - (ax + t * dx), py - (ay + t * dy)));
  }
  return best;
}
const slopeAt = ([mx, my]) => {
  const x = Math.min(W - 1, Math.max(0, Math.floor(mx / CX))), y = Math.min(H - 1, Math.max(0, Math.floor(my / CY)));
  return fineSlope[y * W + x];
};
const pct = (a, q) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * (s.length - 1)))]; };
const r0 = (x) => Math.round(x), r1 = (x) => Math.round(x * 10) / 10;

// --- Curiosity's real path from landing to the first stop within 150 m of the target
const realAll = R.traverse.map(([lon, lat]) => toMetres(meta, lon, lat));
function realPathTo(target) {
  const t = toMetres(meta, target.lon, target.lat);
  const i = realAll.findIndex((p) => Math.hypot(p[0] - t[0], p[1] - t[1]) <= 150);
  if (i < 0) return null;
  return realAll.slice(0, i + 1);
}

function compare(ours, real) {
  const s = resample(ours, 10);
  const d = s.map((p) => distToPolyline(p, real));
  const within = (lim) => (d.filter((x) => x <= lim).length / d.length) * 100;
  const sl = (pl) => { const r = resample(pl, 10).map(slopeAt); return { max: Math.max(...r), steepPct: (r.filter((v) => v > STEEP).length / r.length) * 100 }; };
  const so = sl(ours), sr = sl(real);
  return {
    crossTrackM: { mean: r0(d.reduce((a, b) => a + b, 0) / d.length), median: r0(pct(d, 0.5)), p90: r0(pct(d, 0.9)), max: r0(Math.max(...d)) },
    within100Pct: r1(within(100)), within250Pct: r1(within(250)),
    lengthKm: { ours: Math.round(len(ours) / 10) / 100, real: Math.round(len(real) / 10) / 100 },
    slope: { oursMaxDeg: r1(so.max), realMaxDeg: r1(sr.max), oursSteepPct: r1(so.steepPct), realSteepPct: r1(sr.steepPct) },
  };
}

const out = { generated: new Date().toISOString(), region: meta.id, cellM: meta.cellM, demDataset: meta.sources.find((s) => s.layer === 'elev')?.dataset, cases: {} };
const line = (cells) => cells.map(String).map((c, i) => (i ? c.padStart(11) : c.padEnd(9))).join('');

for (const id of ['yellowknife', 'pahrump']) {
  const target = R.pois.find((p) => p.id === id);
  const real = realPathTo(target);
  if (!real) { console.error(`rover never came within 150 m of ${id}`); process.exit(1); }
  const routes = planMission(R.args(id));
  console.log(`\n=== Bradbury Landing → ${target.name}   (real path: ${real.length} rover stops, ${(len(real) / 1000).toFixed(2)} km between stops)`);
  console.log(line(['route', 'mean m', 'median m', 'p90 m', 'max m', '≤100 m %', '≤250 m %', 'ours km', 'real km', 'max° ours', 'max° real', '>15° ours%', '>15° real%']));
  out.cases[id] = { target: target.name, targetLonLat: [target.lon, target.lat], realStops: real.length, routes: {} };
  for (const r of routes) {
    const c = compare(r.path.map(cellToM), real);
    const b = r.budget;
    const e = { verdict: r.verdict.lvl, roundTripKm: r1(b.distance / 1000), totalMin: r0(b.totalT / 60), o2Kg: Math.round(b.o2 * 1000) / 1000, o2LeftPct: r0(b.marginPct), avgW: r0(b.avgW), walkAvgW: r0((b.o2 - (b.stopT ? b.stopT * (190 / 20100) * 1.429e-3 : 0)) / (b.walkT || 1) / ((1 / 20100) * 1.429e-3)) };
    out.cases[id].routes[r.strategy] = { ...c, energy: e, poisVisited: r.poisVisited };
    console.log(line([r.strategy, c.crossTrackM.mean, c.crossTrackM.median, c.crossTrackM.p90, c.crossTrackM.max, c.within100Pct, c.within250Pct, c.lengthKm.ours, c.lengthKm.real, c.slope.oursMaxDeg, c.slope.realMaxDeg, c.slope.oursSteepPct, c.slope.realSteepPct]));
  }
  console.log('energy:   ' + routes.map((r) => `${r.strategy} avg ${r0(r.budget.avgW)} W, O₂ ${r.budget.o2.toFixed(3)} kg, ${r0(r.budget.marginPct)} % left, ${r.verdict.lvl.toUpperCase()}`).join(' · '));
}

// --- sensitivity: Pahrump SAFE vs carried kit and O2 capacity
console.log('\n=== Sensitivity: Bradbury → Pahrump Hills, SAFE route (verdict, O₂ left at the airlock)');
out.sensitivity = [];
const kits = [0, 10, 20, 30], caps = [0.5, 0.6, 0.75];
console.log(line(['kit kg', ...caps.map((c) => `O₂ ${c} kg`)]));
for (const kitKg of kits) {
  const row = [kitKg];
  for (const o2CapKg of caps) {
    const s = planMission(R.args('pahrump', { params: { kitKg, o2CapKg } })).find((r) => r.strategy === 'SAFE');
    out.sensitivity.push({ kitKg, o2CapKg, verdict: s.verdict.lvl, o2LeftPct: r0(s.budget.marginPct), totalMin: r0(s.budget.totalT / 60) });
    row.push(`${s.verdict.lvl.toUpperCase()} ${r0(s.budget.marginPct)}%`);
  }
  console.log(line(row));
}

const file = path.join(REPO, 'docs', 'validation.json');
fs.writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log(`\nwrote ${path.relative(REPO, file)}`);
