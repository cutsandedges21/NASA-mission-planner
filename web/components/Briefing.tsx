'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { briefingText, pickRecommended, type BriefingRequest, type Strategy } from '@/lib/briefing';

/**
 * Mission briefing: the planner's pick (a fixed rule on the computed verdicts) and a plain-language
 * explanation written from the computed numbers. Runs in the browser: no server call, no AI, no key.
 */
export default function Briefing({
  request,
  onRecommended,
  colors,
  children,
}: {
  request: BriefingRequest | null;
  onRecommended: (s: Strategy) => void;
  colors: Record<Strategy, string>;
  children?: React.ReactNode;
}) {
  const res = useMemo(() => {
    if (!request || !request.routes.length) return null;
    const recommended = pickRecommended(request.routes);
    return { recommended, text: briefingText(request, recommended) };
  }, [request]);
  const [shown, setShown] = useState({ text: '', n: 0 });
  const onRec = useRef(onRecommended);
  useEffect(() => {
    onRec.current = onRecommended;
  });
  const recommended = res?.recommended;
  useEffect(() => {
    if (recommended) onRec.current(recommended);
  }, [recommended]);

  // typing reveal (restarts when the text changes)
  const n = res && shown.text === res.text ? shown.n : 0;
  useEffect(() => {
    if (!res || n >= res.text.length) return;
    const t = setTimeout(() => setShown({ text: res.text, n: Math.min(res.text.length, n + 3) }), 14);
    return () => clearTimeout(t);
  }, [res, n]);

  if (!request) return null;
  const typing = res && n < res.text.length;

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
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
        {res ? res.text.slice(0, n) : <span className="text-zinc-500">Planning the routes…</span>}
        {typing && <span className="ml-0.5 inline-block h-3.5 w-1.5 translate-y-0.5 animate-pulse bg-orange-300" />}
      </p>
      <div className="mt-2 flex items-center justify-between gap-3">
        <span className="text-[10px] text-zinc-500">
          Written from the computed route numbers
        </span>
        {children}
      </div>
    </div>
  );
}
