'use client';

import { useEffect, useState } from 'react';
import { REGIONS, type Region } from '@/lib/region';
import { MARS_HOUR_S, hm, marsClock, type MarsClock } from '@/lib/mars-context';
import { useBookmarks, removeBookmark, fmtCoord } from '@/lib/bookmarks';
import AddBookmark from './map/AddBookmark';

// Landing + target picker, on the "Flight to Mars" reference (docs/design-references/cosmos_718343697.webp).
// The left column lists Gale Crater (the landing site) and the user's bookmarks; "+" adds a bookmark
// (name + coordinates, saved in this browser), like saved places in a map app. A bookmark inside the Gale
// planning area turns the planet into its real HiRISE terrain and plans an EVA to it; one elsewhere on Mars
// opens on the map.

/** What the landing page hands to the planner: a place to plan to (inside the region) or to look at. */
export type Target = { name: string; lon: number; lat: number };

const MARS_R_KM = 3389.5;
const GALE: [number, number] = [137.4417, -4.5895];

function distKm(a: [number, number], b: [number, number]) {
  const toR = Math.PI / 180;
  const x = (b[0] - a[0]) * toR * Math.cos(((a[1] + b[1]) / 2) * toR);
  const y = (b[1] - a[1]) * toR;
  return Math.hypot(x, y) * MARS_R_KM;
}

