// Radiation vs elevation (planner/src/radiation.js): fit to NASA/JPL/JSC PIA03480, anchored to Curiosity RAD.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { doseRateMSvDay, mapDoseRemYr, relRate, routeDoseMSv, RAD_REF_ELEV_M } from '../src/radiation.js';
import { budget, RAD_MSV_PER_DAY, EVA_DEFAULTS } from '../src/eva.js';
import { CostGrid } from '../src/route.js';

test('rate = RAD 0.64 mSv/day at the reference elevation, +5.1 %/km, lower ground gets less', () => {
  assert.ok(Math.abs(doseRateMSvDay(RAD_REF_ELEV_M) - RAD_MSV_PER_DAY) < 1e-12);
  const perKm = doseRateMSvDay(RAD_REF_ELEV_M + 1000) / doseRateMSvDay(RAD_REF_ELEV_M) - 1;
  assert.ok(perKm > 0.049 && perKm < 0.053, `per km ${perKm}`);
  assert.ok(doseRateMSvDay(-7000) < doseRateMSvDay(-4500));
});

test('the fit reproduces the PIA03480 colour scale: Hellas floor ~11, datum ~16 rem/yr', () => {
  assert.ok(Math.abs(mapDoseRemYr(-7000) - 11.4) < 0.5);
  assert.ok(Math.abs(mapDoseRemYr(0) - 16.0) < 0.5);
  assert.equal(relRate(-4000, -4000), 1);
  assert.ok(relRate(-3000, -4000) > 1);
});

test('route dose on flat ground at the reference elevation = 0.64 mSv/day x time outside', () => {
  const samples = Array.from({ length: 50 }, (_, i) => ({ d: i * 25, e: RAD_REF_ELEV_M }));
  const b = budget(samples, [600]);
  const dose = routeDoseMSv(samples, b.timeline, [RAD_REF_ELEV_M], 20 * 60);
  assert.ok(Math.abs(dose - (b.totalT / 86400) * RAD_MSV_PER_DAY) < 1e-12);
});

test('SAFE radiation weight: off = straight over a high bump, strong = around it on lower ground', () => {
  // 3×2 grid of 10 km cells (1 km of relief is a gentle 5.7° grade). Start and end on low ground,
  // a bump 300 m higher between them; the way around (row 1) is 41 % longer but stays low.
  const w = 3, h = 2, el = new Float32Array(w * h).fill(-4500);
  el[1] = -4200; // low enough (300 m) that SAFE climbs it when radiation is ignored
  const g = new CostGrid(el, w, h, 10000, 10000, null);
  const go = (radAvoid, strategy = 'SAFE') => g.find(0, 0, 2, 0, { ...EVA_DEFAULTS, radAvoid }, { strategy });
  assert.deepEqual(go(0), [[0, 0], [1, 0], [2, 0]]);
  assert.deepEqual(go(200), [[0, 0], [1, 1], [2, 0]]);
  assert.deepEqual(go(200, 'FAST'), [[0, 0], [1, 0], [2, 0]], 'FAST ignores radiation');
});
