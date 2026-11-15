'use client';

import { useEffect, useState } from 'react';
import type { RegionMeta } from '@/lib/region';
import { CREDITS, type Credit } from '@/lib/credits';

// "Data & credits": same dark surface, gold-for-selected and white-for-primary as the rest of the app.
// The list itself comes from web/lib/credits.ts (Teammate's T-25), grouped by tabs.

const GROUPS: Credit['group'][] = ['NASA data', 'Models & methods', 'Software'];

export default function Credits({ meta, onClose }: { meta: RegionMeta | null; onClose: () => void }) {
  const [group, setGroup] = useState<Credit['group']>('NASA data');
  const all = CREDITS;
  const list = all.filter((c) => c.group === group);
  // Esc closes it, like every other pop-up
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="cr-frame" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 px-1">
          <div>
            <div className="ui-label">Data &amp; credits</div>
            <h2 className="mt-1 text-[20px] font-semibold">Everything this planner is built on</h2>
            <p className="mt-1 max-w-xl text-[12.5px] leading-relaxed text-zinc-400">
              Routes, oxygen, slope, daylight and radiation are computed from these sources. The briefing restates those computed numbers in plain
              language; no AI runs in the app.{meta?.synthetic ? ' The map currently shows demo terrain.' : ''}
            </p>
          </div>
          <button onClick={onClose} className="cr-close shrink-0" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-1.5 px-1">
          {GROUPS.map((g) => {
            const n = all.filter((c) => c.group === g).length;
            if (!n) return null;
            return (
              <button key={g} onClick={() => setGroup(g)} className={`cr-chip ${group === g ? 'cr-chip-on' : ''}`}>
                {g} · {n}
              </button>
            );
          })}
        </div>

        <ul className="mt-4 grid gap-2 md:grid-cols-2">
          {list.map((c) => (
            <li key={c.name} className="cr-card flex flex-col">
              <div className="text-[13px] font-semibold text-zinc-100">{c.name}</div>
              <div className="mt-1 flex-1 text-[11.5px] leading-relaxed text-zinc-400">{c.what}</div>
              <div className="mt-2.5 flex items-center justify-between gap-2">
                <span className="text-[10.5px] text-zinc-500">{c.license ?? ''}</span>
                <a href={c.url} target="_blank" rel="noreferrer" className="cr-chip">
                  Source ↗
                </a>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
