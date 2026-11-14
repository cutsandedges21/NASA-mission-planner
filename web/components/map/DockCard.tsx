'use client';

import { useEffect, useState } from 'react';
import type { Strategy } from '@/lib/plan-client';
import type { BriefingRequest } from '@/lib/briefing';
import { hm, marsClock } from '@/lib/mars-context';
import Briefing from '../Briefing';
import type { ScoredRoute } from './RouteCards';
import { ROUTE_COLORS, ROUTE_STYLE } from './format';
import { IChevDown, IChevUp, ICrosshair, ILayers, IPlay } from './icons';

// Bottom-centre dock (eclipse-globe reference: black card over the map + a pill button under it).
// One job only: the mission briefing for the selected route, plus the two actions you take after reading
// it (Simulate, and frame/slope tools). Route choice lives in the route cards, 2D/3D in the top bar.

export default function DockCard({
  base,
  routes,
  selected,
  briefing,
  onRecommended,
  onFrame,
  showSlope,
  onSlope,
  onSimulate,
  hidden = false,
}: {
  base: [number, number] | null;
  routes: ScoredRoute[];
  selected: Strategy;
  briefing: BriefingRequest | null;
  onRecommended: (s: Strategy) => void;
  onFrame: () => void;
  showSlope: boolean;
  onSlope: (v: boolean) => void;
  onSimulate?: () => void;
  hidden?: boolean;
}) {
  const [open, setOpen] = useState(true);
  const [time, setTime] = useState<string>('--:--');
  useEffect(() => {
    if (!base) return;
    const tick = () => setTime(hm(marsClock(base[0], base[1]).ltst));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [base]);

  const r = routes.find((x) => x.strategy === selected) ?? null;
  const has = routes.length > 0;

  return (
    <div className={`dock absolute bottom-4 left-1/2 z-10 hidden w-[380px] -translate-x-1/2 flex-col items-center md:flex ${hidden ? 'pointer-events-none opacity-0' : ''}`}>
      {/* the briefing stays mounted (hidden when collapsed) so its recommendation is still applied */}
      <div className={`dock-card w-full ${open && has ? '' : 'hidden'}`}>
        <div className="flex items-center justify-between">
          <span className="ui-label">Mission briefing</span>
          <span className="flex items-center gap-3 text-zinc-400">
            <span className="font-mono text-[11px]" title="Local solar time at the base">
              {time} LTST
            </span>
            <button onClick={() => setOpen(false)} title="Hide the briefing" className="hover:text-white">
              <IChevDown size={16} />
            </button>
          </span>
        </div>
        <div className="dock-brief mt-2">{briefing && <Briefing request={briefing} onRecommended={onRecommended} colors={ROUTE_COLORS} />}</div>
      </div>

      {/* toolbar */}
      <div className="mt-2.5 flex items-center gap-2">
        <button onClick={onSimulate} disabled={!onSimulate || !r} className="ui-primary" title={r ? `Play the ${ROUTE_STYLE[r.strategy].label} route` : 'Pick a target first'}>
          <IPlay size={15} /> {r ? `Simulate ${ROUTE_STYLE[r.strategy].label.toLowerCase()} route` : 'Simulate EVA'}
        </button>
        <button onClick={onFrame} disabled={!has} className="ui-round" title="Frame the routes">
          <ICrosshair size={16} />
        </button>
        <button onClick={() => onSlope(!showSlope)} className={`ui-round ${showSlope ? 'ui-round-on' : ''}`} title="Slope hazard layer">
          <ILayers size={16} />
        </button>
        {has && (
          <button onClick={() => setOpen((o) => !o)} className={`ui-round ${open ? 'ui-round-on' : ''}`} title={open ? 'Hide the briefing' : 'Show the briefing'}>
            {open ? <IChevDown size={16} /> : <IChevUp size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}
