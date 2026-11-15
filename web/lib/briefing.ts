// Mission briefing, written in the browser from the computed route numbers (no AI, no network, no API key).
// The recommendation is a fixed rule on the computed verdicts; the sentences only restate computed numbers.
// Pure module (no imports), so it runs in the browser and in Node tests.

export type Strategy = 'SAFE' | 'FAST' | 'SCIENCE';
export type Lvl = 'go' | 'caution' | 'nogo';

export type BriefingRoute = {
  strategy: Strategy;
  distanceKm: number;
  durationMin: number;
  o2MarginPct: number;
  maxSlopeDeg: number;
  verdict: Lvl | { lvl: Lvl; issues?: { lvl: Lvl; msg: string }[] };
  poisVisited?: string[];
  note?: string;
  /** Optional: budget.steepPct (% of route steeper than 15°). */
  steepPct?: number;
};

export type BriefingRequest = {
  region?: string;
  routes: BriefingRoute[];
  daylight?: { endMarginH?: number; sunsetLocal?: string } | null;
};
const RANK: Record<Lvl, number> = { go: 0, caution: 1, nogo: 2 };
const TIEBREAK: Strategy[] = ['SCIENCE', 'SAFE', 'FAST'];
const lvlOf = (r: BriefingRoute): Lvl => (typeof r.verdict === 'string' ? r.verdict : r.verdict?.lvl) || 'nogo';
const VERDICT_WORD: Record<Lvl, string> = { go: 'GO', caution: 'CAUTION', nogo: 'NO-GO' };

/**
 * Fixed recommendation rule (shown to judges):
 * best verdict wins (GO > CAUTION > NO-GO); on a tie prefer SCIENCE if it visits a site
 * (more science for the same risk), then SAFE (lower risk), then FAST.
 */
export function pickRecommended(routes: BriefingRoute[]): Strategy {
  const score = (r: BriefingRoute) => {
    const sciencePenalty = r.strategy === 'SCIENCE' && !(r.poisVisited && r.poisVisited.length) ? 1 : 0;
    return RANK[lvlOf(r)] * 10 + sciencePenalty * 5 + TIEBREAK.indexOf(r.strategy);
  };
  return [...routes].sort((a, b) => score(a) - score(b))[0].strategy;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r0 = (x: number) => Math.round(x);

/**
 * One honest sentence on how `alt` differs from the recommended route. A difference is only mentioned when it's real
 * (3+ min, 1+ degree of slope, 3+ points of O₂), so we never say "climbs to X" about a route that isn't steeper.
 */
export function compareSentence(rec: BriefingRoute, alt: BriefingRoute): string {
  const pros: string[] = [];
  const cons: string[] = [];
  const dt = rec.durationMin - alt.durationMin;
  if (dt >= 3) pros.push(`saves ${r0(dt)} min`);
  else if (dt <= -3) cons.push(`takes ${r0(-dt)} min longer`);
  const dm = alt.maxSlopeDeg - rec.maxSlopeDeg;
  if (dm >= 1) cons.push(`climbs to ${r1(alt.maxSlopeDeg)}°`);
  else if (dm <= -1) pros.push(`keeps the slope to ${r1(alt.maxSlopeDeg)}°`);
  const dox = alt.o2MarginPct - rec.o2MarginPct;
  if (dox >= 3) pros.push(`leaves ${r0(alt.o2MarginPct)}% O₂`);
  else if (dox <= -3) cons.push(`leaves only ${r0(alt.o2MarginPct)}% O₂`);
  const tag = ` (${VERDICT_WORD[lvlOf(alt)]})`;
  if (pros.length && cons.length) return ` ${alt.strategy} ${pros.join(' and ')} but ${cons.join(' and ')}${tag}.`;
  if (pros.length) return ` ${alt.strategy} ${pros.join(' and ')}${tag}.`;
  if (cons.length) return ` ${alt.strategy} ${cons.join(' and ')}${tag}.`;
  return ` ${alt.strategy} is within ${Math.max(1, r0(Math.abs(dt)))} min with similar oxygen and slope${tag}.`;
}

/** The briefing text, written from the computed numbers only. */
export function briefingText(req: BriefingRequest, recommended = pickRecommended(req.routes)): string {
  const by = Object.fromEntries(req.routes.map((r) => [r.strategy, r])) as Record<Strategy, BriefingRoute>;
  const rec = by[recommended];
  const sites = rec.poisVisited?.length ? `, with a science stop at ${rec.poisVisited.join(' and ')}` : '';
  let s = `${recommended} is recommended (${VERDICT_WORD[lvlOf(rec)]}): ${r1(rec.distanceKm)} km in ${r0(rec.durationMin)} min${sites}, ` +
    `returning with ${r0(rec.o2MarginPct)}% O₂ and a maximum slope of ${r1(rec.maxSlopeDeg)}°.`;
  // Compare with the most informative alternative: the fastest other route, unless it's no different.
  const others = req.routes.filter((r) => r.strategy !== recommended).sort((a, b) => a.durationMin - b.durationMin);
  const alt = others[0];
  if (alt) s += compareSentence(rec, alt);
  return s;
}

