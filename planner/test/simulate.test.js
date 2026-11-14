// T-35: Mission Simulator, step-by-step legs and the pit stop. Same synthetic hill as plan.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMission, PIT_STOP_ID } from '../src/plan.js';
import { dustRate, rng, drawConditions, runOnce, simulateMission, describeRun, describeRecommendation, SIM_DEFAULTS } from '../src/simulate.js';
import { describeSteps } from '../src/steps.js';

const W = 200, H = 200, CELL = 20;
const elev = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const r = Math.hypot(x - 100, y - 100) * CELL;
  elev[y * W + x] = 150 * Math.exp(-(r * r) / (2 * 200 * 200));
}
const base = { elev, w: W, h: H, cellX: CELL, cellY: CELL, start: [20, 100], end: [180, 100], pois: [{ id: 'poi', x: 100, y: 40 }] };
const routes = planMission(base);
const by = Object.fromEntries(routes.map((r) => [r.strategy, r]));
const calm = { seed: 1, pace: 1, terrain: 1.2, effort: 1, dust: null, spe: null };

test('rng and conditions are deterministic per seed', () => {
  const a = rng(42), b = rng(42);
  for (let i = 0; i < 5; i++) assert.equal(a(), b());
  assert.deepEqual(drawConditions(7, { Ls: 250 }), drawConditions(7, { Ls: 250 }));
  assert.notDeepEqual(drawConditions(7), drawConditions(8));
});

test('a calm run with nominal pace reproduces the planner budget', () => {
  for (const r of routes) {
    const run = runOnce(r, base, calm);
    assert.equal(run.outcome, 'completed');
    assert.ok(Math.abs(run.totalT - r.budget.totalT) < 1e-6 * r.budget.totalT, `${r.strategy} time ${run.totalT} vs ${r.budget.totalT}`);
    assert.ok(Math.abs(run.o2 - r.budget.o2) < 1e-6 * r.budget.o2, `${r.strategy} O2`);
    assert.ok(Math.abs(run.distance - r.budget.distance) < 1e-6);
  }
});

test('a heavy dust storm on the way out turns the crew back; SAFE turns back even for a light one', () => {
  const heavy = { ...calm, dust: { tOnS: 600, tau: 4.5 } };
  const light = { ...calm, dust: { tOnS: 600, tau: 1.5 } };
  const f = runOnce(by.FAST, base, heavy);
  assert.equal(f.outcome, 'turned back');
  assert.ok(f.distance < by.FAST.budget.distance && f.totalT < by.FAST.budget.totalT);
  assert.equal(f.events[0].decision, 'turn back');
  assert.ok(f.events[0].damage.length > 0);
  assert.equal(runOnce(by.FAST, base, light).outcome, 'completed', 'FAST keeps going at τ 1.5');
  assert.equal(runOnce(by.SAFE, base, light).outcome, 'turned back', 'SAFE turns back at τ 1.5');
  const sci = runOnce(by.SCIENCE, base, heavy);
  assert.ok(sci.stopsMissed.length > 0, 'turning back early misses the science stop');
});

test('a light storm makes the walk slower than calm, never faster', () => {
  const r = runOnce(by.FAST, base, { ...calm, dust: { tOnS: 600, tau: 1.5 } });
  assert.ok(r.totalT > by.FAST.budget.totalT);
  assert.ok(r.o2 > by.FAST.budget.o2 * 0.999);
});

test('simulateMission: N runs per route, a recommendation, valid typical/best/worst', () => {
  const sim = simulateMission(routes, base, { Ls: 250, runs: 20 });
  assert.equal(sim.routes.length, 3);
  assert.ok(['SAFE', 'FAST', 'SCIENCE'].includes(sim.recommended));
  for (const r of sim.routes) {
    assert.equal(r.runs.length, 20);
    const s = r.summary;
    assert.equal(s.completed + s.turnedBack + s.unsafe, 20);
    for (const k of ['typical', 'best', 'worst']) assert.ok(s[k] >= 0 && s[k] < 20);
    assert.ok(s.p10TotalT <= s.medianTotalT && s.medianTotalT <= s.p90TotalT);
    for (const run of r.runs) assert.ok(describeRun(run, r.runs[s.typical]).length > 20);
  }
  // Same seed → same conditions for every route (fair comparison)
  assert.deepEqual(sim.routes[0].runs.map((x) => x.seed), sim.routes[1].runs.map((x) => x.seed));
  assert.match(describeRecommendation(sim), /simulated EVAs/);
  const again = simulateMission(routes, base, { Ls: 250, runs: 20 });
  assert.deepEqual(again.routes.map((r) => r.summary), sim.routes.map((r) => r.summary), 'replayable');
});

