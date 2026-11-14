'use client';

import { useEffect, useState } from 'react';
import type { Poi, Region } from '@/lib/region';

// Science-site picker, built 1:1 on Moss's Figma reference (docs/design-references/video-key-frame-*.jpg):
// tinted page → rounded window → row of 170×582 pills (radius 102), the active one widens to 466 and shows
// its title + 2 lines; the page colour follows the active pill. Title block bottom-left, paragraph bottom-right.
// Pill pictures are crops of the region's NASA colour mosaic centred on each site.

const TINTS = [
  { page: '#1f4450', win: '#163640' }, // teal
  { page: '#5c0c5e', win: '#4a0a4d' }, // purple
  { page: '#a3501a', win: '#8a4214' }, // orange
  { page: '#6e1420', win: '#5a0f19' }, // crimson
  { page: '#23315e', win: '#1a264b' }, // indigo
  { page: '#4d3a12', win: '#3e2e0d' }, // ochre
];

const fmtLL = (p: Poi) => `${Math.abs(p.lat).toFixed(3)}°${p.lat < 0 ? 'S' : 'N'} · ${p.lon.toFixed(3)}°E`;

export default function Intro({
  region,
  onPick,
  onSkip,
}: {
  region: Region | null;
  onPick: (p: Poi) => void;
  onSkip: () => void;
}) {
  const pois = region?.pois ?? [];
  const [active, setActive] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const m = region?.meta;
  const aspect = m ? m.width / m.height : 1;
  const regionName = m ? m.name.replace(/\s*\(.*\)/, '') : 'Gale Crater';

  const finish = (fn: () => void) => {
    setLeaving(true);
    setTimeout(fn, 450);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!pois.length) return;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setActive((a) => Math.min(pois.length - 1, a + 1));
      if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setActive((a) => Math.max(0, a - 1));
      if (e.key === 'Enter') {
        setLeaving(true);
        setTimeout(() => onPick(pois[active]), 450);
      }
      if (e.key === 'Escape') {
        setLeaving(true);
        setTimeout(onSkip, 450);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [pois, active, onPick, onSkip]);

  const t = TINTS[active % TINTS.length];
  const cur = pois[active];

  return (
    <div
      className={`gal absolute inset-0 z-40 flex flex-col items-center justify-center overflow-hidden transition-opacity duration-500 ${leaving ? 'pointer-events-none opacity-0' : 'opacity-100'}`}
      style={{ ['--page' as string]: t.page, ['--win' as string]: t.win }}
    >
      <div className="gal-win">
        {/* nav */}
        <nav className="gal-nav">
          <div className="flex items-center gap-7">
            <span className="gal-logo" aria-hidden>
              ✦
            </span>
            {['Plan', 'Sites', 'Routes', 'Data'].map((n, i) => (
              <button key={n} onClick={i === 0 || i === 1 ? undefined : () => finish(onSkip)} className={i === 1 ? 'text-white' : ''}>
                {n}
              </button>
            ))}
          </div>
          <button onClick={() => finish(onSkip)} className="gal-skip">
            Open the map
          </button>
        </nav>

        {/* pills */}
        <div className="gal-stage">
          {!pois.length ? (
            <div className="animate-pulse text-xs tracking-[0.3em] text-white/70">LOADING MARS…</div>
          ) : (
            <div className="gal-row" role="listbox" aria-label="Science sites">
              {pois.map((p, i) => {
                const on = i === active;
                const fx = m ? (p.lon - m.lon[0]) / (m.lon[1] - m.lon[0]) : 0.5;
                const fy = m ? (m.lat[1] - p.lat) / (m.lat[1] - m.lat[0]) : 0.5;
                const Sw = 2600;
                const Sh = Sw / aspect;
                return (
                  <button
                    key={p.id}
                    role="option"
                    aria-selected={on}
                    data-on={on}
                    onMouseEnter={() => setActive(i)}
                    onFocus={() => setActive(i)}
                    onClick={() => (on ? finish(() => onPick(p)) : setActive(i))}
                    className="gal-pill"
                  >
                    <span
                      className="gal-img"
                      style={{
                        backgroundImage: region ? `url(${region.url('visible.jpg')})` : undefined,
                        backgroundSize: `${Sw}px ${Sh}px`,
                        backgroundPosition: `calc(50% + ${(0.5 - fx) * Sw}px) calc(50% + ${(0.5 - fy) * Sh}px)`,
                      }}
                    />
                    <span className="gal-shade" />
                    <span className="gal-cap">
                      <span className="gal-cap-t">{p.name}</span>
                      <span className="gal-cap-d">{p.why}</span>
                    </span>
                    <span className="gal-go">Plan a walk here →</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* bottom: title block left, paragraph right */}
        <div className="gal-foot">
          <div>
            <h1 className="gal-h1">{regionName}</h1>
            <dl className="gal-meta">
              <dd>Science site {String(active + 1).padStart(2, '0')} / {String(pois.length).padStart(2, '0')}</dd>
              <dd>{cur ? fmtLL(cur) : '—'}</dd>
              <dd>Source: {cur?.source ?? 'NASA'}</dd>
              <dd>
                <button className="gal-link" onClick={() => cur && finish(() => onPick(cur))}>
                  Plan this walk
                </button>{' '}
                <button className="gal-link" onClick={() => finish(onSkip)}>
                  Map
                </button>
              </dd>
            </dl>
          </div>
          <p className="gal-para">
            Pick a science target. We compute SAFE, FAST and SCIENCE walking routes from NASA terrain data and score each for oxygen, time,
            slope, daylight and radiation.
            {m?.synthetic ? ' Demo terrain for now; real NASA data is being processed.' : ''}
          </p>
        </div>
      </div>

      <div className="gal-credit">
        <span className="gal-avatar">✦</span>
        <span>NASA Space Apps 2026 · Interplanetary Survival Guide</span>
      </div>
    </div>
  );
}
