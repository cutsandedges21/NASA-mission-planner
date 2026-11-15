// Tests for the briefing (browser-side, no AI), no Next.js needed:
//   cd web && node --test app/api/_tests/
// (Node 22.18+ runs the .ts files directly. `_tests` is a private folder: not a route.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecommended, briefingText } from '../../../lib/briefing.ts';

const routes = [
  { strategy: 'SAFE', distanceKm: 4.9, durationMin: 91, o2MarginPct: 71, maxSlopeDeg: 6.2, verdict: { lvl: 'go', issues: [] }, poisVisited: [] },
  { strategy: 'FAST', distanceKm: 4.7, durationMin: 84, o2MarginPct: 72, maxSlopeDeg: 13.4, verdict: { lvl: 'caution', issues: [{ lvl: 'caution', msg: 'Steep sections up to 13°' }] }, poisVisited: [] },
  { strategy: 'SCIENCE', distanceKm: 4.9, durationMin: 111, o2MarginPct: 66, maxSlopeDeg: 6.2, verdict: 'go', poisVisited: ['Yellowknife Bay'] },
];
const req = { region: 'gale', routes };

test('recommendation is rule-based: best verdict, then SCIENCE with a stop, then SAFE, then FAST', () => {
  assert.equal(pickRecommended(routes), 'SCIENCE');
  assert.equal(pickRecommended(routes.map((r) => (r.strategy === 'SCIENCE' ? { ...r, poisVisited: [] } : r))), 'SAFE');
  assert.equal(pickRecommended(routes.map((r) => (r.strategy === 'FAST' ? r : { ...r, verdict: 'nogo' }))), 'FAST');
  assert.equal(pickRecommended(routes.filter((r) => r.strategy !== 'SCIENCE')), 'SAFE');
});

test('briefing quotes only computed numbers', () => {
  const t = briefingText(req);
  assert.match(t, /^SCIENCE is recommended \(GO\)/);
  const given = new Set();
  for (const r of routes) for (const k of ['distanceKm', 'durationMin', 'o2MarginPct', 'maxSlopeDeg']) {
    for (const v of [r[k], Math.round(r[k]), Math.round(r[k] * 10) / 10]) given.add(String(v));
  }
  for (const r of routes) for (const o of routes) given.add(String(Math.abs(r.durationMin - o.durationMin)));
  const nums = (t.match(/\d+(?:\.\d+)?/g) || []);
  for (const n of nums) assert.ok(given.has(n), `number ${n} is not a computed number`);
});
