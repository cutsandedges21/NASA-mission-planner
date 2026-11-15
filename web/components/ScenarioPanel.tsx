'use client';

// Mission Simulator card (T-35, Gianluca's spec Sat 19:40): five seeded simulations Point 1 → Point 2
// (planner/src/candidates.js, in the planner worker). Each seed has its own risk appetite, hidden ground and
// weather. Shows FASTEST, SAFEST and BALANCED; the other two stay available. Picking one draws it on the map
// (onPreview) and shows what happened, its safety problems and the step-by-step legs.
// Lives in the right-hand column under the Safe and Fast route cards and grows the same way (Rail.tsx).
// Pit stops are added from Quick targets in the EVA Planner.
// Every number comes from the simulator; event chances are MDAD data or labelled team assumptions.
import { useEffect, useMemo, useState } from 'react';
import { simulateCandidates, type Candidate, type CandidatesResult, type PlannedRoute } from '@/lib/plan-client';
import { fmtDur, fmtKm } from './map/format';
import { RailCard } from './map/Rail';

type Tab = 'what' | 'steps' | 'assumptions';
const ROLE_COLOR: Record<string, string> = {
  FASTEST: '#fbbf24',
  SAFEST: '#34d399',
  'FASTEST + SAFEST': '#34d399',
  BALANCED: '#60a5fa',
  ALTERNATIVE: '#a1a1aa',
  'NO ROUTE': '#f87171',
};
const LVL = { go: ['GO', 'text-emerald-300'], caution: ['CAUTION', 'text-amber-300'], nogo: ['NO-GO', 'text-red-300'] } as const;

