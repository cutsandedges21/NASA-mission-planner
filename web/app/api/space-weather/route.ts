// GET /api/space-weather → live NASA DONKI CME forecasts for Mars   (T-12, Teammate)
// { ok: true, source, checkedAt, summary, status: { lvl, short, long, link } } or { ok: false, error, status }.
// Cached 30 min in memory and at the CDN. Key: NASA_API_KEY (falls back to DEMO_KEY).
import { connection } from 'next/server';
import { getSpaceWeather } from '@/lib/space-weather';

export async function GET() {
  await connection(); // run at request time, never prerendered at build (cacheComponents is on)
  const out = await getSpaceWeather(process.env.NASA_API_KEY);
  return Response.json(out, {
    headers: { 'cache-control': out.ok ? 'public, s-maxage=1800, stale-while-revalidate=600' : 'no-store' },
  });
}