export default function Hero({ region, onPick, onSkip }: { region: Region | null; onPick: (t: Target) => void; onSkip: () => void }) {
  const base = region?.meta.base;
  const lon = base?.lon ?? GALE[0];
  const lat = base?.lat ?? GALE[1];
  const marks = useBookmarks();
  const m = region?.meta;
  const [active, setActive] = useState(-1); // -1 = Gale Crater (the landing site)
  const [adding, setAdding] = useState(false);
  const [c, setC] = useState<MarsClock | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const tick = () => setC(marsClock(lon, lat));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lon, lat]);

  const site = active >= 0 ? marks[active] ?? null : null;
  const inRegion = (p: { lon: number; lat: number }) => !!m && p.lon >= m.lon[0] && p.lon <= m.lon[1] && p.lat >= m.lat[0] && p.lat <= m.lat[1];

  const go = (fn: () => void) => {
    setLeaving(true);
    setTimeout(fn, 450);
  };
  const plan = () => (site ? go(() => onPick(site)) : go(onSkip));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (adding) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setActive((a) => Math.min(marks.length - 1, a + 1));
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setActive((a) => Math.max(-1, a - 1));
      if (e.key === 'Enter') {
        const s = active >= 0 ? marks[active] : null;
        setLeaving(true);
        setTimeout(() => (s ? onPick(s) : onSkip()), 450);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [marks, active, onPick, onSkip, adding]);

  // countdown to the next sunset at the base, in Earth time
  let left = 0;
  if (c) {
    let dh = c.set - c.ltst;
    if (dh < 0) dh += 24;
    left = Math.max(0, Math.round(dh * MARS_HOUR_S));
  }
  const daytime = c ? c.ltst > c.rise && c.ltst < c.set : true;

  // crop of the region's HiRISE colour mosaic centred on a place inside the region (else: the whole planet)
  const crop = (p: { lon: number; lat: number }, size: number): React.CSSProperties => {
    if (!m || !region || !inRegion(p)) return { backgroundImage: 'url(/img/mars-globe.jpg)', backgroundSize: 'cover' };
    const aspect = m.width / m.height;
    const fx = (p.lon - m.lon[0]) / (m.lon[1] - m.lon[0]);
    const fy = (m.lat[1] - p.lat) / (m.lat[1] - m.lat[0]);
    const Sw = size,
      Sh = Sw / aspect;
    return {
      backgroundImage: `url(${region.url('visible.jpg')})`,
      backgroundSize: `${Sw}px ${Sh}px`,
      backgroundPosition: `calc(50% + ${(0.5 - fx) * Sw}px) calc(50% + ${(0.5 - fy) * Sh}px)`,
    };
  };

  const baseName = base?.name ?? 'Bradbury Landing';
  const place = m?.about?.short ?? 'Gale Crater';
  const switchTo = (id: string) => {
    if (id === m?.id) return setActive(-1);
    const q = new URLSearchParams(window.location.search);
    q.set('region', id);
    window.location.assign(`${window.location.pathname}?${q.toString()}`);
  };
  const near = site ? inRegion(site) : false;
  const d = site ? distKm([lon, lat], [site.lon, site.lat]) : 0;
  const calls: string[] = site
    ? [
        `${d >= 100 ? Math.round(d).toLocaleString('en-US') : d.toFixed(1)} km from ${baseName}`,
        fmtCoord(site.lon, site.lat),
        near ? 'Inside the 1 m NASA terrain' : 'Outside the planning area',
        near ? `Round trip ≈ ${(d * 2).toFixed(1)} km` : 'Opens on the map',
      ]
    : ['Fourth planet', 'Sol = 24 h 39 min', 'Diameter 6,779 km', 'Gravity 0.38 g'];

  return (
    <div className={`hero absolute inset-0 z-50 overflow-hidden text-white transition-opacity duration-500 ${leaving ? 'pointer-events-none opacity-0' : ''}`}>
      <div className="hero-sky" aria-hidden />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-[6%] pt-6">
        <div className="hero-logo">
          EVA<span>Planner</span>
        </div>
        <div className="hidden text-[11px] tracking-[0.14em] text-white/60 md:block">NASA SPACE APPS 2026 · INTERPLANETARY SURVIVAL GUIDE</div>
        <div className="text-right">
          <div className="hero-clock">{m && m.id !== 'gale' ? 'LOCAL' : `SOL ${c ? c.sol.toLocaleString('en-US') : '----'}`} · {c ? hm(c.ltst) : '--:--'}</div>
          <div className="hero-clock-sub">{c ? `${c.season} at ${place}` : '…'}</div>
        </div>
      </div>

      {/* left: Gale Crater + bookmarks + "+" */}
      <div className="hero-rail" role="listbox" aria-label="Choose a target">
        <div className="hero-rail-k">CHOOSE A TARGET</div>
        {REGIONS.map((r) => (
          <RailItem
            key={r.id}
            on={active === -1 && m?.id === r.id}
            label={r.name}
            sub={m?.id === r.id ? `${r.sub} · open` : r.sub}
            onClick={() => switchTo(r.id)}
            style={{ backgroundImage: `url(/data/${r.id}/visible.jpg)`, backgroundSize: 'cover', backgroundPosition: 'center' }}
          />
        ))}
        {marks.map((b, i) => (
          <RailItem
            key={b.id}
            on={active === i}
            label={b.name}
            sub={inRegion(b) ? `${distKm([lon, lat], [b.lon, b.lat]).toFixed(1)} km` : 'elsewhere on Mars'}
            onClick={() => setActive(i)}
            onRemove={() => {
              removeBookmark(b.id);
              setActive(-1);
            }}
            style={crop(b, 700)}
          />
        ))}
        {adding ? (
          <div className="hero-add-form">
            <AddBookmark
              onDone={(b) => {
                setAdding(false);
                if (b) setActive(marks.length); // the new one is appended
              }}
            />
          </div>
        ) : (
          <button className="hero-item hero-add" onClick={() => setAdding(true)} title="Add a bookmark: a name and coordinates, saved in this browser">
            <span className="hero-dot hero-plus" aria-hidden>
              +
            </span>
            <span className="hero-item-t">
              <span>Add a bookmark</span>
              <span className="hero-item-s">name + coordinates</span>
            </span>
          </button>
        )}
      </div>

      {/* title block */}
      <div className="hero-copy">
        <div className="hero-k">{site ? (near ? 'BOOKMARK · WALK TO' : 'BOOKMARK · ELSEWHERE ON MARS') : 'WALK ON'}</div>
        <h1 className={`hero-h ${site ? 'hero-h-site' : ''}`}>{site ? site.name : 'MARS'}</h1>
        <p className="hero-p">
          {site
            ? near
              ? `Inside the ${place} planning area, so we can plan spacesuit walks to it from NASA terrain data: a safe route and a fast route, with oxygen, slope and daylight checked.`
              : 'Outside the 1 m NASA terrain we plan walks on. It opens on the map so you can explore it with NASA Trek’s global layers.'
            : `${m?.about?.blurb ?? 'Gale Crater is where Curiosity has driven since 2012: an ancient lake bed under a 5 km mountain.'} Open the map to plan a spacesuit walk, or pick another region on the left.`}
        </p>
        <div className="mt-7 flex items-center gap-5">
          <button className="hero-btn" onClick={plan}>
            {site ? (near ? 'PLAN THIS EVA →' : 'OPEN ON THE MAP →') : `OPEN ${place.toUpperCase()} →`}
          </button>
        </div>

        <div className="hero-count">
          <div className="hero-count-k">
            <i />
            {daytime ? `SUNSET AT ${place.toUpperCase()} IN` : `NEXT SUNRISE AT ${place.toUpperCase()} IN`}
          </div>
          <div className="mt-2 flex gap-3">
            {(() => {
              // daytime: time to sunset; night: time to sunrise (an EVA only starts in daylight)
              let s = left;
              if (c && !daytime) {
                let dh = c.rise - c.ltst;
                if (dh < 0) dh += 24;
                s = Math.round(dh * MARS_HOUR_S);
              }
              return (
                <>
                  <Box n={Math.floor(s / 3600)} k="HOURS" />
                  <Box n={Math.floor((s % 3600) / 60)} k="MINUTES" />
                  <Box n={s % 60} k="SECONDS" />
                </>
              );
            })()}
          </div>
        </div>
      </div>

      {/* planet: whole Mars, or the chosen bookmark's terrain */}
      <div className="hero-planet-wrap">
        <svg className="hero-orbits" viewBox="0 0 1000 1000" aria-hidden>
          <ellipse cx="500" cy="500" rx="470" ry="470" />
          <ellipse cx="500" cy="520" rx="520" ry="200" transform="rotate(-24 500 520)" />
          <ellipse cx="560" cy="560" rx="380" ry="140" transform="rotate(32 560 560)" />
        </svg>
        <div className={`hero-planet ${near ? 'opacity-0' : ''}`} style={{ backgroundImage: 'url(/img/mars-globe.jpg)' }} />
        {marks.map((b, i) =>
          inRegion(b) ? (
            <div key={b.id} className={`hero-planet hero-planet-site ${active === i ? '' : 'opacity-0'}`} style={crop(b, 2300)} aria-hidden={active !== i}>
              <span className="hero-target" />
            </div>
          ) : null,
        )}
        {calls.map((t, i) => (
          <span key={i} className="hero-call" style={CALL_POS[i]}>
            <i />
            {t}
          </span>
        ))}
      </div>
    </div>
  );
}

