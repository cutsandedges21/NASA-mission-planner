'use client';

import { useEffect, useState } from 'react';
import type { Strategy } from '@/lib/plan-client';
import type { ExplainRequest } from '@/lib/explain';
import { hm, marsClock } from '@/lib/mars-context';
import Briefing from '../Briefing';
import type { ScoredRoute } from './RouteCards';
import { ROUTE_COLORS, ROUTE_STYLE, VERDICT_LABEL, VERDICT_TONE, fmtDur, fmtKm } from './format';
import { IChevDown, IChevUp, ICrosshair, ICube, ILayers, IPin, IPlay, ISun, STRATEGY_ICON, IRadio, IInfo } from './icons';

// Docked control card, 1:1 with the eclipse-globe reference (cosmos_1789371071): a dark tab block
// (two big tabs, then a chip row with ‹ › arrows) sitting on a black card (time top-left, three icons
// top-right, big title + grey subtitle, icon row at the bottom), with a pill button + round button under it.

export default function DockCard({
  base,
  baseName,
  destName,
  routes,
  selected,
  onSelect,
  briefing,
  onRecommended,
  onFrame,
  showSlope,
  onSlope,
  view3d,
  on3d,
  onMoveBase,
  onSimulate,
}: {
  base: [number, number] | null;
  baseName: string;
  destName: string | null;
  routes: ScoredRoute[];
  selected: Strategy;
  onSelect: (s: Strategy) => void;
  briefing: ExplainRequest | null;
  onRecommended: (s: Strategy) => void;
  onFrame: () => void;
  showSlope: boolean;
  onSlope: (v: boolean) => void;
  view3d: boolean;
  on3d: (v: boolean) => void;
  onMoveBase: () => void;
  onSimulate?: () => void;
}) {
  const [tab, setTab] = useState<'route' | 'briefing'>('route');
  const [collapsed, setCollapsed] = useState(false);
  const [time, setTime] = useState<string>('--:--');
  useEffect(() => {
    if (!base) return;
    const tick = () => setTime(hm(marsClock(base[0], base[1]).ltst));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [base]);

  const order: Strategy[] = ['SAFE', 'FAST', 'SCIENCE'];
  const r = routes.find((x) => x.strategy === selected) ?? null;
  const step = (d: number) => onSelect(order[(order.indexOf(selected) + d + 3) % 3]);
  const sun = r?.daylight;

  return (
    <div className="dock pointer-events-none absolute bottom-4 left-1/2 z-10 hidden w-[320px] -translate-x-1/2 flex-col items-center md:flex">
      {(
        <div className={collapsed ? 'hidden' : 'pointer-events-auto w-full'}>
          {/* tab block */}
          <div className="dock-tabs">
            <div className="grid grid-cols-2 gap-1">
              <button onClick={() => setTab('route')} className={`dock-tab ${tab === 'route' ? 'dock-tab-on' : ''}`}>
                <IRadio size={15} /> Route
              </button>
              <button onClick={() => setTab('briefing')} className={`dock-tab ${tab === 'briefing' ? 'dock-tab-on' : ''}`}>
                <IInfo size={15} /> Briefing
              </button>
            </div>
            <div className="mt-1 flex items-center gap-0.5">
              <button className="dock-arrow" onClick={() => step(-1)} aria-label="Previous route">
                ‹
              </button>
              {order.map((s) => {
                const I = STRATEGY_ICON[s];
                return (
                  <button key={s} onClick={() => onSelect(s)} className={`dock-chip ${selected === s ? 'dock-chip-on' : ''}`}>
                    <I size={14} /> {ROUTE_STYLE[s].label}
                  </button>
                );
              })}
              <button className="dock-arrow" onClick={() => step(1)} aria-label="Next route">
                ›
              </button>
            </div>
          </div>

          {/* black card */}
          <div className="dock-card">
            <div className="flex items-center justify-between">
              <span className="text-[13px] font-semibold tabular-nums" title="Local solar time at the base">
                {time} <span className="font-normal text-zinc-500">LTST</span>
              </span>
              <span className="flex items-center gap-4 text-zinc-300">
                <button onClick={onFrame} title="Frame the routes" className="hover:text-white">
                  <ICrosshair size={17} />
                </button>
                <span title={sun ? `Back ${hm(sun.endH)}, ${sun.endMarginH.toFixed(1)} h before sunset` : 'Daylight'}>
                  <ISun size={17} />
                </span>
                <button onClick={() => setCollapsed(true)} title="Hide" className="hover:text-white">
                  <IChevDown size={17} />
                </button>
              </span>
            </div>

            {/* the briefing stays mounted so its recommendation is picked even on the Route tab */}
            <div className={tab === 'briefing' ? 'dock-brief mt-4' : 'hidden'}>
              {briefing ? (
                <Briefing request={briefing} onRecommended={onRecommended} colors={ROUTE_COLORS} />
              ) : (
                <p className="text-[13px] text-zinc-500">Pick a target to get a briefing.</p>
              )}
            </div>

            {tab === 'route' && (
              <div className="mt-6 min-h-[92px]">
                <div className="text-[21px] font-semibold leading-tight">{r ? `${ROUTE_STYLE[r.strategy].label} route` : 'No route yet'}</div>
                <div className="mt-1.5 line-clamp-1 text-[13px] text-zinc-400">
                  {baseName} → {destName ?? 'pick a target'}
                </div>
                {r && (
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-300">
                    <span className={`font-semibold ${VERDICT_TONE[r.verdict.lvl]}`}>{VERDICT_LABEL[r.verdict.lvl]}</span>
                    <span>{fmtKm(r.budget.distance)}</span>
                    <span>{fmtDur(r.budget.totalT)}</span>
                    {r.verdict.issues[0] && <span className="line-clamp-2 w-full text-[11.5px] text-zinc-500">{r.verdict.issues[0].msg}</span>}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex items-center justify-between px-1 text-zinc-300">
              <button
                onClick={onSimulate}
                disabled={!onSimulate || !r}
                title={onSimulate ? 'Simulate the EVA' : 'Simulate Mission: coming soon'}
                className="hover:text-white disabled:opacity-40"
              >
                <IPlay size={19} />
              </button>
              <span className="flex items-center gap-5">
                <button onClick={() => onSlope(!showSlope)} title="Slope hazard layer" className={showSlope ? 'text-[#f5c84b]' : 'hover:text-white'}>
                  <ILayers size={18} />
                </button>
                <button onClick={() => on3d(!view3d)} title="3D relief" className={view3d ? 'text-[#f5c84b]' : 'hover:text-white'}>
                  <ICube size={18} />
                </button>
                <button onClick={onMoveBase} title="Move the base" className="hover:text-white">
                  <IPin size={18} />
                </button>
              </span>
            </div>
          </div>
        </div>
      )}

      {/* pill + round button */}
      <div className="pointer-events-auto mt-2.5 flex items-center gap-2">
        <button
          onClick={() => {
            setCollapsed(false);
            setTab('briefing');
          }}
          className="dock-pill"
        >
          <IInfo size={16} /> Mission briefing
        </button>
        <button onClick={() => setCollapsed((c) => !c)} className="dock-round" aria-label={collapsed ? 'Show the route card' : 'Hide the route card'}>
          {collapsed ? <IChevUp size={16} /> : <IChevDown size={16} />}
        </button>
      </div>
    </div>
  );
}
