// POST /api/explain → { recommended, text, source, reason?, cached? }   (T-12, T-27, Teammate)
// Contract: docs/ARCHITECTURE.md → "AI explanation contract". Never 5xx for upstream problems:
// without a key, on timeout, if the AI invents a number, or when rate limited, it returns the template briefing.
// Abuse protection (T-27): 20 KB body limit (413), 12 AI calls / 10 min per IP, 300 / hour per instance,
// identical requests answered from a 10-minute cache. Logic + tests live in web/lib/explain.ts.
import { ExplainGate, clientIp, handleExplain } from '@/lib/explain';

const gate = new ExplainGate();

export async function POST(request: Request) {
  const raw = await request.text();
  const { status, body } = await handleExplain(raw, clientIp(request.headers), {
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    ANTHROPIC_MODEL: process.env.ANTHROPIC_MODEL,
  }, gate);
  return Response.json(body, { status, headers: { 'cache-control': 'no-store' } });
}
