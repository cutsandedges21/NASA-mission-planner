'use client';

// Mission Simulator panel (T-35). Runs 20 seeded EVAs per route in the planner worker
// (planner/src/simulate.js), recommends the route that holds up best, and lets the user step
// through every run. Also shows the step-by-step legs (planner/src/steps.js) and the pit stop.
// Every number comes from the simulator; event chances are labelled team assumptions.
import { useEffect, useMemo, useState } from 'react';
import { simulate, type PlannedRoute, type SimResult, type Strategy } from '@/lib/plan-client';
import { ROUTE_STYLE, fmtDur, fmtKm } from './map/format';

type Tab = 'runs' | 'steps' | 'assumptions';
const OUTCOME_COLOR = { completed: '#34d399', 'turned back': '#fbbf24', unsafe: '#f87171' } as const;

export default function ScenarioPanel({
  routes,
  selected,
  onSelect,
  poiName,
  Ls,
  spaceWeatherLvl,
  sunByStrategy,
  pitStop,
  placingPitStop,
  onTogglePitStop,
  onClearPitStop,
  regionId = 'gale',
  className = '',
}: {
  /** The routes the page shows (already filtered, e.g. without SCIENCE). Must come from the latest plan() call. */
  routes: PlannedRoute[] | null;
  selected: Strategy;
  onSelect: (s: Strategy) => void;
  poiName: (id: string) => string;
  /** Solar longitude now (marsClock().Ls): dust season is Ls 180–360°. */
  Ls?: number;
  spaceWeatherLvl?: string;
  sunByStrategy?: Partial<Record<Strategy, { endMarginH: number }>>;
  pitStop?: [number, number] | null;
  placingPitStop?: boolean;
  onTogglePitStop?: () => void;
  onClearPitStop?: () => void;
  /** Loads /data/<regionId>/dust.json (MDAD storm rates by season, data/dust_gale.py) if it exists. */
  regionId?: string;
  className?: string;
}) {
  const [sim, setSim] = useState<{ key: PlannedRoute[]; res: SimResult } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('runs');
  const [pick, setPick] = useState<{ key: SimResult | null; i: number | null }>({ key: null, i: null });
  const [open, setOpen] = useState(true);
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

  const strategies = useMemo(() => (routes ?? []).filter((r) => r.path).map((r) => r.strategy), [routes]);
  const names = useMemo(() => {
    const ids = new Set((routes ?? []).flatMap((r) => r.stops.map((s) => s.id)));
    return Object.fromEntries([...ids].map((id) => [id, id === 'pitstop' ? 'your pit stop' : poiName(id)]));
  }, [routes, poiName]);
  const sunKey = JSON.stringify(sunByStrategy ?? {});

  useEffect(() => {
    if (!routes || !strategies.length || dustData === undefined) return;
    let live = true;
    simulate({ Ls, spaceWeatherLvl, strategies, names, sunByStrategy: JSON.parse(sunKey), dust: dustData, forceDust: stress })
      .then((res) => { if (live) { setSim({ key: routes, res }); setErr(null); } })
      .catch((e: Error) => { if (live) setErr(e.message); });
    return () => { live = false; };
  }, [routes, strategies, names, Ls, spaceWeatherLvl, sunKey, dustData, stress]);

  const res = sim && sim.key === routes && sim.res.forceDust === stress ? sim.res : null;
  const cur = res?.routes.find((r) => r.strategy === selected) ?? res?.routes[0] ?? null;
  const s = cur?.summary ?? null;
  const runIdx = pick.key === res && pick.i != null ? pick.i : s?.typical ?? 0;
  const run = cur?.runs[runIdx] ?? null;
  const tagOf = (i: number) => (s ? [i === s.typical && 'typical', i === s.best && 'best', i === s.worst && 'worst'].filter(Boolean).join(' · ') : '');
  const legs = res?.steps?.[cur?.strategy ?? selected] ?? [];

  if (!routes) return null;

  return (
    <div className={`panel p-4 text-zinc-200 ${className}`} data-testid="scenario-panel">
      <div className="flex items-center justify-between gap-3">
        <button className="flex items-center gap-2" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          <h2 className="eyebrow">Mission simulator</h2>
          <span className="text-[10px] text-zinc-500">{open ? '▾' : '▸'}</span>
        </button>
        {res?.recommended && (
          <div className="flex items-center gap-2 text-[11px]">
            <span className="text-zinc-500">Holds up best</span>
            <button
              onClick={() => onSelect(res.recommended!)}
              className="rounded-md px-1.5 py-0.5 font-semibold text-[#07080a]"
              style={{ background: ROUTE_STYLE[res.recommended].color }}
              data-testid="scenario-recommended"
            >
              {res.recommended}
            </button>
          </div>
        )}
      </div>

      {open && (
        <>
          {err && <p className="mt-2 text-[12px] text-red-300">Simulator: {err}</p>}
          {!res && !err && <p className="mt-2 text-[12px] text-zinc-500">Simulating 20 EVAs per route…</p>}
          {res && <p className="mt-2 text-[12.5px] leading-relaxed" data-testid="scenario-summary">{res.text}</p>}

          <label className="mt-2 flex items-center gap-2 text-[11px] text-zinc-300">
            <input type="checkbox" checked={stress} onChange={(e) => setStress(e.target.checked)} data-testid="scenario-stress" />
            What if a dust storm hits? (stress test: a storm in every run)
          </label>

          {/* Pit stop */}
          {onTogglePitStop && (
            <div className="mt-2 flex items-center gap-2 text-[11px]">
              <button
                onClick={onTogglePitStop}
                className={`rounded-md border px-2 py-1 ${placingPitStop ? 'border-orange-300 text-orange-200' : 'border-white/15 text-zinc-300 hover:border-white/30'}`}
                data-testid="scenario-pitstop"
              >
                {placingPitStop ? 'Click the map to place the pit stop…' : pitStop ? 'Move pit stop' : '+ Add a pit stop'}
              </button>
              {pitStop && onClearPitStop && (
                <button onClick={onClearPitStop} className="text-zinc-500 hover:text-zinc-300" data-testid="scenario-pitstop-clear">
                  Remove
                </button>
              )}
            </div>
          )}

          {res && (
            <>
              <div className="mt-3 flex gap-1 text-[11px]" role="tablist">
                {(['runs', 'steps', 'assumptions'] as Tab[]).map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => setTab(t)}
                    className={`rounded-md px-2 py-1 ${tab === t ? 'bg-white/10 text-white' : 'text-zinc-400 hover:text-zinc-200'}`}
                    data-testid={`scenario-tab-${t}`}
                  >
                    {t === 'runs' ? 'Simulated runs' : t === 'steps' ? 'Step by step' : 'Assumptions'}
                  </button>
                ))}
              </div>

              {tab === 'runs' && (
                <div className="mt-2 space-y-2">
                  {res.routes.filter((r) => r.summary).map((r) => (
                    <div key={r.strategy} className="flex items-center gap-2">
                      <button
                        onClick={() => onSelect(r.strategy)}
                        className={`w-16 shrink-0 text-left text-[11px] font-semibold ${r.strategy === cur?.strategy ? 'text-white' : 'text-zinc-500'}`}
                        style={{ color: r.strategy === cur?.strategy ? ROUTE_STYLE[r.strategy].color : undefined }}
                      >
                        {r.strategy} {r.summary!.completed}/{r.summary!.n}
                      </button>
                      <div className="flex flex-wrap gap-[3px]">
                        {r.runs.map((x, i) => {
                          const on = r.strategy === cur?.strategy && i === runIdx;
                          return (
                            <button
                              key={i}
                              onClick={() => { onSelect(r.strategy); setPick({ key: res, i }); }}
                              title={`Run ${i + 1}: ${x.outcome}${tagOf(i) && r.strategy === cur?.strategy ? ` (${tagOf(i)})` : ''}`}
                              className={`h-3.5 w-3.5 rounded-[3px] ${on ? 'ring-2 ring-white' : ''}`}
                              style={{ background: OUTCOME_COLOR[x.outcome], opacity: r.strategy === cur?.strategy ? 1 : 0.45 }}
                              data-testid={r.strategy === cur?.strategy ? `scenario-run-${i}` : undefined}
                              aria-label={`${r.strategy} run ${i + 1}, ${x.outcome}`}
                            />
                          );
                        })}
                      </div>
                    </div>
                  ))}
                  <div className="flex gap-3 text-[10px] text-zinc-500">
                    <span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: OUTCOME_COLOR.completed }} />completed</span>
                    <span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: OUTCOME_COLOR['turned back'] }} />turned back</span>
                    <span><i className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: OUTCOME_COLOR.unsafe }} />unsafe</span>
                  </div>

                  {run && s && (
                    <div className="rounded-xl border border-white/10 bg-black/20 p-3" data-testid="scenario-run-detail">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-semibold text-white">
                          {cur!.strategy} · run {runIdx + 1} of {s.n}
                          {tagOf(runIdx) && <span className="ml-1.5 font-normal text-orange-200">({tagOf(runIdx)})</span>}
                        </span>
                        <span className="flex items-center gap-1">
                          <button className="px-1 text-zinc-400 hover:text-white" onClick={() => setPick({ key: res, i: (runIdx + s.n - 1) % s.n })} aria-label="Previous run">‹</button>
                          <button className="px-1 text-zinc-400 hover:text-white" onClick={() => setPick({ key: res, i: (runIdx + 1) % s.n })} aria-label="Next run">›</button>
                        </span>
                      </div>
                      <div className="mt-1 grid grid-cols-4 gap-2 text-[11px] text-zinc-400">
                        <span>Time <b className="block text-zinc-100">{fmtDur(run.totalT)}</b></span>
                        <span>Distance <b className="block text-zinc-100">{fmtKm(run.distance)}</b></span>
                        <span>O₂ left <b className="block text-zinc-100">{run.marginPct.toFixed(0)} %</b></span>
                        <span>Dose <b className="block text-zinc-100">{run.doseMSv.toFixed(2)} mSv</b></span>
                      </div>
                      <p className="mt-2 text-[12px] leading-relaxed text-zinc-200">{run.text}</p>
                      {run.events.flatMap((e) => e.damage).length > 0 && (
                        <ul className="mt-1.5 list-disc pl-4 text-[11px] text-zinc-400">
                          {run.events.flatMap((e) => e.damage).map((d, k) => <li key={k}>{d}</li>)}
                        </ul>
                      )}
                      <p className="mt-1.5 text-[10px] text-zinc-500">
                        Seed {run.seed} · same weather on every route in run {runIdx + 1} · 10–90 % time {fmtDur(s.p10TotalT)}–{fmtDur(s.p90TotalT)}
                      </p>
                    </div>
                  )}
                </div>
              )}

              {tab === 'steps' && (
                <ol className="mt-2 max-h-72 space-y-1.5 overflow-y-auto pr-1 text-[12px]" data-testid="scenario-steps">
                  {legs.map((l) => (
                    <li key={l.n} className="flex gap-2">
                      <span className={`mt-0.5 w-5 shrink-0 text-right font-mono text-[10px] ${l.steep ? 'text-amber-300' : 'text-zinc-500'}`}>{l.n}</span>
                      <span className="leading-snug">{l.text}</span>
                    </li>
                  ))}
                  {!legs.length && <li className="text-zinc-500">No walkable route.</li>}
                </ol>
              )}

              {tab === 'assumptions' && (
                <div className="mt-2 text-[11px] text-zinc-400" data-testid="scenario-assumptions">
                  <p className="mb-1.5 text-zinc-300">
                    Walking time and O₂ use the planner&apos;s EVA model. The chances and sizes of events are our assumptions, not NASA measurements:
                  </p>
                  <ul className="max-h-60 space-y-1 overflow-y-auto pr-1">
                    {Object.entries(res.assumptions).map(([k, a]) => (
                      <li key={k}><b className="font-mono text-zinc-200">{a.value}</b> · {a.why}</li>
                    ))}
                  </ul>
                  {res.dustSource && (
                    <p className="mt-1.5 text-zinc-400">
                      Storm chance per EVA comes from data: {res.dustSource}
                      {res.dustRate && ` At Ls ${res.dustRate.ls[0]}–${res.dustRate.ls[1]}°: a storm over this area on ${res.dustRate.solsWithStorm} of ${res.dustRate.sols} sols.`}
                    </p>
                  )}
                  <p className="mt-1.5 text-zinc-500">
                    Dust season now: {Ls != null ? (((Ls % 360) + 360) % 360 >= 180 ? `yes (Ls ${Ls.toFixed(0)}°)` : `no (Ls ${Ls.toFixed(0)}°)`) : 'unknown'}. Storms are far larger than this map, so routes can&apos;t go around them: the crew keeps going or turns back.
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
