// T-32: the display line (smoothLine) is straighter than the A* staircase but never takes the
// route onto steeper ground, never strays far from it, and passes through every science stop.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { smoothLine } from '../src/smooth.js';
import { planMission } from '../src/plan.js';
import { loadRegion } from '../scripts/lib/load-gale.mjs';

const flat = (w, h) => ({ elev: new Float32Array(w * h), w, cellX: 25, cellY: 25, fineSlope: new Float32Array(w * h) });
const len = (pts) => pts.slice(1).reduce((s, [x, y], i) => s + Math.hypot(x - pts[i][0], y - pts[i][1]), 0);
const distToPolyline = ([px, py], pts) => {
  let best = Infinity;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
    const t = L ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / L)) : 0;
    best = Math.min(best, Math.hypot(px - ax - t * dx, py - ay - t * dy));
  }
  return best;
};

test('flat ground: a staircase becomes one straight segment, ends kept', () => {
  const path = [];
  for (let i = 0; i <= 20; i++) path.push([i, Math.floor(i / 2)]); // 2:1 staircase
  const line = smoothLine(path, flat(40, 40));
  assert.deepEqual(line[0], [0, 0]);
  assert.deepEqual(line.at(-1), [20, 10]);
  assert.equal(line.length, 2);
});

test('a steep cell beside the route is never cut across', () => {
  const ctx = flat(30, 30);
  ctx.fineSlope[1 * 30 + 1] = 40; // the corner cell the shortcut would clip
  const path = [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]]; // L around the steep cell
  const line = smoothLine(path, ctx);
  for (let t = 0; t <= 1; t += 0.01) {
    for (let i = 1; i < line.length; i++) {
      const [ax, ay] = line[i - 1], [bx, by] = line[i];
      const c = [Math.round(ax + (bx - ax) * t), Math.round(ay + (by - ay) * t)];
      assert.ok(!(c[0] === 1 && c[1] === 1), `line crosses the steep cell between ${line[i - 1]} and ${line[i]}`);
    }
  }
});

test('anchors (science stops) are passed through exactly', () => {
  const path = [];
  for (let i = 0; i <= 30; i++) path.push([i, i < 15 ? 0 : i - 15]);
  const line = smoothLine(path, flat(40, 40), [10]);
  assert.ok(line.some(([x, y]) => x === 10 && y === 0), 'stop cell [10, 0] is on the line');
});

const R = loadRegion('gale');
test('real Gale terrain: fewer vertices, shorter, within 2.5 cells of the cell path, stops kept', { skip: R ? false : 'gale not baked' }, () => {
  for (const id of ['pahrump', 'yellowknife']) {
    assert.ok(R.pois.find((p) => p.id === id), `no POI ${id}`);
    for (const r of planMission(R.args(id))) {
      if (!r.path) continue;
      assert.ok(r.line.length < r.path.length, `${id} ${r.strategy}: ${r.line.length} vs ${r.path.length} vertices`);
      assert.ok(len(r.line) <= len(r.path) + 1e-6, `${id} ${r.strategy}: line longer than path`);
      for (const c of r.path) assert.ok(distToPolyline(c, r.line) <= 2.5, `${id} ${r.strategy}: cell ${c} is ${distToPolyline(c, r.line).toFixed(2)} cells off`);
      for (const s of r.poisVisited) {
        const p = R.args(id).pois.find((q) => q.id === s);
        if (p) assert.ok(distToPolyline([p.x, p.y], r.line) < 1e-6 || s === id, `${s} on the line`);
      }
    }
  }
});
