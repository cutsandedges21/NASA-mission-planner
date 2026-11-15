'use client';

import { useEffect, useRef, useState } from 'react';
import type { RegionMeta } from '@/lib/region';
import type { Strategy } from '@/lib/plan-client';
import { hm, marsClock, type Daylight, type MarsClock } from '@/lib/mars-context';
import { useBookmarks, removeBookmark, fmtCoord, type Bookmark } from '@/lib/bookmarks';
import { ROUTE_STYLE, fmtLL } from './format';
import type { MapType } from '@/lib/trek';
import { IChevDown, IChevUp, IInfo, ILayers, IPin, ISun, IGrid, IClock } from './icons';
import AddBookmark from './AddBookmark';
import { GrowArrow, useGrow } from './Rail';

// Mission setup, 1:1 with the Spherium panel reference (cosmos_979618069): near-black column, two tabs,
// collapsible sections with an icon + title + chevron, small grey sub-labels, tile grids where the active
// tile gets a gold outline, sliders with a gold pill thumb and the value in gold on the right.
// Quick targets = the user's bookmarks (web/lib/bookmarks.ts), with "+" to add one, plus the pit stops.
// The whole panel folds into a narrow vertical strip and grows back on hover or with its arrow, the same
// way the right-hand cards do (Rail.tsx, Justin Sun 15 Nov). It starts open.

const pct = (h: number) => `${Math.min(100, Math.max(0, (h / 24) * 100))}%`;
/** Most science gear the slider offers, kg (planner params.kitKg; docs/VALIDATION.md has the sensitivity). */
const KIT_MAX = 20;

