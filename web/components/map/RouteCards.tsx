'use client';

import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import { hm, type Daylight } from '@/lib/mars-context';
import { ROUTE_STYLE, VERDICT_LABEL, fmtClock } from './format';
import type { ReactNode } from 'react';
import { Rail, RailCard } from './Rail';

// Route dashboard (dashboard reference cosmos_1419633483): cards with big radii, a glowing gradient on the
// selected card, a white round arrow button and a status chip. Two routes (SAFE, FAST). Each card starts
// small (title, time, distance, O₂, verdict) and grows on hover or with its arrow (Rail.tsx). Every number
// has a one-line explanation of what it means, in the same font as the rest of the app.

export type ScoredRoute = PlannedRoute & { daylight: Daylight | null };

/** The suit's oxygen reserve: getting back with less than this is NO-GO (planner/src/eva.js). */
const RESERVE_PCT = 25;

const VERDICT_MEANS: Record<'go' | 'caution' | 'nogo', string> = {
  go: 'GO: every limit is met',
  caution: 'CAUTION: allowed, but close to a limit',
  nogo: 'NO-GO: breaks a safety limit',
};

export default function RouteCards({
  routes,
  selected,
  onSelect,
  busy,
  children,
}: {
  routes: ScoredRoute[];
  selected: Strategy;
  onSelect: (s: Strategy) => void;
  busy: boolean;
  poiName?: (id: string) => string;
  /** More cards under the two routes (the Mission simulator). */
  children?: ReactNode;
}) {
  return (
    <Rail>
      {routes.length
        ? routes.map((r) => <Card key={r.strategy} r={r} active={r.strategy === selected} onSelect={() => onSelect(r.strategy)} busy={busy} />)
        : (['SAFE', 'FAST'] as const).map((s) => (
            <RailCard
              key={s}
              id={s}
              title={`${ROUTE_STYLE[s].label} route`}
              sub={busy ? 'Planning…' : ROUTE_STYLE[s].blurb}
              summary={busy ? 'Planning…' : 'Pick a target first'}
              className="rc-empty"
              testId={`route-card-${s}`}
            >
              <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">
                {s === 'SAFE'
                  ? 'Uses the least oxygen and keeps off ground steeper than 15°, even if it walks farther.'
                  : 'Gets there in the least time. It may climb steeper ground (up to the 20° suit limit).'}
              </p>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-500">Pick a target: a bookmark or anywhere on the map.</p>
            </RailCard>
          ))}
      {children}
    </Rail>
  );
}

function Card({ r, active, onSelect, busy }: { r: ScoredRoute; active: boolean; onSelect: () => void; busy: boolean }) {
  const s = ROUTE_STYLE[r.strategy];
  const b = r.budget;
  const lvl = r.verdict.lvl;
  const chip = (
    <span className={`rc-chip rc-chip-${lvl}`} title={VERDICT_MEANS[lvl]}>
      {VERDICT_LABEL[lvl]}
    </span>
  );
  if (!b) {
    return (
      <RailCard id={r.strategy} title={`${s.label} route`} sub="No walkable route" side={chip} onSelect={onSelect} pressed={active} className={busy ? 'opacity-70' : ''} testId={`route-card-${r.strategy}`}>
        <p className="mt-3 text-[12px] leading-relaxed text-zinc-400">{r.verdict.issues?.[0]?.msg ?? 'No walkable route found between these points.'}</p>
      </RailCard>
    );
  }
  const o2 = Math.max(0, Math.min(100, b.marginPct));
  const issue = r.verdict.issues?.find((i) => i.lvl === lvl)?.msg;
  const rover = b.mode === 'rover';
  return (
    <RailCard
      id={r.strategy}
      title={`${s.label} route`}
      sub={r.note ?? s.blurb}
      summary={`${fmtClock(b.totalT)} h · ${(b.distance / 1000).toFixed(1)} km · O₂ ${o2.toFixed(0)} %`}
      side={chip}
      onSelect={onSelect}
      pressed={active}
      className={`${active ? 'rc-on' : ''} ${busy ? 'opacity-70' : ''}`}
      style={active ? { background: s.grad } : undefined}
      testId={`route-card-${r.strategy}`}
    >
      {/* stats scroll inside the card when the window is short, so the verdict row below always shows */}
      <div className="rc-body">
        <div className="rc-grid">
          <Stat k="Time outside" v={fmtClock(b.totalT)} unit="h:mm" big d="From leaving the base until you are back in the airlock, including work at the target." />
          <Stat k="O₂ left at the airlock" v={`${o2.toFixed(0)}`} unit="%" big d={`Oxygen still in the suit when you get back. Under ${RESERVE_PCT} % (the safety reserve) is NO-GO.`} />
        </div>

        <div className="rc-o2" aria-hidden>
          <span className="rc-o2-fill" style={{ width: `${o2}%` }} />
          <span className="rc-o2-res" style={{ left: `${RESERVE_PCT}%` }} title="Safety reserve" />
        </div>

        <div className="rc-grid">
          <Stat k="Distance" v={(b.distance / 1000).toFixed(1)} unit="km" d={`Out and back, ${rover ? 'driving and walking' : 'on foot'}.`} />
          <Stat k="Steepest slope" v={b.maxSlope.toFixed(0)} unit="°" d={`Steepest ground on the way. ${rover ? 'Rover limit 20°.' : 'Suit limit 20°; Safe stays under 15°.'}`} />
          {r.daylight && <Stat k="Back at" v={hm(r.daylight.endH)} unit="solar" d="Local solar time you are back. It must be before sunset." />}
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-[11px] leading-snug text-white/70">{issue ?? VERDICT_MEANS[lvl]}</span>
        {chip}
      </div>
    </RailCard>
  );
}

function Stat({ k, v, unit, d, big }: { k: string; v: string; unit: string; d?: string; big?: boolean }) {
  return (
    <div className="rc-stat" title={d}>
      <div className="rc-k">{k}</div>
      <div className={big ? 'rc-v rc-v-big' : 'rc-v'}>
        {v}
        <span className="rc-u">{unit}</span>
      </div>
      {d && <div className="rc-d">{d}</div>}
    </div>
  );
}
