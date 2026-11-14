// Synthetic grid: flat plane + one steep Gaussian hill between start and end + one POI to the north.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doseRateMSvDay } from '../src/radiation.js';
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

test('SCIENCE with no POIs = SAFE path plus a note', () => {
  const rs = planMission({ ...base, pois: [] });
  const r = rs.find((x) => x.strategy === 'SCIENCE');
  assert.deepEqual(r.path, rs.find((x) => x.strategy === 'SAFE').path);
  assert.deepEqual(r.poisVisited, []);
  assert.match(r.note, /No science site/);
});

test('T-18: no far-away detour when no POI is near the route (Bradbury -> Yellowknife case)', () => {
  // short walk, the only other POI is far off to the side: SCIENCE must not go there
  const far = { id: 'far', x: 30, y: 190 };
  const rs = planMission({ ...base, start: [20, 100], end: [60, 100], pois: [far] });
  const sci = rs.find((r) => r.strategy === 'SCIENCE');
  const safe = rs.find((r) => r.strategy === 'SAFE');
  assert.deepEqual(sci.poisVisited, []);
  assert.ok(sci.budget.distance <= safe.budget.distance + 1e-6);
  assert.notEqual(sci.verdict.lvl, 'nogo');
  assert.ok(sci.note);
});

test('T-18: a POI at the destination (within 2 cells) counts as the science stop', () => {
  const target = { id: 'tgt', x: 61, y: 98 };
  const far = { id: 'far', x: 30, y: 190 };
  const rs = planMission({ ...base, start: [20, 100], end: [60, 100], pois: [far, target] });
  const sci = rs.find((r) => r.strategy === 'SCIENCE');
  assert.deepEqual(sci.poisVisited, ['tgt']);
  assert.equal(sci.note, undefined);
  assert.ok(sci.budget.stopT > 0);
  assert.notEqual(sci.verdict.lvl, 'nogo');
  // the destination POI is never also used as an on-the-way stop
  assert.equal(sci.stops.length, 1);
});

test('pickScienceStops prefers small detours and orders stops along the way', () => {
  const pois = [{ id: 'far', x: 100, y: 0 }, { id: 'b', x: 140, y: 95 }, { id: 'a', x: 60, y: 105 }];
  const { stops, target } = pickScienceStops([20, 100], [180, 100], pois, CELL, CELL, 2);
  assert.deepEqual(stops.map((p) => p.id), ['a', 'b']);
  assert.equal(target, null);
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

test('radiation dose = Curiosity RAD rate scaled by elevation (PIA03480) x EVA time; steepPct from fineSlope', () => {
  const r = by.FAST;
  const zs = r.path.map(([x, y]) => base.elev[y * W + x]);
  const lo = doseRateMSvDay(Math.min(...zs)), hi = doseRateMSvDay(Math.max(...zs));
  const flat = r.budget.totalT / 86400;
  assert.ok(r.budget.doseMSv >= flat * lo - 1e-9 && r.budget.doseMSv <= flat * hi + 1e-9, 'dose between min and max rate along the path');
  assert.equal(r.budget.steepPct, 0); // no fineSlope given
  const fs = new Float32Array(W * H).fill(20); // everything steep
  const rs = planMission({ ...base, fineSlope: fs });
  for (const x of rs) assert.ok(Math.abs(x.budget.steepPct - 100) < 1e-6);
});

test('space-weather warning turns GO into CAUTION with a reason', () => {
  const rs = planMission({ ...base, spaceWeather: { lvl: 'warn', short: 'CME due in 28 h' } });
  for (const r of rs) {
    assert.notEqual(r.verdict.lvl, 'go');
    assert.ok(r.verdict.issues.some((i) => /CME due in 28 h/.test(i.msg)));
  }
  const calm = planMission({ ...base, spaceWeather: { lvl: 'ok', short: 'no CME due' } });
  assert.deepEqual(calm.map((r) => r.verdict.lvl), routes.map((r) => r.verdict.lvl));
});

test('SCIENCE drops an on-the-way stop that would turn the EVA NO-GO', () => {
  // long flat walk with a tight O2 budget: the detour stop would breach the reserve
  const N = 400, el = new Float32Array(N * 20);
  const args = { elev: el, w: N, h: 20, cellX: 25, cellY: 25, start: [5, 10], end: [380, 10],
    pois: [{ id: 'side', x: 190, y: 19 }, { id: 'tgt', x: 380, y: 10 }], params: { o2CapKg: 0.40 } };
  const sci = planMission(args).find((r) => r.strategy === 'SCIENCE');
  const without = planMission({ ...args, pois: [{ id: 'tgt', x: 380, y: 10 }] }).find((r) => r.strategy === 'SCIENCE');
  const rank = { go: 0, caution: 1, nogo: 2 };
  assert.ok(rank[sci.verdict.lvl] <= rank[without.verdict.lvl], `${sci.verdict.lvl} vs ${without.verdict.lvl}`);
  assert.ok(sci.poisVisited.includes('tgt'));
});
