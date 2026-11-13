// Tests for T-12 server logic, no Next.js needed:  cd web && node --test app/api/_tests/
// (Node 22.18+ runs the .ts files directly. `_tests` is a private folder: not a route.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { explain, parseRequest, pickRecommended, fallbackExplanation, inventedNumbers } from '../../../lib/explain.ts';
import { getSpaceWeather, summariseEnlil, describeSpaceWeather, clearCache } from '../../../lib/space-weather.ts';

const routes = [
  { strategy: 'SAFE', distanceKm: 4.9, durationMin: 91, o2MarginPct: 71, maxSlopeDeg: 6.2, verdict: { lvl: 'go', issues: [] }, poisVisited: [] },
  { strategy: 'FAST', distanceKm: 4.7, durationMin: 84, o2MarginPct: 72, maxSlopeDeg: 13.4, verdict: { lvl: 'caution', issues: [{ lvl: 'caution', msg: 'Steep sections up to 13°' }] }, poisVisited: [] },
  { strategy: 'SCIENCE', distanceKm: 4.9, durationMin: 111, o2MarginPct: 66, maxSlopeDeg: 6.2, verdict: 'go', poisVisited: ['Yellowknife Bay'] },
];
const req = parseRequest({ region: 'gale', routes, spaceWeather: { lvl: 'ok', short: 'no CME due' } });
const claudeReply = (text, status = 200) => async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status, headers: { 'content-type': 'application/json' } });

test('recommendation is rule-based: best verdict, then SCIENCE with a stop, then SAFE, then FAST', () => {
  assert.equal(pickRecommended(routes), 'SCIENCE');
  assert.equal(pickRecommended(routes.map((r) => (r.strategy === 'SCIENCE' ? { ...r, poisVisited: [] } : r))), 'SAFE');
  assert.equal(pickRecommended(routes.map((r) => (r.strategy === 'FAST' ? r : { ...r, verdict: 'nogo' }))), 'FAST');
});

test('bad bodies are rejected with a readable message', () => {
  assert.throws(() => parseRequest({}), /routes/);
  assert.throws(() => parseRequest({ routes: [{ strategy: 'SAFE', distanceKm: 'x' }] }), /distanceKm/);
});

test('fallback quotes only given numbers', () => {
  const t = fallbackExplanation(req);
  assert.match(t, /^SCIENCE is recommended \(GO\)/);
  assert.deepEqual(inventedNumbers(t, req), []);
});

test('no API key → fallback, not an error', async () => {
  const out = await explain(req, {}, async () => { throw new Error('must not be called'); });
  assert.equal(out.source, 'fallback');
  assert.equal(out.recommended, 'SCIENCE');
  assert.match(out.reason, /ANTHROPIC_API_KEY/);
});

test('grounded Claude reply is passed through', async () => {
  const text = 'SCIENCE is the call: 4.9 km and 111 min with a stop at Yellowknife Bay, back with 66% O₂. FAST saves 27 min but hits 13.4° slopes.';
  const out = await explain(req, { ANTHROPIC_API_KEY: 'k' }, claudeReply(text));
  assert.equal(out.source, 'claude');
  assert.equal(out.text, text);
});

test('a reply with an invented number falls back', async () => {
  const out = await explain(req, { ANTHROPIC_API_KEY: 'k' }, claudeReply('SCIENCE takes 2.5 hours and uses 340 g of oxygen.'));
  assert.equal(out.source, 'fallback');
  assert.match(out.reason, /340/);
});

test('HTTP error and timeout fall back', async () => {
  assert.match((await explain(req, { ANTHROPIC_API_KEY: 'k' }, claudeReply('x', 529))).reason, /529/);
  const hang = (_u, { signal }) => new Promise((_, rej) => signal.addEventListener('abort', () => rej(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  assert.match((await explain(req, { ANTHROPIC_API_KEY: 'k' }, hang, 50)).reason, /timed out/);
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