export default function SetupPanel({
  meta,
  destName,
  onPickTarget,
  onPickBookmarkOnMap,
  pickingBookmark = false,
  bookmarkAt = null,
  onBookmarkDone,
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
  view3d,
  onView3d,
  base,
  hasTraverse = false,
  rover = false,
  onRover,
  kit = 0,
  onKit,
  pitStops = [],
  placingPitStop = false,
  onAddPitStop,
  onRemovePitStop,
}: {
  /** Pit stops (lng/lat) in the order the routes visit them. */
  pitStops?: [number, number][];
  placingPitStop?: boolean;
  /** Start (or cancel) "click the map to place the next pit stop". */
  onAddPitStop?: () => void;
  onRemovePitStop?: (i: number) => void;
  hasTraverse?: boolean;
  /** Rover assist: plan and time the mission with an unpressurised rover. */
  rover?: boolean;
  onRover?: (v: boolean) => void;
  /** Science gear carried on top of the suit, kg (planner params.kitKg). */
  kit?: number;
  onKit?: (kg: number) => void;
  meta: RegionMeta | null;
  destName: string | null;
  /** Plan to a bookmark (inside the region) or fly to it (elsewhere on Mars). */
  onPickTarget: (b: Bookmark) => void;
  /** Start "click the map to place the bookmark". */
  onPickBookmarkOnMap?: () => void;
  pickingBookmark?: boolean;
  /** The point picked on the map for a new bookmark (pre-fills the form). */
  bookmarkAt?: [number, number] | null;
  onBookmarkDone?: () => void;
  baseLabel: string;
  placingBase: boolean;
  onMoveBase: () => void;
  selected: Strategy;
  clock: MarsClock | null;
  startH: number;
  onStart: (h: number) => void;
  windows: { strategy: Strategy; d: Daylight | null }[];
  /** Map layer (T-33): colour, thermal or elevation (height). Slope lives in the dock card. */
  mapType: MapType;
  onMapType: (t: MapType) => void;
  view3d: boolean;
  onView3d: (v: boolean) => void;
  base: [number, number] | null;
}) {
  const [tab, setTab] = useState<'mission' | 'conditions'>('mission');
  const [open, setOpen] = useState({ sites: true, mode: true, route: true, env: true, clock: true });
  const flip = (k: keyof typeof open) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  const marks = useBookmarks();
  const [adding, setAdding] = useState(false);
  const showForm = adding || pickingBookmark || !!bookmarkAt;
  const closeForm = () => {
    setAdding(false);
    onBookmarkDone?.();
  };

  // fold into a vertical strip / grow back (starts open)
  const grow = useGrow('panel');
  const panelOpen = grow.openId === 'panel';
  const asideRef = useRef<HTMLElement>(null);
  /** Don't fold away under the pointer while something is being typed in the panel. */
  const typing = () => {
    const el = document.activeElement;
    return showForm || (!!el && !!asideRef.current?.contains(el) && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && (el as HTMLInputElement).type !== 'range');
  };

  // science gear slider: the number follows the thumb at once, the routes re-plan once it rests
  const [kitDraft, setKitDraft] = useState(kit);
  useEffect(() => {
    if (!onKit || kitDraft === kit) return;
    const t = setTimeout(() => onKit(kitDraft), 300);
    return () => clearTimeout(t);
  }, [kitDraft, kit, onKit]);

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
  const inRegion = (b: Bookmark) => !!meta && b.lon >= meta.lon[0] && b.lon <= meta.lon[1] && b.lat >= meta.lat[0] && b.lat <= meta.lat[1];
  const layer = mapType === 'thermal' || mapType === 'height' ? mapType : null;

  return (
    <aside
      ref={asideRef}
      className={`sp sp-grow absolute bottom-4 left-4 top-20 z-10 hidden overflow-hidden md:flex ${panelOpen ? 'sp-open' : ''}`}
      onMouseEnter={() => grow.enter('panel')}
      onMouseLeave={() => grow.leave(typing())}
      data-testid="setup-panel"
    >
      {/* small: a vertical strip (logo, arrow, title written top to bottom) */}
      <div className="sp-strip" onClick={() => grow.keep('panel')} inert={panelOpen} aria-hidden={panelOpen}>
        <span className="sp-logo" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <i key={i} />
          ))}
        </span>
        <GrowArrow open={false} onClick={() => grow.toggle('panel')} label="the EVA Planner" className="rc-btn sp-side" />
        <span className="sp-strip-title">EVA Planner · {regionName.split(':')[0]}</span>
      </div>

      {/* open: the full panel, laid out at full width and clipped while it grows */}
      <div className="sp-full flex w-[300px] flex-none flex-col" inert={!panelOpen} aria-hidden={!panelOpen}>
      {/* header */}
      <div className="flex items-center gap-3 px-5 pb-4 pt-5">
        <span className="sp-logo" aria-hidden>
          {Array.from({ length: 16 }).map((_, i) => (
            <i key={i} />
          ))}
        </span>
        <span className="whitespace-nowrap text-[15px] font-semibold">EVA Planner</span>
        <span className="sp-badge" title={regionName}>{regionName.split(':')[0]}</span>
        <GrowArrow open onClick={() => grow.toggle('panel')} label="the EVA Planner" className="rc-btn sp-side ml-auto" />
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
            {/* quick targets = bookmarks */}
            <Section icon={<IGrid size={15} />} title="Quick targets" open={open.sites} onFlip={() => flip('sites')}>
              <Sub>Bookmarks</Sub>
              <div className="grid grid-cols-2 gap-1.5">
                {marks.map((b) => (
                  <div key={b.id} className="group relative">
                    <button
                      onClick={() => onPickTarget(b)}
                      className={`sp-tile w-full ${destName === b.name ? 'sp-on' : ''}`}
                      title={`${b.name} · ${fmtCoord(b.lon, b.lat)}${inRegion(b) ? '' : ' · outside the planning area: opens on the map'}`}
                    >
                      <span className="truncate">{b.name}</span>
                    </button>
                    <button
                      onClick={() => removeBookmark(b.id)}
                      className="sp-x"
                      title={`Delete the bookmark “${b.name}”`}
                      aria-label={`Delete ${b.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
                {!showForm && (
                  <button onClick={() => setAdding(true)} className="sp-tile sp-add" title="Add a bookmark: a name and coordinates, or a point picked on the map">
                    + Add
                  </button>
                )}
                {!showForm && marks.length === 0 && <span className="sp-tile pointer-events-none text-zinc-500">or click the map</span>}
              </div>
              {showForm && (
                <div className="mt-2">
                  {pickingBookmark ? (
                    <p className="rounded-lg border border-[#f5c84b]/40 bg-[#f5c84b]/[0.06] px-3 py-2 text-[11.5px] text-[#f5c84b]">Click anywhere on the map to place the bookmark…</p>
                  ) : (
                    <AddBookmark
                      key={bookmarkAt ? bookmarkAt.join() : 'typed'}
                      initial={bookmarkAt}
                      onPickOnMap={onPickBookmarkOnMap}
                      onDone={(b) => {
                        closeForm();
                        if (b) onPickTarget(b);
                      }}
                    />
                  )}
                </div>
              )}
              {marks.length > 0 && !showForm && <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">Pick a bookmark to plan a walk to it, or click the map. Saved in this browser.</p>}
              <Sub>Base</Sub>
              <button onClick={onMoveBase} className={`sp-tile w-full justify-between px-3 ${placingBase ? 'sp-on' : ''}`}>
                <span className="flex items-center gap-2 truncate">
                  <IPin size={14} />
                  {placingBase ? 'Click the map to place the base' : baseLabel}
                </span>
                <span className="text-[10px] text-zinc-500">{placingBase ? 'cancel' : 'move'}</span>
              </button>
              {onAddPitStop && (
                <>
                  <Sub>Pit stops</Sub>
                  <div className="space-y-1.5" data-testid="pitstops">
                    {pitStops.map((p, i) => (
                      <div key={`${i}-${p.join()}`} className="relative">
                        <div className="sp-tile w-full px-3 text-zinc-200" style={{ justifyContent: 'flex-start' }} title={`Pit stop ${i + 1} · ${fmtLL(p)}`} data-testid={`pitstop-${i + 1}`}>
                          <span className="sp-num">{i + 1}</span>
                          Pit stop {i + 1}
                        </div>
                        {onRemovePitStop && (
                          <button onClick={() => onRemovePitStop(i)} className="sp-x sp-x-on" title={`Remove pit stop ${i + 1}`} aria-label={`Remove pit stop ${i + 1}`}>
                            ×
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={onAddPitStop} className={`sp-tile sp-add w-full ${placingPitStop ? 'sp-on' : ''}`} data-testid="pitstop-add">
                      {placingPitStop ? `Click the map to place pit stop ${pitStops.length + 1} (cancel)` : `+ Add pit stop${pitStops.length ? ` ${pitStops.length + 1}` : ''}`}
                    </button>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                    {pitStops.length
                      ? `Every route stops at ${pitStops.length === 1 ? 'the pit stop' : `all ${pitStops.length} pit stops, in this order,`} on the way out, then goes on to the target.`
                      : 'Add places the walk must stop at on the way to the target. Add as many as you like.'}
                  </p>
                </>
              )}
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
                    ? 'Unpressurised rover at 1.4 m/s with a 20° slope limit; the crew works on foot at the target. Press Simulate to ride it in first person.'
                    : 'The crew walks the whole way. Switch to a rover to reach the far sites.'}
                </p>
                {onKit && (
                  <>
                    <div className="mt-4 flex items-baseline justify-between">
                      <Sub flush>Science gear carried</Sub>
                      <span className="sp-val">{kitDraft ? `${kitDraft} kg` : 'None'}</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={KIT_MAX}
                      step={1}
                      value={kitDraft}
                      onChange={(e) => setKitDraft(+e.target.value)}
                      className="sp-range"
                      aria-label="Science gear carried, kilograms"
                      data-testid="kit"
                    />
                    <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                      <span>None</span>
                      <span>10 kg</span>
                      <span>{KIT_MAX} kg</span>
                    </div>
                    <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">
                      {kitDraft
                        ? `${kitDraft} kg on top of the suit (drill, sample bags, cameras). Every step costs more effort, so the suit uses more oxygen${rover ? ' when the crew walks' : ''}.`
                        : 'Slide to add a drill, sample bags or cameras and see what the extra weight costs in oxygen.'}
                    </p>
                  </>
                )}
              </Section>
            )}

            {/* leave at: EVA start time + daylight window */}
            <Section icon={<ISun size={15} />} title="Leave at" open={open.route} onFlip={() => flip('route')}>
              {clock && (
                <>
                  <div className="mt-3 flex items-baseline justify-between">
                    <Sub flush>Leave the base at (local solar time)</Sub>
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
                    aria-label="Time to leave the base, local solar time"
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
                            top: 8 + i * 9,
                            height: strategy === selected ? 5 : 3,
                            background: ROUTE_STYLE[strategy].color,
                            opacity: strategy === selected ? 1 : 0.4,
                          }}
                        />
                      ) : null,
                    )}
                  </div>
                  <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                    <span>sunrise {hm(clock.rise)}</span>
                    <span>sunset {hm(clock.set)}</span>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">The bars show each route&apos;s time outside, from leaving the base to getting back to the airlock. It has to end before sunset.</p>
                </>
              )}
            </Section>

            {/* map options */}
            <Section icon={<ILayers size={15} />} title="Map" open={open.env} onFlip={() => flip('env')}>
              <Sub>View</Sub>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => onView3d(false)} className={`sp-tile ${!view3d ? 'sp-on' : ''}`} title="Flat map, seen from above">
                  2D
                </button>
                <button onClick={() => onView3d(true)} className={`sp-tile ${view3d ? 'sp-on' : ''}`} title="Tilted 3D terrain from the NASA elevation data">
                  3D
                </button>
              </div>
              <Sub>Layer</Sub>
              <div className="grid grid-cols-2 gap-1.5">
                <button onClick={() => onMapType(layer === 'thermal' ? 'colour' : 'thermal')} className={`sp-tile ${layer === 'thermal' ? 'sp-on' : ''}`} title={LAYER_INFO.thermal}>
                  Thermal
                </button>
                <button onClick={() => onMapType(layer === 'height' ? 'colour' : 'height')} className={`sp-tile ${layer === 'height' ? 'sp-on' : ''}`} title={LAYER_INFO.height}>
                  Elevation
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-zinc-500">{LAYER_INFO[layer ?? 'colour']}</p>
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
            <Section icon={<IClock size={15} />} title="Mars clock" open={open.clock} onFlip={() => flip('clock')}>
              <div className="mt-2 space-y-1.5" data-testid="conditions">
                <Stat k="Curiosity sol" v={live ? live.sol.toLocaleString('en-US') : '—'} d="Days (sols) since Curiosity landed in Gale Crater on 6 August 2012." />
                <Stat k="Local solar time" v={live ? hm(live.ltst) : '—'} d="Time of day at the base by the Sun (noon = Sun highest)." />
                <Stat
                  k="Season"
                  v={live ? `${live.season.replace(/^(Northern|Southern) /, '')} · Ls ${live.Ls.toFixed(0)}°` : '—'}
                  d="Mars' position around the Sun (Ls 0° = northern spring). Dust storms are most common from Ls 180° to 330°."
                />
                <Stat k="Signal to Earth" v={live ? `${live.delayMin.toFixed(1)} min` : '—'} d="One-way light time (3–22 min). Mission Control can't help in real time." />
                {live && <Stat k="Daylight" v={`${hm(live.rise)} – ${hm(live.set)}`} d="Sunrise to sunset at the base today. Every EVA must be back before sunset." />}
              </div>
            </Section>
            {base && <p className="mt-4 text-[10px] text-zinc-500">Base {fmtLL(base)}</p>}
          </>
        )}
      </div>
      </div>
    </aside>
  );
}

const LAYER_INFO: Record<'colour' | 'thermal' | 'height', string> = {
  colour: 'True colour: HiRISE colour over Gale (NASA MRO). The map shows only the Gale planning area; press Globe for the rest of Mars.',
  thermal: 'Thermal: THEMIS night infrared (NASA Mars Odyssey), contrast stretched to Gale. Warm colours = ground that holds heat (rock); dark = dust and sand that cool fast.',
  height: 'Elevation: the 1 m NASA terrain of Gale. Purple and blue = low, green and yellow = middle, red to white = high. Each colour covers about the same area, so small rises stand out.',
};

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

/** A condition: name and value on one line, what it means underneath. Display only, nothing to drag. */
function Stat({ k, v, d }: { k: string; v: string; d: string }) {
  return (
    <div className="sp-stat">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[11.5px] text-zinc-400">{k}</span>
        <span className="whitespace-nowrap text-[13px] font-semibold tabular-nums text-zinc-100">{v}</span>
      </div>
      <p className="mt-0.5 text-[10.5px] leading-snug text-zinc-500">{d}</p>
    </div>
  );
}
