'use client';

import { useEffect, useState } from 'react';
import type { Poi, RegionMeta } from '@/lib/region';
import type { Strategy } from '@/lib/plan-client';
import type { SpaceWeatherStatus } from '@/lib/space-weather';
import { hm, marsClock, type Daylight, type MarsClock } from '@/lib/mars-context';
import { ROUTE_STYLE, fmtLL } from './format';
import type { MapType } from '@/lib/trek';
import { IChevDown, IChevUp, IInfo, ILayers, IPin, ISun, IGrid, IClock } from './icons';
import { GEOLOGY_LEGEND, GEOLOGY_NOTE } from '@/lib/geology-layer';

// Mission setup, 1:1 with the Spherium panel reference (cosmos_979618069): near-black column, two tabs,
// collapsible sections with an icon + title + chevron, small grey sub-labels, tile grids where the active
// tile gets a gold outline, sliders with a gold pill thumb and the value in gold on the right.

const pct = (h: number) => `${Math.min(100, Math.max(0, (h / 24) * 100))}%`;

export default function SetupPanel({
  meta,
  pois,
  destName,
  onPickPoi,
  baseLabel,
  placingBase,
  onMoveBase,
  selected,
  clock,
  startH,
  onStart,
  windows,
  mapType,
  onMapType,
  weather,
  base,
  hasTraverse = false,
  rover = false,
  onRover,
  geology = false,
  onGeology,
}: {
  hasTraverse?: boolean;
  /** Geologic units overlay (T-34, approximate, after NASA/JPL PIA26042). The toggle shows only when onGeology is passed. */
  geology?: boolean;
  onGeology?: (v: boolean) => void;
  /** Rover assist: plan and time the mission with an unpressurised rover. */
  rover?: boolean;
  onRover?: (v: boolean) => void;
  meta: RegionMeta | null;
  pois: Poi[];
  destName: string | null;
  onPickPoi: (p: Poi) => void;
  baseLabel: string;
  placingBase: boolean;
  onMoveBase: () => void;
  selected: Strategy;
  clock: MarsClock | null;
  startH: number;
  onStart: (h: number) => void;
  windows: { strategy: Strategy; d: Daylight | null }[];
  /** Map type (T-33): NASA Trek global layer + the region's matching layer; slope = colour + slope overlay. */
  mapType: MapType;
  onMapType: (t: MapType) => void;
  weather: SpaceWeatherStatus | null;
  base: [number, number] | null;
}) {
  const [tab, setTab] = useState<'mission' | 'conditions'>('mission');
  const [open, setOpen] = useState({ sites: true, mode: true, route: true, env: true });
  const flip = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));

  // live clock for the Conditions tab
  const [live, setLive] = useState<MarsClock | null>(clock);
  useEffect(() => {
    if (!base) return;
    const tick = () => setLive(marsClock(base[0], base[1]));
    tick();
    const t = setInterval(tick, 10_000);
    return () => clearInterval(t);
  }, [base]);

  const regionName = meta ? meta.name.replace(/\s*\(.*\)/, '') : 'Mars';
  const lo = clock ? Math.ceil(clock.rise * 4) / 4 : 6;
  const hi = clock ? Math.floor((clock.set - 1) * 4) / 4 : 17;

  return (
    <aside className="sp absolute bottom-4 left-4 top-20 z-10 hidden w-[300px] flex-col md:flex">
      {/* header */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="sp-logo" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="whitespace-nowrap text-[15px] font-semibold">EVA Planner</span>
        <span className="sp-badge" title={regionName}>{regionName.split(':')[0]}</span>
      </div>

      <div className="sp-scroll flex-1 overflow-y-auto px-4 pb-5">
        {/* tabs */}
        <div className="grid grid-cols-2 gap-1.5">
          {(['mission', 'conditions'] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)} className={`sp-tab ${tab === t ? 'sp-tab-on' : ''}`}>
              {t === 'mission' ? 'Mission' : 'Conditions'}
            </button>
          ))}
        </div>

        {tab === 'mission' ? (
          <>
            {/* science sites */}
            <Section icon={<IGrid size={15} />} title="Science sites" open={open.sites} onFlip={() => flip('sites')}>
              <Sub>Quick targets</Sub>
              <div className="grid grid-cols-2 gap-1.5">
                {pois.map((p) => (
                  <button key={p.id} onClick={() => onPickPoi(p)} className={`sp-tile ${destName === p.name ? 'sp-on' : ''}`} title={p.why}>
                    <span className="truncate">{p.name}</span>
                  </button>
                ))}
                <span className="sp-tile pointer-events-none text-zinc-500">or click the map</span>
              </div>
              <Sub>Base</Sub>
              <button onClick={onMoveBase} className={`sp-tile w-full justify-between px-3 ${placingBase ? 'sp-on' : ''}`}>
                <span className="flex items-center gap-2 truncate">
                  <IPin size={14} />
                  {placingBase ? 'Click the map to place the base' : baseLabel}
                </span>
                <span className="text-[10px] text-zinc-500">{placingBase ? 'cancel' : 'move'}</span>
              </button>
            </Section>

            {/* mode: on foot or rover assist */}
            {onRover && (
              <Section icon={<IRover size={15} />} title="Mode" open={open.mode} onFlip={() => flip('mode')}>
                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <button onClick={() => onRover(false)} className={`sp-tile ${!rover ? 'sp-on' : ''}`}>
                    On foot
                  </button>
                  <button onClick={() => onRover(true)} className={`sp-tile ${rover ? 'sp-on' : ''}`}>
                    Rover assist
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                  {rover
                    ? 'Unpressurised rover at 1.4 m/s with a 20° slope limit; the crew works on foot at each site. Press Simulate to ride it in first person.'
                    : 'The crew walks the whole way. Switch to a rover to reach the far sites.'}
                </p>
              </Section>
            )}

            {/* route */}
            <Section icon={<ISun size={15} />} title="Daylight" open={open.route} onFlip={() => flip('route')}>
              {clock && (
                <>
                  <div className="mt-3 flex items-baseline justify-between">
                    <Sub flush>EVA start (local solar time)</Sub>
                    <span className="sp-val">{hm(startH)}</span>
                  </div>
                  <input
                    type="range"
                    min={lo}
                    max={hi}
                    step={0.25}
                    value={startH}
                    onChange={(e) => onStart(+e.target.value)}
                    className="sp-range"
                    style={{ ['--p' as string]: `${((startH - lo) / Math.max(0.01, hi - lo)) * 100}%` }}
                    aria-label="EVA start time, local solar time"
                  />
                  <div className="relative mt-3 h-8 overflow-hidden rounded-lg bg-black/60">
                    <div className="absolute inset-y-0 bg-[#f5c84b]/10" style={{ left: pct(clock.rise), width: `calc(${pct(clock.set)} - ${pct(clock.rise)})` }} />
                    {windows.map(({ strategy, d }, i) =>
                      d ? (
                        <div
                          key={strategy}
                          className="absolute rounded-full transition-all"
                          style={{
                            left: pct(d.startH),
                            width: `calc(${pct(d.endH)} - ${pct(d.startH)})`,
                            top: 6 + i * 8,
                            height: strategy === selected ? 5 : 3,
                            background: ROUTE_STYLE[strategy].color,
                            opacity: strategy === selected ? 1 : 0.4,
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
                    <span>sunrise {hm(clock.rise)}</span>
                    <span>sunset {hm(clock.set)}</span>
                  </div>
                </>
              )}
            </Section>

            {/* environment */}
            <Section icon={<ILayers size={15} />} title="Environment" open={open.env} onFlip={() => flip('env')}>
              <Sub>Map type</Sub>
              <div className="grid grid-cols-2 gap-1.5">
                {MAP_TYPES.map((t) => (
                  <button key={t.id} onClick={() => onMapType(t.id)} className={`sp-tile ${mapType === t.id ? 'sp-on' : ''}`} title={t.title}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{MAP_TYPES.find((t) => t.id === mapType)?.title}</p>
              {onGeology && (
                <>
                  <Sub>Geology</Sub>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button onClick={() => onGeology(false)} className={`sp-tile ${!geology ? 'sp-on' : ''}`}>Off</button>
                    <button onClick={() => onGeology(true)} className={`sp-tile ${geology ? 'sp-on' : ''}`} title={GEOLOGY_NOTE}>Rock units</button>
                  </div>
                  {geology && (
                    <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] text-zinc-400">
                      {GEOLOGY_LEGEND.map((u) => (
                        <span key={u.id} className="flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: u.color }} />
                          {u.name}
                        </span>
                      ))}
                      <p className="col-span-2 mt-1 text-[10.5px] leading-relaxed text-zinc-500">{GEOLOGY_NOTE}</p>
                    </div>
                  )}
                </>
              )}
              {hasTraverse && (
                <div className="mt-3 flex items-center gap-2.5 text-[11.5px] text-zinc-400">
                  <svg width="26" height="4" aria-hidden>
                    <line x1="1" y1="2" x2="25" y2="2" stroke="#f5efe6" strokeOpacity="0.9" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                  Curiosity&apos;s real drive path (NASA/JPL)
                </div>
              )}
              {meta?.synthetic && (
                <p className="mt-3 flex gap-2 text-[11px] leading-relaxed text-zinc-500">
                  <IInfo size={14} className="mt-0.5 shrink-0" />
                  Demo terrain. Real NASA data for {regionName} is being processed and will replace it.
                </p>
              )}
            </Section>
          </>
        ) : (
          <>
            <Section icon={<IClock size={15} />} title="Mars clock" open onFlip={() => {}}>
              <Meter k="Curiosity sol" v={live ? live.sol.toLocaleString('en-US') : '—'} />
              <Meter k="Local solar time" v={live ? hm(live.ltst) : '—'} frac={live ? live.ltst / 24 : 0} />
              <Meter k="Season" v={live ? `${live.season.replace(/^(Northern|Southern) /, '')} · Ls ${live.Ls.toFixed(0)}°` : '—'} frac={live ? live.Ls / 360 : 0} />
              <Meter k="Signal to Earth" v={live ? `${live.delayMin.toFixed(1)} min` : '—'} frac={live ? live.delayMin / 22.3 : 0} title="One-way light time (3–22 min). Mission Control can't help in real time." />
              {live && <Meter k="Daylight" v={`${hm(live.rise)} – ${hm(live.set)}`} frac={(live.set - live.rise) / 24} />}
            </Section>
            <Section icon={<IInfo size={15} />} title="Space weather" open onFlip={() => {}}>
              <p className={`text-[12px] leading-relaxed ${weather?.lvl === 'warn' ? 'text-[#f5c84b]' : 'text-zinc-300'}`}>{weather?.long ?? 'Checking NASA DONKI…'}</p>
              <p className="mt-2 text-[11px] text-zinc-500">Live CME forecasts from NASA DONKI (WSA-ENLIL). A storm heading for Mars turns every route to CAUTION.</p>
            </Section>
            {base && (
              <p className="mt-4 font-mono text-[10px] text-zinc-500">
                Base {fmtLL(base)}
              </p>
            )}
          </>
        )}
      </div>
    </aside>
  );
}

function IRover({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 15h18M5 15v-4l3-3h8l3 3v4" />
      <circle cx="7.5" cy="17.2" r="2.2" />
      <circle cx="16.5" cy="17.2" r="2.2" />
      <path d="M12 8V5l3-1" />
    </svg>
  );
}

function Section({ icon, title, open, onFlip, children }: { icon: React.ReactNode; title: string; open: boolean; onFlip: () => void; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <button onClick={onFlip} className="flex w-full items-center gap-2.5 text-left">
        <span className="sp-ico">{icon}</span>
        <span className="flex-1 text-[14px] font-medium text-zinc-100">{title}</span>
        <span className="text-zinc-500">{open ? <IChevUp size={15} /> : <IChevDown size={15} />}</span>
      </button>
      {open && <div className="mt-1">{children}</div>}
    </section>
  );
}

function Sub({ children, flush }: { children: React.ReactNode; flush?: boolean }) {
  return <div className={`${flush ? '' : 'mb-2 mt-3'} text-[11.5px] text-zinc-500`}>{children}</div>;
}

function Meter({ k, v, frac, title }: { k: string; v: string; frac?: number; title?: string }) {
  return (
    <div className="mt-3" title={title}>
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] text-zinc-500">{k}</span>
        <span className="sp-val text-[11.5px]">{v}</span>
      </div>
      {frac !== undefined && (
        <div className="relative mt-2 h-1.5 rounded-full bg-white/[0.04]">
          <span className="sp-knob" style={{ left: `calc(${Math.min(1, Math.max(0, frac)) * 100}% - 20px * ${Math.min(1, Math.max(0, frac))})` }} />
        </div>
      )}
    </div>
  );
}

const MAP_TYPES: { id: MapType; label: string; title: string }[] = [
  { id: 'colour', label: 'Colour', title: 'Viking colour mosaic (NASA Trek) + HiRISE colour over Gale' },
  { id: 'height', label: 'Height', title: 'MOLA colour relief (NASA Trek) + the 1 m NASA DEM over Gale' },
  { id: 'thermal', label: 'Thermal', title: 'THEMIS day IR (NASA Trek) + THEMIS night IR over Gale: warm = rock that holds heat' },
  { id: 'slope', label: 'Slope', title: 'Hazard: steepest ground in each 25 m cell, from the 1 m NASA DEM' },
];
