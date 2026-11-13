// Mission briefing for POST /api/explain (T-12, Teammate).
// The recommendation is picked by a fixed rule from the computed numbers. The AI only *explains* it,
// and any number in its text that we didn't give it makes us fall back to a template sentence.
// Self-contained (no imports) so it runs in Node tests and in a Next.js route handler.

export type Strategy = 'SAFE' | 'FAST' | 'SCIENCE';
export type Lvl = 'go' | 'caution' | 'nogo';

export type ExplainRoute = {
  strategy: Strategy;
  distanceKm: number;
  durationMin: number;
  o2MarginPct: number;
  maxSlopeDeg: number;
  verdict: Lvl | { lvl: Lvl; issues?: { lvl: Lvl; msg: string }[] };
  poisVisited?: string[];
  note?: string;
  /** Optional: budget.doseMSv (whole EVA, mSv) and budget.steepPct (% of route steeper than 15°). */
  doseMSv?: number;
  steepPct?: number;
};

export type ExplainRequest = {
  region?: string;
  routes: ExplainRoute[];
  daylight?: { endMarginH?: number; sunsetLocal?: string } | null;
  spaceWeather?: { lvl?: string; short?: string } | null;
};

export type ExplainResponse = {
  recommended: Strategy;
  text: string;
  source: 'claude' | 'fallback';
  reason?: string; // why we fell back (missing key, timeout, invented number, …)
};

const RANK: Record<Lvl, number> = { go: 0, caution: 1, nogo: 2 };
const TIEBREAK: Strategy[] = ['SCIENCE', 'SAFE', 'FAST'];
const lvlOf = (r: ExplainRoute): Lvl => (typeof r.verdict === 'string' ? r.verdict : r.verdict?.lvl) || 'nogo';
const VERDICT_WORD: Record<Lvl, string> = { go: 'GO', caution: 'CAUTION', nogo: 'NO-GO' };

/** Validate and normalise the request body. Throws Error with a readable message. */
export function parseRequest(body: unknown): ExplainRequest {
  const b = body as ExplainRequest;
  if (!b || !Array.isArray(b.routes) || !b.routes.length) throw new Error('body.routes must be a non-empty array');
  for (const r of b.routes) {
    if (!['SAFE', 'FAST', 'SCIENCE'].includes(r?.strategy)) throw new Error(`unknown strategy ${r?.strategy}`);
    for (const k of ['distanceKm', 'durationMin', 'o2MarginPct', 'maxSlopeDeg'] as const) {
      if (typeof r[k] !== 'number' || !Number.isFinite(r[k])) throw new Error(`${r.strategy}.${k} must be a number`);
    }
  }
  return b;
}

/**
 * Fixed recommendation rule (shown to judges, never decided by the AI):
 * best verdict wins (GO > CAUTION > NO-GO); on a tie prefer SCIENCE if it visits a site
 * (more science for the same risk), then SAFE (lower risk), then FAST.
 */
