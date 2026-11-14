'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Poi, Region } from '@/lib/region';
import { MARS_HOUR_S, hm, marsClock, type MarsClock } from '@/lib/mars-context';

// Landing + target picker, on the "Flight to Mars" reference (docs/design-references/cosmos_718343697.webp):
// a column of round thumbnails on the left picks what the big planet on the right shows. "Gale" shows the
// whole planet (NASA Viking mosaic PIA00407); each science site turns the planet into that site's real HiRISE
// terrain, and the title, facts and callouts switch with it. The main button then plans that EVA.

const MARS_R_KM = 3389.5;
const GALE: [number, number] = [137.4417, -4.5895];

function distKm(a: [number, number], b: [number, number]) {
  const toR = Math.PI / 180;
  const x = (b[0] - a[0]) * toR * Math.cos(((a[1] + b[1]) / 2) * toR);
  const y = (b[1] - a[1]) * toR;
  return Math.hypot(x, y) * MARS_R_KM;
}

export default function Hero({ region, onPick, onSkip }: { region: Region | null; onPick: (p: Poi) => void; onSkip: () => void }) {
  const base = region?.meta.base;
  const lon = base?.lon ?? GALE[0];
  const lat = base?.lat ?? GALE[1];
  const pois = useMemo(() => region?.pois ?? [], [region]);
  const m = region?.meta;
  const [active, setActive] = useState(-1); // -1 = whole planet
  const [c, setC] = useState<MarsClock | null>(null);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    const tick = () => setC(marsClock(lon, lat));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lon, lat]);

  const site = active >= 0 ? pois[active] : null;

  const go = (fn: () => void) => {
    setLeaving(true);
    setTimeout(fn, 450);
  };
  const plan = () => {
    if (site) go(() => onPick(site));
    else if (pois.length) setActive(0);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pois.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') setActive((a) => Math.min(pois.length - 1, a + 1));
      if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') setActive((a) => Math.max(-1, a - 1));
      if (e.key === 'Enter' && active >= 0) {
        setLeaving(true);
        setTimeout(() => onPick(pois[active]), 450);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pois, active, onPick]);

  // countdown to the next sunset at the base, in Earth time
  let left = 0;
  if (c) {
    let dh = c.set - c.ltst;
    if (dh < 0) dh += 24;
    left = Math.max(0, Math.round(dh * MARS_HOUR_S));
  }
  const daytime = c ? c.ltst > c.rise && c.ltst < c.set : true;

  // crop of the region's HiRISE colour mosaic centred on a site
  const crop = (p: Poi, size: number) => {
    if (!m || !region) return {};
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
  const d = site ? distKm([lon, lat], [site.lon, site.lat]) : 0;
  const calls: string[] = site
    ? [`${d.toFixed(1)} km from ${baseName}`, `${Math.abs(site.lat).toFixed(3)}°${site.lat < 0 ? 'S' : 'N'} ${site.lon.toFixed(3)}°E`, `Source: ${site.source.split(/[;,(]/)[0].trim()}`, `Round trip ≈ ${(d * 2).toFixed(1)} km on foot`]
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
          <div className="hero-clock">SOL {c ? c.sol.toLocaleString('en-US') : '----'} · {c ? hm(c.ltst) : '--:--'}</div>
          <div className="hero-clock-sub">{c ? `${c.season} at Gale` : '…'}</div>
        </div>
      </div>

      {/* left: target column */}
      <div className="hero-rail" role="listbox" aria-label="Choose a target">
        <div className="hero-rail-k">CHOOSE A TARGET</div>
        <RailItem on={active === -1} label="Gale Crater" sub="overview" onClick={() => setActive(-1)} style={{ backgroundImage: 'url(/img/mars-globe.jpg)', backgroundSize: 'cover' }} />
        {pois.map((p, i) => (
          <RailItem key={p.id} on={active === i} label={p.name} sub={`${distKm([lon, lat], [p.lon, p.lat]).toFixed(1)} km`} onClick={() => setActive(i)} style={crop(p, 700)} />
        ))}
      </div>

      {/* title block */}
      <div className="hero-copy">
        <div className="hero-k">{site ? `TARGET ${String(active + 1).padStart(2, '0')} · WALK TO` : 'WALK ON'}</div>
        <h1 className={`hero-h ${site ? 'hero-h-site' : ''}`}>{site ? site.name : 'MARS'}</h1>
        <p className="hero-p">
          {site
            ? site.why
            : 'Gale Crater is where Curiosity has driven since 2012: an ancient lake bed under a 5 km mountain. Choose a science target on the left and we plan three spacesuit walks to it from NASA terrain data.'}
        </p>
        <div className="mt-7 flex items-center gap-5">
          <button className="hero-btn" onClick={plan} disabled={!pois.length}>
            {site ? 'PLAN THIS EVA →' : 'CHOOSE A TARGET'}
          </button>
          <button className="hero-link" onClick={() => go(onSkip)}>
            or open the map
          </button>
        </div>

        <div className="hero-count">
          <div className="hero-count-k">
            <i />
            {daytime ? 'SUNSET AT GALE IN' : 'NEXT SUNRISE AT GALE IN'}
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

      {/* planet: whole Mars, or the chosen site's terrain */}
      <div className="hero-planet-wrap">
        <svg className="hero-orbits" viewBox="0 0 1000 1000" aria-hidden>
          <ellipse cx="500" cy="500" rx="470" ry="470" />
          <ellipse cx="500" cy="520" rx="520" ry="200" transform="rotate(-24 500 520)" />
          <ellipse cx="560" cy="560" rx="380" ry="140" transform="rotate(32 560 560)" />
        </svg>
        <div className={`hero-planet ${site ? 'opacity-0' : ''}`} style={{ backgroundImage: 'url(/img/mars-globe.jpg)' }} />
        {pois.map((p, i) => (
          <div key={p.id} className={`hero-planet hero-planet-site ${active === i ? '' : 'opacity-0'}`} style={crop(p, 2300)} aria-hidden={active !== i}>
            <span className="hero-target" />
          </div>
        ))}
        {!site && (
          <div className="hero-outline" aria-hidden>
            <span className="hero-outline-s">EVA TO</span>
            <span className="hero-outline-b">MARS</span>
          </div>
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

function RailItem({ on, label, sub, onClick, style }: { on: boolean; label: string; sub: string; onClick: () => void; style: React.CSSProperties }) {
  return (
    <button role="option" aria-selected={on} onClick={onClick} className={`hero-item ${on ? 'hero-item-on' : ''}`}>
      <span className="hero-dot" style={style} />
      <span className="hero-item-t">
        <span>{label}</span>
        <span className="hero-item-s">{sub}</span>
      </span>
    </button>
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
