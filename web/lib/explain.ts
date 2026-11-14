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
  reason?: string; // why we fell back (missing key, timeout, invented number, rate limited, …)
  cached?: boolean; // true when the AI answer came from the 10-minute cache
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

/**
 * One honest sentence on how `alt` differs from the recommended route. A difference is only mentioned when it's real
 * (3+ min, 1+ degree of slope, 3+ points of O₂), so we never say "climbs to X" about a route that isn't steeper.
 */
export function compareSentence(rec: ExplainRoute, alt: ExplainRoute): string {
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

/** Template briefing from the same numbers. Used when the AI is unavailable or breaks the rules. */
export function fallbackExplanation(req: ExplainRequest, recommended = pickRecommended(req.routes)): string {
  const by = Object.fromEntries(req.routes.map((r) => [r.strategy, r])) as Record<Strategy, ExplainRoute>;
  const rec = by[recommended];
  const sites = rec.poisVisited?.length ? `, with a science stop at ${rec.poisVisited.join(' and ')}` : '';
  let s = `${recommended} is recommended (${VERDICT_WORD[lvlOf(rec)]}): ${r1(rec.distanceKm)} km in ${r0(rec.durationMin)} min${sites}, ` +
    `returning with ${r0(rec.o2MarginPct)}% O₂ and a maximum slope of ${r1(rec.maxSlopeDeg)}°.`;
  // Compare with the most informative alternative: the fastest other route, unless it's no different.
  const others = req.routes.filter((r) => r.strategy !== recommended).sort((a, b) => a.durationMin - b.durationMin);
  const alt = others[0];
  if (alt) s += compareSentence(rec, alt);
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

// ---------------------------------------------------------------- abuse protection (T-27)
// The site is public: without limits anyone could loop POST /api/explain and run up the Claude bill.
// Limits are per serverless instance (module-level state): a speed bump, not a wall. Going over a limit
// never errors: the caller gets the template briefing with reason 'rate limited', so the demo keeps working.

export const LIMITS = {
  maxBodyBytes: 20 * 1024, // bigger bodies → 413
  perIpCalls: 12, // AI calls per IP…
  perIpWindowMs: 10 * 60 * 1000, // …per 10 minutes
  globalCallsPerHour: 300, // AI calls per hour per instance
  cacheMs: 10 * 60 * 1000, // identical requests reuse the AI answer for 10 minutes
  cacheMaxEntries: 500,
};

export class ExplainGate {
  private perIp = new Map<string, number[]>();
  private global: number[] = [];
  private cache = new Map<string, { at: number; out: ExplainResponse }>();
  private limits: typeof LIMITS;
  private now: () => number;
  constructor(limits: typeof LIMITS = LIMITS, now: () => number = Date.now) {
    this.limits = limits;
    this.now = now;
  }

  cached(key: string): ExplainResponse | null {
    const hit = this.cache.get(key);
    if (!hit) return null;
    if (this.now() - hit.at > this.limits.cacheMs) { this.cache.delete(key); return null; }
    return hit.out;
  }
  remember(key: string, out: ExplainResponse) {
    if (this.cache.size >= this.limits.cacheMaxEntries) {
      const t = this.now();
      for (const [k, v] of this.cache) if (t - v.at > this.limits.cacheMs) this.cache.delete(k);
      if (this.cache.size >= this.limits.cacheMaxEntries) this.cache.delete(this.cache.keys().next().value as string);
    }
    this.cache.set(key, { at: this.now(), out });
  }
  /** Reserve one AI call for `ip`. Returns null if allowed, else which limit was hit. */
  take(ip: string): null | 'ip' | 'global' {
    const t = this.now();
    this.global = this.global.filter((x) => t - x < 3600 * 1000);
    if (this.global.length >= this.limits.globalCallsPerHour) return 'global';
    const mine = (this.perIp.get(ip) || []).filter((x) => t - x < this.limits.perIpWindowMs);
    if (mine.length >= this.limits.perIpCalls) { this.perIp.set(ip, mine); return 'ip'; }
    mine.push(t);
    this.perIp.set(ip, mine);
    this.global.push(t);
    if (this.perIp.size > 10000) this.perIp.clear(); // bound memory under a spray of fake IPs
    return null;
  }
}

/** First hop of x-forwarded-for, else 'unknown'. */
export function clientIp(headers: { get(name: string): string | null }): string {
  return (headers.get('x-forwarded-for') || '').split(',')[0].trim() || headers.get('x-real-ip') || 'unknown';
}

/**
 * The whole POST /api/explain, minus Next.js: raw body text in, { status, body } out.
 * 413 for oversized bodies, 400 for bad JSON / contract, else 200 with a briefing (AI, cached AI, or template).
 */
export async function handleExplain(raw: string, ip: string, env: Env, gate: ExplainGate, fetchImpl: typeof fetch = fetch): Promise<{ status: number; body: unknown }> {
  if (new TextEncoder().encode(raw).length > LIMITS.maxBodyBytes) return { status: 413, body: { error: `body larger than ${LIMITS.maxBodyBytes / 1024} KB` } };
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return { status: 400, body: { error: 'body must be JSON' } }; }
  let req: ExplainRequest;
  try { req = parseRequest(parsed); } catch (e) { return { status: 400, body: { error: (e as Error).message } }; }
  if (!env.ANTHROPIC_API_KEY) return { status: 200, body: await explain(req, env, fetchImpl) }; // template, costs nothing
  const key = JSON.stringify(req);
  const hit = gate.cached(key);
  if (hit) return { status: 200, body: { ...hit, cached: true } };
  const blocked = gate.take(ip);
  if (blocked) {
    const recommended = pickRecommended(req.routes);
    return { status: 200, body: { recommended, text: fallbackExplanation(req, recommended), source: 'fallback', reason: 'rate limited' } satisfies ExplainResponse };
  }
  const out = await explain(req, env, fetchImpl);
  if (out.source === 'claude') gate.remember(key, out);
  return { status: 200, body: out };
}