export function pickRecommended(routes: ExplainRoute[]): Strategy {
  const score = (r: ExplainRoute) => {
    const sciencePenalty = r.strategy === 'SCIENCE' && !(r.poisVisited && r.poisVisited.length) ? 1 : 0;
    return RANK[lvlOf(r)] * 10 + sciencePenalty * 5 + TIEBREAK.indexOf(r.strategy);
  };
  return [...routes].sort((a, b) => score(a) - score(b))[0].strategy;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const r0 = (x: number) => Math.round(x);

/** Template briefing from the same numbers. Used when the AI is unavailable or breaks the rules. */
export function fallbackExplanation(req: ExplainRequest, recommended = pickRecommended(req.routes)): string {
  const by = Object.fromEntries(req.routes.map((r) => [r.strategy, r])) as Record<Strategy, ExplainRoute>;
  const rec = by[recommended];
  const sites = rec.poisVisited?.length ? `, with a science stop at ${rec.poisVisited.join(' and ')}` : '';
  let s = `${recommended} is recommended (${VERDICT_WORD[lvlOf(rec)]}): ${r1(rec.distanceKm)} km in ${r0(rec.durationMin)} min${sites}, ` +
    `returning with ${r0(rec.o2MarginPct)}% O₂ and a maximum slope of ${r1(rec.maxSlopeDeg)}°.`;
  const others = req.routes.filter((r) => r.strategy !== recommended);
  const fastest = [...req.routes].sort((a, b) => a.durationMin - b.durationMin)[0];
  if (fastest.strategy !== recommended) {
    s += ` ${fastest.strategy} would save ${r0(rec.durationMin - fastest.durationMin)} min but climbs to ${r1(fastest.maxSlopeDeg)}° (${VERDICT_WORD[lvlOf(fastest)]}).`;
  } else if (others.length) {
    const o = others[0];
    s += ` ${o.strategy} takes ${r0(o.durationMin)} min with ${r0(o.o2MarginPct)}% O₂ left (${VERDICT_WORD[lvlOf(o)]}).`;
  }
  if (req.spaceWeather?.lvl === 'warn' && req.spaceWeather.short) s += ` Space weather: ${req.spaceWeather.short}.`;
  return s;
}

/** Numbers the AI may use: everything in the request, as given and rounded to 0 or 1 decimals, plus 1–3. */
export function allowedNumbers(req: ExplainRequest): Set<string> {
  const out = new Set<string>(['1', '2', '3']);
  const add = (x: number) => {
    if (!Number.isFinite(x)) return;
    for (const v of [x, r1(x), r0(x), Math.abs(x), r1(Math.abs(x)), r0(Math.abs(x))]) {
      out.add(String(v));
      out.add(v.toFixed(1));
    }
  };
  const walk = (v: unknown) => {
    if (typeof v === 'number') add(v);
    else if (typeof v === 'string') for (const m of v.match(/\d+(?:\.\d+)?/g) || []) add(Number(m));
    else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(req);
  // every number exactly as the model sees it in the prompt (e.g. dose rounded to 3 decimals)
  for (const m of userPrompt(req, pickRecommended(req.routes)).match(/\d+(?:\.\d+)?/g) || []) out.add(m);
  // differences the briefing may naturally quote ("saves 12 min", "3.4 km longer")
  const rs = req.routes;
  for (const a of rs) for (const b of rs) {
    add(a.durationMin - b.durationMin);
    add(a.distanceKm - b.distanceKm);
    add(a.o2MarginPct - b.o2MarginPct);
  }
  return out;
}

/** Numbers in `text` that aren't in the request. Empty = the text is grounded. */
export function inventedNumbers(text: string, req: ExplainRequest): string[] {
  const ok = allowedNumbers(req);
  const found = text.replace(/O₂|O2|CO2/g, '').match(/\d+(?:[.,]\d+)?/g) || [];
  return found.map((n) => n.replace(',', '.')).filter((n) => !ok.has(n) && !ok.has(String(Number(n))));
}

export const SYSTEM_PROMPT = `You are the EVA flight controller briefing an astronaut before a Marswalk.
You get three computed routes (SAFE, FAST, SCIENCE) with their numbers, and the route already recommended by the planner.
Rules:
- Explain why the recommended route is the right call. Do not recommend a different one.
- Use ONLY numbers that appear in the data. Never estimate, convert units, add or invent any number.
- Mention the main tradeoff against at least one other route.
- At most 3 sentences, plain English, no lists, no markdown, no greeting.`;

export function userPrompt(req: ExplainRequest, recommended: Strategy): string {
  const data = {
    region: req.region,
    recommended,
    routes: req.routes.map((r) => ({
      strategy: r.strategy, verdict: VERDICT_WORD[lvlOf(r)], distanceKm: r1(r.distanceKm), durationMin: r0(r.durationMin),
      o2LeftAtReturnPct: r0(r.o2MarginPct), maxSlopeDeg: r1(r.maxSlopeDeg), scienceStops: r.poisVisited || [],
      radiationDoseMSv: r.doseMSv === undefined ? undefined : Math.round(r.doseMSv * 1000) / 1000,
      steepGroundPct: r.steepPct === undefined ? undefined : r0(r.steepPct),
      issues: typeof r.verdict === 'object' ? (r.verdict.issues || []).map((i) => i.msg) : [], note: r.note,
    })),
    daylight: req.daylight ?? undefined,
    spaceWeather: req.spaceWeather ?? undefined,
  };
  return `Mission data (JSON):\n${JSON.stringify(data, null, 1)}\n\nWrite the briefing.`;
}

type Env = { ANTHROPIC_API_KEY?: string; ANTHROPIC_MODEL?: string };

/** Never throws for upstream problems: returns the fallback with a `reason` instead. */
export async function explain(req: ExplainRequest, env: Env, fetchImpl: typeof fetch = fetch, timeoutMs = 10000): Promise<ExplainResponse> {
  const recommended = pickRecommended(req.routes);
  const fallback = (reason: string): ExplainResponse => ({ recommended, text: fallbackExplanation(req, recommended), source: 'fallback', reason });
  if (!env.ANTHROPIC_API_KEY) return fallback('ANTHROPIC_API_KEY not set');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: env.ANTHROPIC_MODEL || 'claude-haiku-5-5',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt(req, recommended) }],
      }),
    });
    if (!r.ok) return fallback(`Claude API HTTP ${r.status}`);
    const j = (await r.json()) as { content?: { type: string; text?: string }[] };
    const text = (j.content || []).filter((c) => c.type === 'text').map((c) => c.text || '').join(' ').trim();
    if (!text) return fallback('empty reply');
    const bad = inventedNumbers(text, req);
    if (bad.length) return fallback(`reply used numbers not in the data: ${bad.join(', ')}`);
    return { recommended, text, source: 'claude' };
  } catch (e) {
    return fallback((e as Error).name === 'AbortError' ? `timed out after ${timeoutMs / 1000} s` : `request failed: ${(e as Error).message}`);
  } finally {
    clearTimeout(timer);
  }
}