export default function ScenarioPanel({
  routes,
  poiName,
  Ls,
  daylight,
  onPreview,
  regionId = 'gale',
}: {
  /** Routes from the latest plan() call: the simulator re-runs (in the worker) whenever they change. */
  routes: PlannedRoute[] | null;
  poiName: (id: string) => string;
  /** Solar longitude now (marsClock().Ls): picks the MDAD dust-storm rate for the season. */
  Ls?: number;
  /** Leave-at and sunset, local solar hours. */
  daylight?: { startH: number; sunsetH: number } | null;
  /** Draw the picked simulation's line (grid cells, like route.line) on the map; null clears it. */
  onPreview?: (line: [number, number][] | null) => void;
  regionId?: string;
}) {
  const [res, setRes] = useState<{ key: unknown; r: CandidatesResult } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('what');
  const [pick, setPick] = useState<{ key: CandidatesResult | null; i: number | null }>({ key: null, i: null });
  // Compact by default so the map stays visible; picking a simulation opens its details.
  const [details, setDetails] = useState(false);
  const [stress, setStress] = useState(false);
  const [dust, setDust] = useState<{ id: string; data: unknown } | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/data/${regionId}/dust.json`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((data) => { if (live) setDust({ id: regionId, data }); });
    return () => { live = false; };
  }, [regionId]);
  const dustData = dust && dust.id === regionId ? dust.data : undefined;

  const names = useMemo(() => {
    const ids = new Set((routes ?? []).flatMap((r) => r.stops.map((s) => s.id)));
    return Object.fromEntries([...ids].map((id) => [id, poiName(id)]));
  }, [routes, poiName]);
  const dayKey = daylight ? `${daylight.startH.toFixed(2)}|${daylight.sunsetH.toFixed(2)}` : '';
  const runKey = useMemo(() => ({ routes, stress, Ls, dayKey, dustData }), [routes, stress, Ls, dayKey, dustData]);

  useEffect(() => {
    if (!routes || !routes.some((r) => r.path) || dustData === undefined) return;
    let live = true;
    const [startH, sunsetH] = dayKey ? dayKey.split('|').map(Number) : [];
    simulateCandidates({ Ls, names, dust: dustData, forceDust: stress, daylight: dayKey ? { startH, sunsetH } : undefined })
      .then((r) => { if (live) { setRes({ key: runKey, r }); setErr(null); } })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [runKey, routes, names, Ls, dayKey, dustData, stress]);

  const r = res && res.key === runKey ? res.r : null;
  const defaultIdx = r ? (r.balanced ?? r.safest ?? r.fastest ?? 0) : 0;
  const idx = pick.key === r && pick.i != null ? pick.i : defaultIdx;
  const cur: Candidate | null = r?.runs[idx] ?? null;
  const ref = r && r.balanced != null ? r.runs[r.balanced] : null;

  useEffect(() => {
    onPreview?.(cur?.route?.line ?? null);
  }, [cur, onPreview]);
  useEffect(() => () => onPreview?.(null), [onPreview]);

  const planned = !!routes?.some((x) => x.path);
  const main = r ? [r.fastest, r.safest, r.balanced].filter((v, k, a): v is number => v != null && a.indexOf(v) === k) : [];
  const others = r ? r.runs.filter((x) => !main.includes(x.i)) : [];

  const card = (x: Candidate) => {
    const on = x.i === idx;
    const lvl = x.run ? LVL[x.run.lvl] : LVL.nogo;
    return (
      <button
        key={x.i}
        onClick={() => { setPick({ key: r, i: x.i }); setDetails(true); }}
        className={`block w-full rounded-xl border px-2.5 py-1.5 text-left transition ${on ? 'border-white/60 bg-white/[0.06]' : 'border-white/10 hover:border-white/25'}`}
        data-testid={`scenario-run-${x.i}`}
        aria-pressed={on}
      >
        <span className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-bold tracking-wider" style={{ color: ROLE_COLOR[x.role] }}>
            {x.role === 'ALTERNATIVE' ? `SIM ${x.i + 1}` : x.role}
          </span>
          <span className={`text-[10px] font-semibold ${lvl[1]}`}>{x.run ? lvl[0] : 'NO ROUTE'}</span>
        </span>
        {x.run ? (
          <span className="mt-0.5 flex justify-between gap-2 text-[11px] text-zinc-300">
            <span>{x.run.arriveS != null ? `${fmtDur(x.run.arriveS)} to Point 2` : 'turned back'}</span>
            <span className="text-zinc-400">
              {x.problems.length} problem{x.problems.length === 1 ? '' : 's'} · O₂ {x.run.marginPct.toFixed(0)}%
            </span>
          </span>
        ) : (
          <span className="mt-0.5 block text-[11px] text-red-300">No walkable route</span>
        )}
      </button>
    );
  };

  const bal = r && r.balanced != null ? r.runs[r.balanced] : null;
  const summary = !planned
    ? 'Pick a target to run 5 seeded EVAs'
    : !r
      ? err
        ? 'Simulator error'
        : 'Simulating 5 EVAs…'
      : bal?.run
        ? `5 seeded runs · Balanced ${bal.run.arriveS != null ? fmtDur(bal.run.arriveS) : 'turned back'} · ${LVL[bal.run.lvl][0]}`
        : '5 seeded runs';

  return (
    <RailCard id="seeds" title="Mission simulator" sub="5 seeded runs, Point 1 → Point 2" summary={summary} testId="scenario-panel">
      <div className="rc-body text-zinc-200">
          <p className="mt-2 text-[11.5px] leading-snug text-zinc-400" data-testid="scenario-summary">
            {planned
              ? 'Five seeded simulations: each has its own risk appetite, hidden ground and weather. Pick one to see it on the map (white dashed line).'
              : 'Pick a target (a bookmark or anywhere on the map) and five seeded simulations of the walk show up here.'}
          </p>
          {err && <p className="mt-2 text-[12px] text-red-300">Simulator: {err}</p>}
          {planned && !r && !err && <p className="mt-2 text-[12px] text-zinc-500">Simulating 5 EVAs…</p>}

          {r && (
            <>
              <div className="mt-2 space-y-1.5">{main.map((i) => card(r.runs[i]))}</div>
              {others.length > 0 && (
                <div className="mt-2 space-y-1.5">
                  <div className="text-[10px] uppercase tracking-wider text-zinc-500">Other simulations</div>
                  {others.map((x) => card(x))}
                </div>
              )}
            </>
          )}

          {planned && (
            <label className="mt-2 flex items-center gap-1.5 text-[11px] text-zinc-300">
              <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} data-testid="scenario-stress" />
              What if a dust storm hits?
            </label>
          )}

          {r && cur && (
            <button className="mt-2 self-start text-[11px] text-zinc-400 hover:text-white" onClick={() => setDetails(!details)} data-testid="scenario-details">
              {details ? 'Hide details ▴' : `Details for simulation ${cur.i + 1} ▾`}
            </button>
          )}

          {r && cur && details && (
            <>
              <div className="mt-2 flex gap-1 text-[11px]" role="tablist">
                {(['what', 'steps', 'assumptions'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`rounded-md px-2 py-1 ${tab === t ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                    data-testid={`scenario-tab-${t}`}
                  >
                    {t === 'what' ? 'What happened' : t === 'steps' ? 'Step by step' : 'Assumptions'}
                  </button>
                ))}
              </div>

              {tab === 'what' && (
                <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3" data-testid="scenario-run-detail">
                  <div className="text-[11px] font-semibold" style={{ color: ROLE_COLOR[cur.role] }}>
                    Simulation {cur.i + 1} of {r.runs.length} · {cur.role === 'ALTERNATIVE' ? 'alternative' : cur.role}
                  </div>
                  {cur.run && cur.route && (
                    <div className="mt-1 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
                      <span>Round trip <b className="block text-zinc-100">{fmtDur(cur.run.totalT)}</b></span>
                      <span>Distance <b className="block text-zinc-100">{fmtKm(cur.run.distance)}</b></span>
                      <span>Max slope <b className="block text-zinc-100">{cur.route.budget.maxSlope.toFixed(0)}°</b></span>
                    </div>
                  )}
                  <p className="mt-2 text-[12px] leading-relaxed text-zinc-200">{cur.text}</p>
                  {cur.run && cur.run.events.flatMap((e) => e.damage).length > 0 && (
                    <>
                      <div className="mt-2 text-[10px] uppercase tracking-wider text-zinc-500">Possible damage</div>
                      <ul className="mt-0.5 list-disc pl-4 text-[11px] text-zinc-400">
                        {cur.run.events.flatMap((e) => e.damage).map((d, k) => <li key={k}>{d}</li>)}
                      </ul>
                    </>
                  )}
                  {ref && ref !== cur && <p className="mt-1.5 text-[10px] text-zinc-500">Compared with BALANCED (simulation {ref.i + 1}).</p>}
                </div>
              )}

              {tab === 'steps' && (
                <ol className="mt-2 space-y-1.5" data-testid="scenario-steps">
                  {cur.steps.map((l) => {
                    // one leg = a headline ("Head NE for 1.20 km (~15 min, 120 g O₂).") + one short line per detail
                    const [head, ...rest] = l.text.split(/(?<=\.)\s+(?=[A-Z])/);
                    return (
                      <li key={l.n} className="rounded-lg bg-white/[0.035] px-2.5 py-2">
                        <div className="flex items-start gap-2">
                          <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold ${l.steep ? 'bg-amber-300/20 text-amber-200' : 'bg-white/10 text-zinc-300'}`}>{l.n}</span>
                          <span className="text-[12px] font-medium leading-snug text-zinc-100">{head}</span>
                        </div>
                        {rest.length > 0 && (
                          <ul className="mt-1 space-y-0.5 pl-7 text-[11px] leading-snug text-zinc-400">
                            {rest.map((t, k) => (
                              <li key={k} className={/^(Stop|Arrive)/.test(t) ? 'text-orange-200' : /steep/i.test(t) && l.steep ? 'text-amber-200' : ''}>
                                {t}
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    );
                  })}
                  {!cur.steps.length && <li className="text-zinc-500">No walkable route.</li>}
                </ol>
              )}

              {tab === 'assumptions' && (
                <div className="mt-2 text-[11px] text-zinc-400" data-testid="scenario-assumptions">
                  <p className="mb-1.5 text-zinc-300">
                    Routes, walking time and O₂ come from the planner&apos;s terrain data and EVA model. These are our assumptions, not NASA measurements:
                  </p>
                  <ul className="space-y-1">
                    <li><b className="font-mono text-zinc-200">0–1</b> · Risk appetite per seed: one simulation in each fifth, from pure speed to most cautious (slope limit 20° → 15°)</li>
                    {Object.entries(r.assumptions).map(([k, a]) => (
                      <li key={k}><b className="font-mono text-zinc-200">{a.value}</b> · {a.why}</li>
                    ))}
                  </ul>
                  {r.dustSource && (
                    <p className="mt-1.5 text-zinc-400">
                      Dust-storm chance comes from data: {r.dustSource}
                      {r.dustRate && ` At Ls ${r.dustRate.ls[0]}–${r.dustRate.ls[1]}°: a storm over this area on ${r.dustRate.solsWithStorm} of ${r.dustRate.sols} sols.`}
                    </p>
                  )}
                  <p className="mt-1.5 text-zinc-500">
                    Storms are far larger than this map, so a route can&apos;t go around one: the crew keeps going (τ ≤ 3) or turns back. Cautious runs (risk weight above 0.6) turn back for any storm.
                  </p>
                </div>
              )}
            </>
          )}
      </div>
    </RailCard>
  );
}
