// Run from web/:  node scripts/test-mission-timeline.mjs
// Plans real routes on the demo region, then checks the "Simulate Mission" playback maths.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { planMission } from '../../planner/src/plan.js';
import { buildMission, makePathLocator } from '../lib/mission-timeline.ts';
import { toCell, toLonLat } from '../lib/region.ts';

const dir = new URL('../public/data/demo/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('meta.json', dir), 'utf8'));
const pois = JSON.parse(fs.readFileSync(new URL('pois.json', dir), 'utf8'));
const buf = fs.readFileSync(new URL('elev.i16', dir));
const elev = Float32Array.from(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));

const start = toCell(meta, meta.base.lon, meta.base.lat);
const target = pois.find((p) => p.id === 'pahrump');
const end = toCell(meta, target.lon, target.lat);
const routes = planMission({
  elev, w: meta.width, h: meta.height, cellX: meta.cellM[0], cellY: meta.cellM[1], fineSlope: null, start, end,
  pois: pois.map((p) => ({ ...toCell(meta, p.lon, p.lat) && { x: toCell(meta, p.lon, p.lat)[0], y: toCell(meta, p.lon, p.lat)[1] }, id: p.id })),
});

let checked = 0;
for (const r of routes) {
  const m = buildMission(r);
  assert.ok(m, `${r.strategy}: mission built`);
  const f0 = m.at(0), f1 = m.at(m.duration);
  assert.equal(f0.tau, 0); assert.equal(f0.d, 0); assert.equal(f0.o2, 0);
  assert.ok(Math.abs(f1.tau - r.budget.totalT) < 1, `${r.strategy}: ends at totalT (${f1.tau} vs ${r.budget.totalT})`);
  assert.ok(Math.abs(f1.o2 - r.budget.o2) < 1e-6, `${r.strategy}: ends at total O2 (${f1.o2} vs ${r.budget.o2})`);
  assert.ok(Math.abs(f1.d - r.budget.distance) < 1, `${r.strategy}: ends at total distance`);
  assert.equal(f1.phase, 'returning');

  // monotonic
  let prev = m.at(0), working = new Set(), phases = [];
  for (let i = 1; i <= 2000; i++) {
    const f = m.at((m.duration * i) / 2000);
    assert.ok(f.tau >= prev.tau - 1e-6 && f.d >= prev.d - 1e-6 && f.o2 >= prev.o2 - 1e-9, `${r.strategy}: monotonic at ${i}`);
    if (f.stopId) working.add(f.stopId);
    if (phases.at(-1) !== f.phase) phases.push(f.phase);
    prev = f;
  }
  const stopIds = r.stops.map((s) => s.id);
  assert.deepEqual([...working].sort(), [...new Set(stopIds)].sort(), `${r.strategy}: a dwell frame for every stop`);
  assert.equal(phases[0], 'outbound'); assert.equal(phases.at(-1), 'returning');

  // locator: out to the destination and back to the base
  const loc = makePathLocator(r.path, meta.cellM[0], meta.cellM[1], (x, y) => toLonLat(meta, x, y));
  const [bx, by] = toLonLat(meta, ...start), [ex, ey] = toLonLat(meta, ...end);
  const close = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-9;
  assert.ok(close(loc.at(0), [bx, by]), 'starts at base');
  assert.ok(close(loc.at(loc.oneWay), [ex, ey]), 'reaches destination');
  assert.ok(close(loc.at(2 * loc.oneWay), [bx, by]), 'returns to base');
  assert.ok(loc.trail(loc.oneWay * 1.5).length > 2, 'trail has points');
  // metres frame (used by the first-person view): start/target cell centres, and the way back
  const cx = (c) => [(c[0] + 0.5) * meta.cellM[0], (c[1] + 0.5) * meta.cellM[1]];
  const near = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;
  assert.ok(near(loc.metres(0), cx(start)), 'metres() starts at the base cell centre');
  assert.ok(near(loc.metres(loc.oneWay), cx(end)), 'metres() reaches the target cell centre');
  assert.ok(near(loc.metres(2 * loc.oneWay), cx(start)), 'metres() returns to the base');
  // time conversion between pacings: uAtTau is the inverse of at(u).tau
  const slow = buildMission(r, { walkSeconds: 55, stopDwell: 5 });
  assert.ok(slow.duration > m.duration, 'slower pacing is longer');
  for (let i = 0; i <= 200; i++) {
    const u = (m.duration * i) / 200;
    const back = m.uAtTau(m.at(u).tau);
    assert.ok(Math.abs(back - u) < 1e-3, `${r.strategy}: uAtTau round trip at ${u} gave ${back}`);
    // switching pacing keeps the mission clock
    const u2 = slow.uAtTau(m.at(u).tau);
    assert.ok(Math.abs(slow.at(u2).tau - m.at(u).tau) < 1e-3, `${r.strategy}: pacing switch keeps tau`);
  }
  console.log(`${r.strategy.padEnd(7)} ok: ${(r.budget.distance / 1000).toFixed(1)} km, ${(r.budget.totalT / 3600).toFixed(1)} h mission → ${m.duration.toFixed(1)} s playback, stops ${stopIds.join(', ') || 'none'}`);
  checked++;
}
assert.equal(checked, 3);
console.log('OK');