// on the planet's right-hand limb (planet radius = 36 % of the wrapper), labels run outwards to the right
const CALL_POS = [
  { left: '73%', top: '22.4%' },
  { left: '84.8%', top: '40.7%' },
  { left: '83.8%', top: '62.3%' },
  { left: '70.6%', top: '79.5%' },
] as const;

function RailItem({
  on,
  label,
  sub,
  onClick,
  onRemove,
  style,
}: {
  on: boolean;
  label: string;
  sub: string;
  onClick: () => void;
  onRemove?: () => void;
  style: React.CSSProperties;
}) {
  return (
    <div className="hero-item-wrap">
      <button role="option" aria-selected={on} onClick={onClick} className={`hero-item ${on ? 'hero-item-on' : ''}`}>
        <span className="hero-dot" style={style} />
        <span className="hero-item-t">
          <span>{label}</span>
          <span className="hero-item-s">{sub}</span>
        </span>
      </button>
      {onRemove && (
        <button className="hero-item-x" onClick={onRemove} title={`Delete the bookmark “${label}”`} aria-label={`Delete ${label}`}>
          ×
        </button>
      )}
    </div>
  );
}

function Box({ n, k }: { n: number; k: string }) {
  return (
    <div className="hero-box">
      <span className="hero-box-k">{k}</span>
      <span className="hero-box-n">{String(n).padStart(2, '0')}</span>
    </div>
  );
}