test('simulateMission is quick: 3 routes × 20 runs in under 1 s', () => {
  const t0 = performance.now();
  simulateMission(routes, base, { runs: SIM_DEFAULTS.runs });
  assert.ok(performance.now() - t0 < 1000);
});

test('describeSteps: legs cover the outbound walk, each ≤ ~1 km, with sane numbers', () => {
  for (const r of routes) {
    const legs = describeSteps(r, base, { poi: 'Test site' });
    assert.ok(legs.length >= 2, `${r.strategy} has legs`);
    const total = legs.reduce((t, l) => t + l.distM, 0);
    assert.ok(Math.abs(total - r.budget.oneWay) < 1, `${r.strategy} legs sum ${total} vs ${r.budget.oneWay}`);
    for (const l of legs) {
      assert.ok(l.distM <= 1300, `leg ${l.n} is ${l.distM} m`);
      assert.ok(l.heading >= 0 && l.heading < 360 && l.maxSlope >= 0 && l.tS >= 0 && l.o2Kg >= 0);
      assert.ok(l.text.startsWith('Head '));
    }
    assert.match(legs.at(-1).text, /Arrive/);
  }
  const sciLegs = describeSteps(by.SCIENCE, base, { poi: 'Test site' });
  assert.ok(sciLegs.some((l) => l.stopAtEnd === 'poi' && /Test site/.test(l.text)), 'science stop is named in a leg');
});

test('pit stop: every route passes through it and spends stop time there', () => {
  const via = [100, 160];
  const rs = planMission({ ...base, via });
  for (const r of rs) {
    assert.ok(r.path.some(([x, y]) => x === via[0] && y === via[1]), `${r.strategy} passes the pit stop`);
    assert.ok(r.stops.some((s) => s.id === PIT_STOP_ID), `${r.strategy} lists the pit stop`);
    assert.ok(r.budget.stopT > 0);
  }
  assert.ok(rs[0].budget.distance > by.SAFE.budget.distance, 'detour via the pit stop is longer');
  assert.throws(() => planMission({ ...base, via: [999, 0] }), RangeError);
});

test('no pit stop: planMission output is unchanged', () => {
  const again = planMission(base);
  assert.deepEqual(again.map((r) => r.budget.totalT), routes.map((r) => r.budget.totalT));
});

test('dust.json rate: season lookup, forced storms, and MDAD text in the recommendation', async () => {
  const fs = await import('node:fs');
  const url = new URL('../../web/public/data/gale/dust.json', import.meta.url);
  const dust = JSON.parse(fs.readFileSync(url, 'utf8'));
  assert.equal(dust.bins.length, 12);
  for (const b of dust.bins) assert.ok(b.p >= 0 && b.p <= 1 && b.pRegional <= b.p + 1e-9);
  assert.deepEqual(dustRate(dust, 275).ls, [270, 300]);
  assert.deepEqual(dustRate(dust, 365).ls, [0, 30]);
  assert.equal(dustRate(null, 100), null);
  const forced = simulateMission(routes, base, { dust, Ls: 100, forceDust: true });
  for (const r of forced.routes) assert.equal(r.summary.dustRuns, 20, 'every run meets a storm (unless it ends first)' );
  const real = simulateMission(routes, base, { dust, Ls: 100 });
  assert.equal(real.routes[0].summary.dustRuns, 0, 'MDAD: no storm over Gale at Ls 90-120');
  assert.match(describeRecommendation(real), /orbiter maps/);
});
