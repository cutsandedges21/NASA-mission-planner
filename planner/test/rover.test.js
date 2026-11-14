// T-23: rover assist mode.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planMission, EVA_DEFAULTS } from '../src/plan.js';
import { loadRegion } from '../scripts/lib/load-gale.mjs';

// Synthetic: flat 6 km strip with a steep ridge across the middle (~35° flanks) and one gentle pass.
const W = 240, H = 120, CELL = 25;
const elev = new Float32Array(W * H);
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const ridge = Math.max(0, 60 - Math.abs(x - 120) * 17.5); // 60 m high, 700 m/25 m-cell flanks ≈ 35°
  const pass = Math.exp(-(((y - 100) / 6) ** 2)); // a notch near y = 100 lowers the ridge to ~0
  elev[y * W + x] = ridge * (1 - pass);
}
const base = { elev, w: W, h: H, cellX: CELL, cellY: CELL, start: [10, 40], end: [230, 40], pois: [] };
const stepGrades = (path) => path.slice(1).map(([x, y], i) => {
  const [px, py] = path[i];
  return Math.atan2(Math.abs(elev[y * W + x] - elev[py * W + px]), Math.hypot(x - px, y - py) * CELL) * 180 / Math.PI;
});

test('rover is faster than walking over the same ground and reports mode', () => {
  const foot = planMission(base);
  const rover = planMission({ ...base, params: { rover: true } });
  for (let i = 0; i < 3; i++) {
    assert.equal(foot[i].budget.mode, 'foot');
    assert.equal(rover[i].budget.mode, 'rover');
    assert.ok(rover[i].budget.walkT < foot[i].budget.walkT, `${rover[i].strategy}: rover ${rover[i].budget.walkT} s vs foot ${foot[i].budget.walkT} s`);
  }
});

test(`rover never drives over ground steeper than roverMaxSlope (${EVA_DEFAULTS.roverMaxSlope}°) when a way round exists`, () => {
  for (const r of planMission({ ...base, params: { rover: true } })) {
    const g = Math.max(...stepGrades(r.path));
    assert.ok(g <= EVA_DEFAULTS.roverMaxSlope + 1e-9, `${r.strategy} drives a ${g.toFixed(1)}° step`);
    assert.ok(r.path.some(([, y]) => y > 85), `${r.strategy} should use the pass`);
  }
});

const R = loadRegion('gale');
test('real Gale: Bradbury → Glen Torridon is NO-GO on foot and not NO-GO with the rover', { skip: R ? false : 'gale not baked' }, () => {
  const foot = planMission(R.args('glen-torridon'));
  const rover = planMission(R.args('glen-torridon', { params: { rover: true } }));
  const fmt = (r) => `${r.strategy.padEnd(7)} ${r.budget.mode.padEnd(5)} ${(r.budget.distance / 1000).toFixed(1)} km  ${Math.round(r.budget.totalT / 60)} min  O₂ ${r.budget.marginPct.toFixed(0)} %  ${r.verdict.lvl.toUpperCase()}`;
  console.log(foot.map(fmt).join('\n') + '\n' + rover.map(fmt).join('\n'));
  for (const r of foot) assert.equal(r.verdict.lvl, 'nogo', `${r.strategy} on foot`);
  for (const r of rover) assert.notEqual(r.verdict.lvl, 'nogo', `${r.strategy} by rover: ${r.verdict.issues.map((i) => i.msg).join('; ')}`);
});
