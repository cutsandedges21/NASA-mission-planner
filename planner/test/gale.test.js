// T-26: robustness on the real baked Gale terrain (skips cleanly if web/public/data/gale/ is missing).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMission } from '../src/plan.js';
import { loadRegion } from '../scripts/lib/load-gale.mjs';

const R = loadRegion('gale');
const skip = R ? false : 'web/public/data/gale/ not baked: run python data/build_region.py gale';
const W = R?.meta.width, H = R?.meta.height;

const finiteDeep = (v, path = 'route') => {
  if (typeof v === 'number') assert.ok(Number.isFinite(v), `${path} is ${v}`);
  else if (Array.isArray(v)) v.forEach((x, i) => finiteDeep(x, `${path}[${i}]`));
  else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) finiteDeep(x, `${path}.${k}`);
};
const checkRoute = (r, label) => {
  assert.ok(['SAFE', 'FAST', 'SCIENCE'].includes(r.strategy));
  assert.ok(['go', 'caution', 'nogo'].includes(r.verdict.lvl), `${label} verdict`);
  if (r.path) {
    assert.ok(r.path.length >= 1, `${label} path`);
    finiteDeep(r.budget, `${label}.budget`);
  } else {
    assert.equal(r.verdict.lvl, 'nogo', `${label}: no path must be NO-GO`);
    assert.ok(r.verdict.issues.length > 0, `${label}: NO-GO needs a reason`);
  }
  assert.ok(r.ms < 2000, `${label} took ${r.ms.toFixed(0)} ms`);
};

test('every science site × every strategy: a path or a clean NO-GO, finite numbers, < 2 s', { skip }, () => {
  for (const p of R.pois) {
    const rs = planMission(R.args(p.id));
    assert.equal(rs.length, 3);
    for (const r of rs) checkRoute(r, `${p.id}/${r.strategy}`);
  }
});

test('start == end gives a sane zero-length route, no crash', { skip }, () => {
  const a = R.args('pahrump');
  for (const where of [a.start, a.end]) { // the base (no POI) and a POI cell
    const rs = planMission({ ...a, start: where, end: where });
    for (const r of rs) {
      checkRoute(r, `start=end ${where}/${r.strategy}`);
      assert.notEqual(r.verdict.lvl, 'nogo');
      // SAFE/FAST stay put; SCIENCE may make a short loop to a nearby site (base → Yellowknife Bay → base)
      if (r.strategy !== 'SCIENCE' || !r.stops.some((s) => s.d > 0)) assert.equal(r.budget.distance, 0);
      else assert.ok(r.budget.distance < 3000 && r.poisVisited.length > 0);
    }
  }
});

test('target on a cliff (≥ 30° cell) gives a route or a clean NO-GO with a reason', { skip }, () => {
  let cliff = -1;
  for (let i = 0; i < R.fineSlope.length; i++) if (R.fineSlope[i] >= 30) { cliff = i; break; }
  assert.ok(cliff >= 0, 'expected at least one ≥ 30° cell in Gale');
  const end = [cliff % W, Math.floor(cliff / W)];
  const rs = planMission({ ...R.args('pahrump'), end });
  for (const r of rs) {
    checkRoute(r, `cliff/${r.strategy}`);
    // a ≥ 30° cell is far over the 20° limit: the planner must flag it, never call it GO
    assert.notEqual(r.verdict.lvl, 'go', `${r.strategy} called a ${R.fineSlope[cliff]}° cliff GO`);
    assert.ok(r.verdict.issues.some((i) => /°|slope|steep/i.test(i.msg)), `${r.strategy} needs a slope reason`);
  }
});

test('start/end outside the grid throws RangeError with a readable message', { skip }, () => {
  const a = R.args('pahrump');
  assert.throws(() => planMission({ ...a, start: [-1, 5] }), (e) => e instanceof RangeError && /cell \[-1, 5\] is outside the 473×593 grid/.test(e.message));
  assert.throws(() => planMission({ ...a, end: [W, H] }), RangeError);
  assert.throws(() => planMission({ ...a, end: [NaN, 3] }), RangeError);
});

test('real terrain: SAFE is never steeper than FAST to Pahrump Hills (cell grade and fine slope)', { skip }, () => {
  const rs = Object.fromEntries(planMission(R.args('pahrump')).map((r) => [r.strategy, r]));
  const fineMax = (r) => Math.max(...r.path.map(([x, y]) => R.fineSlope[y * W + x]));
  assert.ok(rs.SAFE.budget.maxSlope <= rs.FAST.budget.maxSlope + 1e-9, `cell grade SAFE ${rs.SAFE.budget.maxSlope} vs FAST ${rs.FAST.budget.maxSlope}`);
  assert.ok(fineMax(rs.SAFE) <= fineMax(rs.FAST) + 1e-9, `fine slope SAFE ${fineMax(rs.SAFE)} vs FAST ${fineMax(rs.FAST)}`);
  assert.equal(rs.SAFE.verdict.lvl, 'go');
});

test('a space-weather warning does not change which science stops are chosen', { skip }, () => {
  const calm = planMission(R.args('pahrump')).find((r) => r.strategy === 'SCIENCE');
  const storm = planMission(R.args('pahrump', { spaceWeather: { lvl: 'warn', short: 'CME forecast' } })).find((r) => r.strategy === 'SCIENCE');
  assert.deepEqual(storm.poisVisited, calm.poisVisited);
  assert.equal(storm.verdict.lvl, 'caution');
});
