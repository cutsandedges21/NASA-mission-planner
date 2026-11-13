// POST /api/explain → { recommended, text, source, reason? }   (T-12, Teammate)
// Contract: docs/ARCHITECTURE.md → "AI explanation contract". Never 5xx for upstream problems:
// without a key, on timeout, or if the AI invents a number, it returns the template briefing.
import { explain, parseRequest } from '@/lib/explain';

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  let req;
  try {
    req = parseRequest(body);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 400 });
  }
  const out = await explain(req, { ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY, ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL });
  return Response.json(out, { headers: { 'cache-control': 'no-store' } });
}
