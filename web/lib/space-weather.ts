// Live space weather at Mars for GET /api/space-weather (T-12, Teammate).
// Adapted from Sol Atlas by The SOL Explorers.
// Changes: server-side only (NASA_API_KEY, falls back to DEMO_KEY), in-memory 30-min cache instead of
// sessionStorage, typed, `now` injectable for tests. summariseEnlil / describeSpaceWeather logic unchanged.
//
// Source: NASA DONKI (CCMC, NASA Goddard) WSA-ENLIL simulations. Each CME run lists the planets it is
// forecast to hit, with arrival times; we keep the latest forecast per CME that reaches Mars.
// Self-contained (no imports) so it runs in Node tests and in a Next.js route handler.

const H = 3600 * 1000;
export const CACHE_MS = 30 * 60 * 1000;

type EnlilSim = {
  simulationID?: string;
  modelCompletionTime?: string;
  link?: string;
  impactList?: { location: string; arrivalTime: string; isGlancingBlow?: boolean }[] | null;
  cmeInputs?: { CMEID?: string; cmeStartTime?: string; speed?: number }[] | null;
};

export type Cme = { id: string; run: number; arrival: number; glancing: boolean; launched: number; speed: number | null; link: string | null };
export type Summary = { checked: number; total: number; window: Cme[] };
export type SpaceWeatherStatus = { lvl: 'ok' | 'warn' | 'off'; short: string; long: string; link?: string | null };
export type SpaceWeatherResponse =
  | { ok: true; source: string; checkedAt: string; summary: Summary; status: SpaceWeatherStatus; cached: boolean }
  | { ok: false; error: string; status: SpaceWeatherStatus };

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Latest WSA-ENLIL forecast per CME that reaches Mars, plus the ones arriving around now. */
export function summariseEnlil(sims: EnlilSim[], now = Date.now()): Summary {
  const byCme = new Map<string, Cme>();
  for (const s of sims || []) {
    const hit = (s.impactList || []).find((i) => i.location === 'Mars');
    if (!hit) continue;
    const cme = (s.cmeInputs || [])[0] || {};
    const id = cme.CMEID || s.simulationID || '?';
    const run = Date.parse(s.modelCompletionTime || '') || 0;
    const prev = byCme.get(id);
    if (prev && prev.run >= run) continue;
    byCme.set(id, {
      id, run, arrival: Date.parse(hit.arrivalTime), glancing: !!hit.isGlancingBlow,
      launched: Date.parse(cme.cmeStartTime || ''), speed: cme.speed ?? null, link: s.link || null,
    });
  }
  const all = [...byCme.values()].sort((a, b) => a.arrival - b.arrival);
  // "around now": arrived in the last day (may still be passing) or due within three days
  const window = all.filter((c) => c.arrival > now - 24 * H && c.arrival < now + 72 * H);
  return { checked: now, total: all.length, window };
}

const fmtUTC = (t: number) => {
  const d = new Date(t);
  return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })} ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')} UTC`;
};
const fmtDay = (t: number) => { const d = new Date(t); return `${d.getUTCDate()} ${d.toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' })}`; };

/** Short state for the badge: { lvl: 'ok'|'warn'|'off', short, long, link } */
export function describeSpaceWeather(s: Summary | null, error?: string, now = Date.now()): SpaceWeatherStatus {
  if (!s) return { lvl: 'off', short: 'not checked', long: `Not checked (${error || 'unavailable'}). Before egress, check NASA's DONKI space-weather forecasts for CMEs heading to Mars.` };
  const { window, total } = s;
  if (!window.length) return { lvl: 'ok', short: 'no CME due', long: `No CME forecast to reach Mars in the next 3 days. NASA's model forecast ${total} reaching Mars in the last 30 days.` };
  const c = window.find((x) => x.arrival >= now) || window[window.length - 1];
  const past = c.arrival < now;
  const hrs = Math.round(Math.abs(c.arrival - now) / H);
  const when = past ? `${hrs} h ago, may still be passing` : hrs < 1 ? 'due now' : `due in ${hrs} h`;
  return {
    lvl: 'warn', short: past ? `CME ${hrs} h ago` : `CME ${when}`, link: c.link,
    long: `CME forecast to ${past ? 'have reached' : 'reach'} Mars ${fmtUTC(c.arrival)} (${when}${c.glancing ? ', glancing blow' : ''}), from a ${c.speed ? `${Math.round(c.speed)} km/s ` : ''}CME launched ${fmtDay(c.launched)}.${window.length > 1 ? ` ${window.length - 1} more around the same days.` : ''}`,
  };
}

let cache: { at: number; sims: EnlilSim[]; source: string } | null = null;
/** For tests. */
export function clearCache() { cache = null; }

/** Never throws: { ok: false, error } when DONKI is down, so the UI can show "not checked". */
export async function getSpaceWeather(apiKey: string | undefined, fetchImpl: typeof fetch = fetch, now = Date.now(), timeoutMs = 9000): Promise<SpaceWeatherResponse> {
  if (cache && now - cache.at < CACHE_MS) {
    const summary = summariseEnlil(cache.sims, now);
    return { ok: true, source: cache.source, checkedAt: new Date(cache.at).toISOString(), summary, status: describeSpaceWeather(summary, undefined, now), cached: true };
  }
  const key = apiKey || 'DEMO_KEY';
  const q = `startDate=${day(now - 30 * 24 * H)}&endDate=${day(now)}`;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const r = await fetchImpl(`https://api.nasa.gov/DONKI/WSAEnlilSimulations?${q}&api_key=${encodeURIComponent(key)}`, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(`NASA API HTTP ${r.status}`);
    const sims = (await r.json()) as unknown;
    if (!Array.isArray(sims)) throw new Error('unexpected reply from DONKI');
    const source = `NASA DONKI WSA-ENLIL (api.nasa.gov${apiKey ? '' : ', DEMO_KEY'})`;
    cache = { at: now, sims, source };
    const summary = summariseEnlil(sims, now);
    return { ok: true, source, checkedAt: new Date(now).toISOString(), summary, status: describeSpaceWeather(summary, undefined, now), cached: false };
  } catch (e) {
    const error = (e as Error).name === 'AbortError' ? 'timed out' : (e as Error).message;
    return { ok: false, error, status: describeSpaceWeather(null, error, now) };
  } finally {
    clearTimeout(timer);
  }
}
