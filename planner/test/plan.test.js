// Synthetic grid: flat plane + one steep Gaussian hill between start and end + one POI to the north.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMission, pickScienceStops } from '../src/plan.js';

const W = 200, H = 200, CELL = 20; // 4 km square
const elev = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = Math.hypot(x - 100, y - 100) * CELL;
  elev[y * W + x] = 150 * Math.exp(-(r * r) / (2 * 200 * 200)); // 150 m hill, flanks up to ~24°
}
const POI = { id: 'poi', x: 100, y: 40 };
const base = { elev, w: W, h: H, cellX: CELL, cellY: CELL, start: [20, 100], end: [180, 100], pois: [POI] };
const routes = planMission(base);
const by = Object.fromEntries(routes.map((r) => [r.strategy, r]));
const minDistTo = (path, p) => Math.min(...path.map(([x, y]) => Math.hypot(x - p.x, y - p.y) * CELL));

test('returns SAFE, FAST, SCIENCE, each with a path, budget and verdict', () => {
  assert.deepEqual(routes.map((r) => r.strategy), ['SAFE', 'FAST', 'SCIENCE']);
  for (const r of routes) {
    assert.ok(r.path.length > 1, `${r.strategy} has a path`);
    assert.deepEqual(r.path[0], base.start);
    assert.deepEqual(r.path.at(-1), base.end);
    assert.ok(r.budget.distance > 0 && r.budget.totalT > 0 && r.budget.o2 > 0);
    assert.ok(['go', 'caution', 'nogo'].includes(r.verdict.lvl));
  }
});

test('SAFE max slope <= FAST max slope', () => {
  assert.ok(by.SAFE.budget.maxSlope <= by.FAST.budget.maxSlope + 1e-9,
    `SAFE ${by.SAFE.budget.maxSlope.toFixed(1)}° vs FAST ${by.FAST.budget.maxSlope.toFixed(1)}°`);
  assert.ok(by.SAFE.budget.maxSlope <= 15 + 1e-9, 'SAFE respects its 15° limit on open ground');
});

test('FAST walking time <= SAFE and SCIENCE walking time', () => {
  for (const s of ['SAFE', 'SCIENCE']) {
    assert.ok(by.FAST.budget.walkT <= by[s].budget.walkT + 1e-6,
      `FAST ${by.FAST.budget.walkT.toFixed(0)} s vs ${s} ${by[s].budget.walkT.toFixed(0)} s`);
  }
});

test('SCIENCE passes closer to the POI than FAST, and stops there', () => {
  assert.ok(minDistTo(by.SCIENCE.path, POI) < minDistTo(by.FAST.path, POI));
  assert.deepEqual(by.SCIENCE.poisVisited, ['poi']);
  assert.ok(by.SCIENCE.budget.stopT > 0, 'science stop time is budgeted');
});

test('round trip is the default; one-way halves the distance', () => {
  const b = by.FAST.budget;
  assert.equal(b.roundTrip, true);
  assert.ok(Math.abs(b.distance - 2 * b.oneWay) < 1e-6);
  const one = planMission({ ...base, roundTrip: false }).find((r) => r.strategy === 'FAST').budget;
  assert.ok(Math.abs(one.distance - one.oneWay) < 1e-6);
  assert.ok(one.totalT < b.totalT);
});

test('SCIENCE with no POIs still returns a route', () => {
  const r = planMission({ ...base, pois: [] }).find((x) => x.strategy === 'SCIENCE');
  assert.ok(r.path.length > 1);
  assert.deepEqual(r.poisVisited, []);
});

test('pickScienceStops prefers small detours and orders stops along the way', () => {
  const pois = [{ id: 'far', x: 100, y: 0 }, { id: 'b', x: 140, y: 95 }, { id: 'a', x: 60, y: 105 }];
  const s = pickScienceStops([20, 100], [180, 100], pois, CELL, CELL, 2);
  assert.deepEqual(s.map((p) => p.id), ['a', 'b']);
});

test('out-of-grid start throws a clear error', () => {
  assert.throws(() => planMission({ ...base, start: [-1, 0] }), /outside/);
});

test('a 512 x 512 grid plans all three routes in under 5 s (Node)', () => {
  const N = 512, el = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) el[y * N + x] = 80 * Math.sin(x / 25) * Math.cos(y / 30);
  const t0 = performance.now();
  const rs = planMission({ elev: el, w: N, h: N, cellX: 25, cellY: 25, start: [10, 10], end: [500, 480], pois: [{ id: 'p', x: 250, y: 300 }] });
  const ms = performance.now() - t0;
  console.log(`512x512: ${rs.map((r) => `${r.strategy} ${r.ms.toFixed(0)} ms`).join(', ')}; total ${ms.toFixed(0)} ms`);
  assert.ok(rs.every((r) => r.path));
  assert.ok(ms < 5000);
});

test('prints the synthetic-grid numbers for the task board', () => {
  for (const r of routes) {
    const b = r.budget;
    console.log(`${r.strategy.padEnd(7)} ${(b.distance / 1000).toFixed(2)} km round trip, ${(b.totalT / 60).toFixed(0)} min, ` +
      `max slope ${b.maxSlope.toFixed(1)}°, O2 left ${b.marginPct.toFixed(0)} %, ${r.verdict.lvl.toUpperCase()}, ${r.ms.toFixed(0)} ms`);
  }
});
