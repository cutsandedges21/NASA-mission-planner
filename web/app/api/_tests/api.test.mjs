// Tests for the briefing (browser-side, no AI) and the space-weather route logic, no Next.js needed:
//   cd web && node --test app/api/_tests/
// (Node 22.18+ runs the .ts files directly. `_tests` is a private folder: not a route.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickRecommended, briefingText } from '../../../lib/briefing.ts';
import { getSpaceWeather, summariseEnlil, describeSpaceWeather, clearCache } from '../../../lib/space-weather.ts';

const routes = [
  { strategy: 'SAFE', distanceKm: 4.9, durationMin: 91, o2MarginPct: 71, maxSlopeDeg: 6.2, verdict: { lvl: 'go', issues: [] }, poisVisited: [] },
  { strategy: 'FAST', distanceKm: 4.7, durationMin: 84, o2MarginPct: 72, maxSlopeDeg: 13.4, verdict: { lvl: 'caution', issues: [{ lvl: 'caution', msg: 'Steep sections up to 13°' }] }, poisVisited: [] },
  { strategy: 'SCIENCE', distanceKm: 4.9, durationMin: 111, o2MarginPct: 66, maxSlopeDeg: 6.2, verdict: 'go', poisVisited: ['Yellowknife Bay'] },
];
const req = { region: 'gale', routes, spaceWeather: { lvl: 'ok', short: 'no CME due' } };

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

const NOW = Date.parse('2026-11-13T22:00:00Z');
const sims = [
  { simulationID: 's1', modelCompletionTime: '2026-11-12T10:00Z', link: 'https://example/s1',
    impactList: [{ location: 'Mars', arrivalTime: '2026-11-14T20:00Z', isGlancingBlow: true }], cmeInputs: [{ CMEID: 'c1', cmeStartTime: '2026-11-11T08:00Z', speed: 850 }] },
  { simulationID: 's2', modelCompletionTime: '2026-11-12T12:00Z', link: 'https://example/s2',
    impactList: [{ location: 'Mars', arrivalTime: '2026-11-15T02:00Z' }], cmeInputs: [{ CMEID: 'c1', cmeStartTime: '2026-11-11T08:00Z', speed: 900 }] },
  { simulationID: 's3', modelCompletionTime: '2026-11-01T00:00Z', impactList: [{ location: 'Earth', arrivalTime: '2026-11-14T00:00Z' }], cmeInputs: [{ CMEID: 'c2' }] },
  { simulationID: 's4', modelCompletionTime: '2026-10-20T00:00Z', impactList: [{ location: 'Mars', arrivalTime: '2026-10-22T00:00Z' }], cmeInputs: [{ CMEID: 'c3' }] },
];

test('DONKI: latest run per CME, Mars only, 3-day window', () => {
  const s = summariseEnlil(sims, NOW);
  assert.equal(s.total, 2);
  assert.equal(s.window.length, 1);
  assert.equal(s.window[0].speed, 900); // the later run wins
  const d = describeSpaceWeather(s, undefined, NOW);
  assert.equal(d.lvl, 'warn');
  assert.equal(d.short, 'CME due in 28 h');
});

test('space weather: fetch, cache, and "not checked" when DONKI is down', async () => {
  clearCache();
  let calls = 0;
  const ok = async (u) => { calls++; assert.match(u, /DONKI\/WSAEnlilSimulations\?startDate=2026-10-14&endDate=2026-11-13&api_key=DEMO_KEY/); return Response.json(sims); };
  const a = await getSpaceWeather(undefined, ok, NOW);
  assert.equal(a.ok, true);
  assert.equal(a.status.lvl, 'warn');
  const b = await getSpaceWeather(undefined, ok, NOW + 60_000);
  assert.equal(b.cached, true);
  assert.equal(calls, 1);
  clearCache();
  const down = await getSpaceWeather('key', async () => new Response('busy', { status: 503 }), NOW);
  assert.equal(down.ok, false);
  assert.equal(down.status.lvl, 'off');
  assert.match(down.status.short, /not checked/);
});

