'use client';

import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import { hm, type Daylight } from '@/lib/mars-context';
import DotNum from '../ui/DotNum';
import { ROUTE_STYLE, VERDICT_LABEL, fmtClock } from './format';
import { IArrowUR } from './icons';

// Route dashboard, 1:1 with the dashboard reference (cosmos_1419633483): tall cards with big radii,
// a glowing gradient fill on the active card (grey glass on the others), a white round ↗ button,
// dot-matrix numerals, a dot grid (here: oxygen left, one dot per 1/24 of the tank) and a pill status chip.

export type ScoredRoute = PlannedRoute & { daylight: Daylight | null };

export default function RouteCards({
  routes,
  selected,
  onSelect,
  busy,
  poiName,
}: {
  routes: ScoredRoute[];
  selected: Strategy;
  onSelect: (s: Strategy) => void;
  busy: boolean;
  poiName: (id: string) => string;
}) {
  if (!routes.length) {
    return (
      <aside className="rc-col">
        {(['SAFE', 'FAST', 'SCIENCE'] as const).map((s) => (
          <div key={s} className="rc rc-empty">
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-medium">{ROUTE_STYLE[s].label} route</span>
              <span className="rc-btn opacity-40">
                <IArrowUR size={15} />
              </span>
            </div>
            <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{busy ? 'Planning…' : ROUTE_STYLE[s].blurb}</p>
            <div className="mt-auto">
              <DotNum text="-:--" height={26} color="#71717a" />
            </div>
          </div>
        ))}
        {!busy && <p className="rc-hint">Pick a target: a science site or anywhere on the map.</p>}
      </aside>
    );
  }
  return (
    <aside className="rc-col">
      {routes.map((r) => (
        <Card key={r.strategy} r={r} active={r.strategy === selected} onSelect={() => onSelect(r.strategy)} poiName={poiName} busy={busy} />
      ))}
    </aside>
  );
}

function Card({ r, active, onSelect, poiName, busy }: { r: ScoredRoute; active: boolean; onSelect: () => void; poiName: (id: string) => string; busy: boolean }) {
  const s = ROUTE_STYLE[r.strategy];
  const b = r.budget;
  const o2 = Math.max(0, Math.min(100, b.marginPct));
  const dots = 24;
  const lit = Math.round((o2 / 100) * dots);
  const lvl = r.verdict.lvl;
  const sub = r.poisVisited.length ? `Stops: ${r.poisVisited.map(poiName).join(' → ')}` : r.note ?? s.blurb;
  return (
    <button
      onClick={onSelect}
      className={`rc text-left ${active ? 'rc-on' : ''} ${busy ? 'opacity-70' : ''}`}
      style={active ? { background: s.grad } : undefined}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[14px] font-medium">{s.label} route</div>
          <div className="mt-0.5 line-clamp-1 text-[11px] text-white/60">{sub}</div>
        </div>
        <span className="rc-btn">
          <IArrowUR size={15} />
        </span>
      </div>

      <div className="mt-3 flex items-end gap-2.5">
        <DotNum text={fmtClock(b.totalT)} height={24} label={`EVA time ${fmtClock(b.totalT)}`} />
        <span className="pb-0.5 text-[11px] leading-tight text-white/70">
          EVA
          <br />
          h:mm
        </span>
        <span className="ml-auto pb-0.5 text-right text-[10.5px] leading-tight text-white/70">
          <span className="flex items-center justify-end gap-1">
            <i className="inline-block h-1.5 w-1.5 rounded-full bg-white" /> O₂ left
          </span>
          <span className="flex items-center justify-end gap-1">
            <i className="inline-block h-1.5 w-1.5 rounded-full border border-white/60" /> used
          </span>
        </span>
      </div>

      {active && (
        <div className="rc-dots" aria-hidden>
          {Array.from({ length: dots }).map((_, i) => (
            <i key={i} data-on={i < lit} />
          ))}
        </div>
      )}

      <div className="mt-auto flex items-end justify-between gap-2 pt-3">
        <div>
          <div className="text-[10.5px] text-white/60">O₂ at the airlock</div>
          <DotNum text={`${o2.toFixed(0)}%`} height={active ? 30 : 22} label={`${o2.toFixed(0)} percent oxygen left`} />
        </div>
        <div className="text-right">
          <div className="text-[10.5px] text-white/60">km</div>
          <DotNum text={(b.distance / 1000).toFixed(1)} height={active ? 30 : 22} />
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="flex gap-3 font-mono text-[10.5px] text-white/70">
          <span title="Steepest ground on the route">{b.maxSlope.toFixed(0)}° max</span>
          {b.doseMSv !== undefined && (
            <span title="Dose for the whole EVA. Curiosity's RAD measured 0.64 mSv per day at Gale's surface (Hassler et al. 2014).">{b.doseMSv.toFixed(2)} mSv</span>
          )}
          {r.daylight && <span title="Back at the airlock (local solar time)">↩ {hm(r.daylight.endH)}</span>}
        </span>
        <span className={`rc-chip rc-chip-${lvl}`}>{VERDICT_LABEL[lvl]}</span>
      </div>
    </button>
  );
}
