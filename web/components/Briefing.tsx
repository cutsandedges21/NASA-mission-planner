'use client';

import { useEffect, useRef, useState } from 'react';
import type { ExplainRequest, ExplainResponse, Strategy } from '@/lib/explain';
import { fallbackExplanation, pickRecommended } from '@/lib/explain-fallback';

/**
 * Mission briefing: asks /api/explain to explain the planner's pick. The pick itself is a fixed rule
 * on computed numbers; the AI only words it (and the server rejects invented numbers).
 */
export default function Briefing({
  request,
  onRecommended,
  colors,
  children,
}: {
  request: ExplainRequest | null;
  onRecommended: (s: Strategy) => void;
  colors: Record<Strategy, string>;
  children?: React.ReactNode;
}) {
  const [res, setRes] = useState<ExplainResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [shown, setShown] = useState(0);
  const onRec = useRef(onRecommended);
  useEffect(() => {
    onRec.current = onRecommended;
  });
  const key = request ? JSON.stringify(request) : '';

  // fetch (debounced: the start-time slider changes the request while dragging)
  useEffect(() => {
    if (!key) return;
    const req = JSON.parse(key) as ExplainRequest;
    const ctl = new AbortController();
    const t = setTimeout(async () => {
      setLoading(true);
      let out: ExplainResponse;
      try {
        const r = await fetch('/api/explain', { method: 'POST', headers: { 'content-type': 'application/json' }, body: key, signal: ctl.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        out = await r.json();
      } catch (e) {
        if ((e as Error).name === 'AbortError') return;
        const recommended = pickRecommended(req.routes);
        out = { recommended, text: fallbackExplanation(req, recommended), source: 'fallback', reason: 'offline' };
      }
      setRes(out);
      setShown(0);
      setLoading(false);
      onRec.current(out.recommended);
    }, 450);
    return () => {
      clearTimeout(t);
      ctl.abort();
    };
  }, [key]);

  // typing reveal
  useEffect(() => {
    if (!res || shown >= res.text.length) return;
    const t = setTimeout(() => setShown((n) => Math.min(res.text.length, n + 3)), 14);
    return () => clearTimeout(t);
  }, [res, shown]);

  if (!request) return null;
  const typing = res && shown < res.text.length;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${loading ? 'animate-pulse bg-orange-300' : 'bg-emerald-400'}`} />
          <h2 className="eyebrow">Mission briefing</h2>
        </div>
        {res && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-zinc-500">Recommended</span>
            <span className="rounded-md px-1.5 py-0.5 font-semibold text-[#07080a]" style={{ background: colors[res.recommended] }}>
              {res.recommended}
            </span>
          </div>
        )}
      </div>
      <p className="mt-2 min-h-[3.75rem] text-[13.5px] leading-relaxed text-zinc-200">
        {res ? res.text.slice(0, shown) : <span className="text-zinc-500">Analysing the three routes…</span>}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-orange-300" />}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[10px] text-zinc-500" title={res?.reason}>
          {res?.source === 'claude' ? 'Worded by Claude from the computed numbers only' : 'Template briefing from the computed numbers (AI offline)'}
        </span>
        {children}
      </div>
    </div>
  );
}
