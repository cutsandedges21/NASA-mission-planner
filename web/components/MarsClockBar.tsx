'use client';

import { useEffect, useState } from 'react';
import { hm, marsClock, type MarsClock } from '@/lib/mars-context';
import type { SpaceWeatherStatus } from '@/lib/space-weather';

/** Live Mars clock for the region + the space-weather badge, for the top bar. */
export default function MarsClockBar({ lon, lat, weather }: { lon: number; lat: number; weather: SpaceWeatherStatus | null }) {
  const [c, setC] = useState<MarsClock>(() => marsClock(lon, lat));
  useEffect(() => {
    const t = setInterval(() => setC(marsClock(lon, lat)), 10_000);
    return () => clearInterval(t);
  }, [lon, lat]);

  const wx = weather ?? { lvl: 'off' as const, short: 'checking…', long: 'Checking NASA DONKI for solar storms heading to Mars' };
  const wxTone = wx.lvl === 'warn' ? 'text-amber-300 border-amber-400/30 bg-amber-400/10' : wx.lvl === 'ok' ? 'text-emerald-300 border-emerald-400/25 bg-emerald-400/5' : 'text-zinc-400 border-white/10';

  return (
    <div className="panel pointer-events-auto hidden items-center gap-4 px-4 py-2 font-mono text-[11px] text-zinc-300 lg:flex">
      <Item k="Curiosity sol" v={c.sol.toLocaleString('en-US')} />
      <Item k="Local solar time" v={hm(c.ltst)} />
      <Item k="Season" v={`${c.season} · Ls ${c.Ls.toFixed(0)}°`} />
      <Item k="Signal to Earth" v={`${c.delayMin.toFixed(1)} min`} title="One-way light time. Mission Control can't help in real time." />
      <a
        href={weather && 'link' in weather && weather.link ? weather.link : 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'}
        target="_blank"
        rel="noreferrer"
        title={wx.long}
        className={`rounded-lg border px-2 py-1 font-sans text-[11px] font-medium ${wxTone}`}
      >
        Space weather: {wx.short}
      </a>
    </div>
  );
}

function Item({ k, v, title }: { k: string; v: string; title?: string }) {
  return (
    <div title={title} className="leading-tight">
      <div className="font-sans text-[9px] uppercase tracking-[0.18em] text-zinc-500">{k}</div>
      <div className="text-zinc-100">{v}</div>
    </div>
  );
}
