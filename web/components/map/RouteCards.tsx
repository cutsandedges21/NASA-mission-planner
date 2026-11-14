'use client';

import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import { hm, type Daylight } from '@/lib/mars-context';
import { ROUTE_STYLE, VERDICT_LABEL, fmtClock } from './format';
import { IArrowUR } from './icons';

// Route dashboard (dashboard reference cosmos_1419633483): tall cards with big radii, a glowing gradient on
// the selected card, a white round ↗ button and a status chip. Two routes (SAFE, FAST). Every number has a
// one-line explanation of what it means, in the same font as the rest of the app.

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
}: {
  routes: ScoredRoute[];
  selected: Strategy;
  onSelect: (s: Strategy) => void;
  busy: boolean;
  poiName?: (id: string) => string;
}) {
  if (!routes.length) {
    return (
      <aside className="rc-col">
        {(['SAFE', 'FAST'] as const).map((s) => (
          <div key={s} className="rc rc-empty">
            <div className="flex items-center justify-between">
              <span className="text-[15px] font-semibold">{ROUTE_STYLE[s].label} route</span>
              <span className="rc-btn opacity-40">
                <IArrowUR size={15} />
              </span>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-zinc-400">{busy ? 'Planning…' : ROUTE_STYLE[s].blurb}</p>
            <p className="mt-auto text-[12px] leading-relaxed text-zinc-500">
              {s === 'SAFE'
                ? 'Uses the least oxygen and keeps off ground steeper than 15°, even if it walks farther.'
                : 'Gets there in the least time. It may climb steeper ground (up to the 20° suit limit).'}
            </p>
          </div>
        ))}
        {!busy && <p className="rc-hint">Pick a target: a bookmark or anywhere on the map.</p>}
      </aside>
    );
  }
  return (
    <aside className="rc-col">
      {routes.map((r) => (
        <Card key={r.strategy} r={r} active={r.strategy === selected} onSelect={() => onSelect(r.strategy)} busy={busy} />
      ))}
    </aside>
  );
}

function Card({ r, active, onSelect, busy }: { r: ScoredRoute; active: boolean; onSelect: () => void; busy: boolean }) {
  const s = ROUTE_STYLE[r.strategy];
  const b = r.budget;
  const o2 = Math.max(0, Math.min(100, b.marginPct));
  const lvl = r.verdict.lvl;
  const issue = r.verdict.issues?.find((i) => i.lvl === lvl)?.msg;
  const rover = b.mode === 'rover';
  return (
    <button
      onClick={onSelect}
      className={`rc text-left ${active ? 'rc-on' : ''} ${busy ? 'opacity-70' : ''}`}
      style={active ? { background: s.grad } : undefined}
      aria-pressed={active}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[15px] font-semibold">{s.label} route</div>
          <div className="mt-0.5 line-clamp-1 text-[11.5px] text-white/65">{r.note ?? s.blurb}</div>
        </div>
        <span className="rc-btn">
          <IArrowUR size={15} />
        </span>
      </div>

      <div className="rc-grid">
        <Stat
          k="Time outside"
          v={fmtClock(b.totalT)}
          unit="h:mm"
          big
          d={active ? 'From leaving the base until you are back in the airlock, including work at the target.' : undefined}
        />
        <Stat
          k="O₂ left at the airlock"
          v={`${o2.toFixed(0)}`}
          unit="%"
          big
          d={active ? `Oxygen still in the suit when you get back. Under ${RESERVE_PCT} % (the safety reserve) is NO-GO.` : undefined}
        />
      </div>

      {active && (
        <div className="rc-o2" aria-hidden>
          <span className="rc-o2-fill" style={{ width: `${o2}%` }} />
          <span className="rc-o2-res" style={{ left: `${RESERVE_PCT}%` }} title="Safety reserve" />
        </div>
      )}

      <div className="rc-grid mt-auto">
        <Stat k="Distance" v={(b.distance / 1000).toFixed(1)} unit="km" d={active ? `Out and back, ${rover ? 'driving and walking' : 'on foot'}.` : undefined} />
        <Stat k="Steepest slope" v={b.maxSlope.toFixed(0)} unit="°" d={active ? `Steepest ground on the way. ${rover ? 'Rover limit 20°.' : 'Suit limit 20°; Safe stays under 15°.'}` : undefined} />
        {b.doseMSv !== undefined && (
          <Stat k="Radiation" v={b.doseMSv.toFixed(2)} unit="mSv" d={active ? 'Dose for this EVA: Curiosity measured 0.64 mSv a day in Gale; higher ground gets more (NASA radiation map, +5 % per km), added up along the route.' : undefined} />
        )}
        {r.daylight && <Stat k="Back at" v={hm(r.daylight.endH)} unit="solar" d={active ? 'Local solar time you are back. It must be before sunset.' : undefined} />}
      </div>

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-[11px] leading-snug text-white/70">{active ? issue ?? VERDICT_MEANS[lvl] : ''}</span>
        <span className={`rc-chip rc-chip-${lvl}`} title={VERDICT_MEANS[lvl]}>
          {VERDICT_LABEL[lvl]}
        </span>
      </div>
    </button>
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
