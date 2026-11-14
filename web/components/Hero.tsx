'use client';

import { useEffect, useState } from 'react';
import type { Region } from '@/lib/region';
import { MARS_HOUR_S, hm, marsClock, type MarsClock } from '@/lib/mars-context';

// Landing hero, 1:1 with the "Flight to Mars" reference (docs/design-references/cosmos_718343697.webp):
// black starfield, logo + small nav + clock top bar, a vertical column of round thumbnails on the left
// (here: our science sites, cropped from the HiRISE mosaic), big two-line title + paragraph + white button,
// a red-ruled countdown in big digits, and a large Mars on the right with thin orbit rings, dotted callouts
// and outlined text across the planet. The globe is NASA's Viking mosaic PIA00407 (public domain).

const GALE: [number, number] = [137.4417, -4.5895];

export default function Hero({ region, onStart, onPickSite }: { region: Region | null; onStart: () => void; onPickSite: (i: number) => void }) {
  const lon = region?.meta.base?.lon ?? GALE[0];
  const lat = region?.meta.base?.lat ?? GALE[1];
  const [c, setC] = useState<MarsClock | null>(null);
  const [now, setNow] = useState(0);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    const tick = () => {
      setC(marsClock(lon, lat));
      setNow(Date.now());
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [lon, lat]);

  // Earth seconds until the next sunset at the base
  let left = 0;
  if (c) {
    let dh = c.set - c.ltst;
    if (dh < 0) dh += 24;
    left = Math.max(0, Math.round(dh * MARS_HOUR_S));
  }
  void now;
  const H = Math.floor(left / 3600),
    M = Math.floor((left % 3600) / 60),
    S = left % 60;
  const daytime = c ? c.ltst > c.rise && c.ltst < c.set : true;

  const go = (fn: () => void) => {
    setLeaving(true);
    setTimeout(fn, 450);
  };

  const pois = region?.pois ?? [];
  const m = region?.meta;
  const aspect = m ? m.width / m.height : 1;

  return (
    <div className={`hero absolute inset-0 z-50 overflow-hidden text-white transition-opacity duration-500 ${leaving ? 'pointer-events-none opacity-0' : ''}`}>
      <div className="hero-sky" aria-hidden />

      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between px-[7%] pt-6">
        <div className="hero-logo">
          EVA<span>Planner</span>
        </div>
        <nav className="hidden gap-14 text-[12px] text-white/85 md:flex">
          <button onClick={() => go(onStart)}>Plan</button>
          <button onClick={() => go(onStart)}>Sites</button>
          <button onClick={() => go(onStart)}>Routes</button>
          <span className="text-white/50">NASA Space Apps 2026</span>
        </nav>
        <div className="text-right">
          <div className="hero-clock">SOL-{c ? c.sol : '----'} · {c ? hm(c.ltst) : '--:--'}</div>
          <div className="mt-1 text-[10px] text-white/60">{c?.season ?? '…'}</div>
        </div>
      </div>

      {/* left: site thumbnails */}
      <div className="hero-rail">
        <button className="hero-dot hero-dot-on" onClick={() => go(onStart)} title="Gale Crater">
          <span className="hero-dot-img" style={{ backgroundImage: 'url(/img/mars-globe.jpg)', backgroundSize: 'cover' }} />
          <span className="hero-dot-t">Gale</span>
        </button>
        {pois.slice(0, 5).map((p, i) => {
          const fx = m ? (p.lon - m.lon[0]) / (m.lon[1] - m.lon[0]) : 0.5;
          const fy = m ? (m.lat[1] - p.lat) / (m.lat[1] - m.lat[0]) : 0.5;
          const Sw = 900,
            Sh = Sw / aspect;
          return (
            <button key={p.id} className="hero-dot" onClick={() => go(() => onPickSite(i))} title={p.name}>
              <span
                className="hero-dot-img"
                style={{
                  backgroundImage: region ? `url(${region.url('visible.jpg')})` : undefined,
                  backgroundSize: `${Sw}px ${Sh}px`,
                  backgroundPosition: `calc(50% + ${(0.5 - fx) * Sw}px) calc(50% + ${(0.5 - fy) * Sh}px)`,
                }}
              />
              <span className="hero-dot-t">{p.name.split(' ')[0]}</span>
            </button>
          );
        })}
      </div>

      {/* title block */}
      <div className="hero-copy">
        <div className="hero-k">WALK ON</div>
        <h1 className="hero-h">MARS</h1>
        <p className="hero-p">
          Gale Crater is where Curiosity has driven since 2012: an ancient lake bed under a 5 km mountain. Pick a science target, and we plan three
          spacesuit walks from NASA terrain data, scored for oxygen, slope, daylight and radiation.
        </p>
        <button className="hero-btn" onClick={() => go(onStart)}>
          PLAN AN EVA
        </button>

        <div className="hero-count">
          <div className="hero-count-k">
            <i />
            {daytime ? 'SUNSET AT GALE IN' : 'NEXT SUNSET AT GALE IN'}
          </div>
          <div className="mt-2 flex gap-3">
            <Box n={0} k="SOLS" />
            <Box n={H} k="HOURS" />
            <Box n={M} k="MINUTES" />
            <Box n={S} k="SECONDS" />
          </div>
        </div>
      </div>

      {/* planet */}
      <div className="hero-planet-wrap" aria-hidden>
        <svg className="hero-orbits" viewBox="0 0 1000 1000">
          <ellipse cx="500" cy="500" rx="470" ry="470" />
          <ellipse cx="500" cy="520" rx="520" ry="200" transform="rotate(-24 500 520)" />
          <ellipse cx="560" cy="560" rx="380" ry="140" transform="rotate(32 560 560)" />
        </svg>
        <div className="hero-planet" />
        <div className="hero-outline">
          <span className="hero-outline-s">EVA TO</span>
          <span className="hero-outline-b">MARS</span>
        </div>
        <Callout x="16%" y="11%" t="Fourth planet" />
        <Callout x="3%" y="40%" t="Sol = 24 h 39 min" />
        <Callout x="5%" y="66%" t="Diameter 6,779 km" />
        <Callout x="22%" y="88%" t="Gravity 0.38 g" />
      </div>
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

function Callout({ x, y, t }: { x: string; y: string; t: string }) {
  return (
    <span className="hero-call" style={{ left: x, top: y }}>
      {t}
      <i />
    </span>
  );
}
