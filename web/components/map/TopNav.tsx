'use client';

import type { SpaceWeatherStatus } from '@/lib/space-weather';
import { IBell, ICube, IGlobe } from './icons';

// Top bar, 1:1 with the dashboard reference (cosmos_1419633483): round logo button left, floating tab labels
// centred with a white pill on the active one, round icon buttons right (with a red dot when there's news).

export type NavTab = 'plan' | 'sites' | 'data';

export default function TopNav({
  tab,
  onTab,
  regionName,
  weather,
  view3d,
  onToggle3d,
  globe = false,
  onToggleGlobe,
}: {
  tab: NavTab;
  onTab: (t: NavTab) => void;
  regionName?: string;
  weather: SpaceWeatherStatus | null;
  view3d: boolean;
  onToggle3d: () => void;
  globe?: boolean;
  onToggleGlobe?: () => void;
}) {
  const tabs: { id: NavTab; label: string }[] = [
    { id: 'plan', label: 'Mission planner' },
    { id: 'sites', label: 'Science sites' },
    { id: 'data', label: 'Data & credits' },
  ];
  const warn = weather?.lvl === 'warn';
  return (
    <header className="topnav pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center justify-between px-4 pb-10 pt-4 sm:px-6">
      <div className="pointer-events-auto flex items-center gap-3">
        <button onClick={() => onTab('sites')} className="round-btn h-11 w-11" title={`Science sites${regionName ? ` · ${regionName}` : ''}`}>
          <IGlobe size={18} />
        </button>
      </div>

      <nav className="pointer-events-auto hidden items-center gap-1 md:flex">
        {tabs.map((t) => (
          <button key={t.id} onClick={() => onTab(t.id)} className={`nav-pill ${tab === t.id ? 'nav-pill-on' : ''}`}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="pointer-events-auto flex items-center gap-2.5">
        <a
          href={weather?.link ?? 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/'}
          target="_blank"
          rel="noreferrer"
          className="round-btn relative h-10 w-10"
          title={`Space weather (NASA DONKI): ${weather?.long ?? 'checking…'}`}
        >
          <IBell size={17} />
          {warn && <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-black" />}
        </a>
        <button onClick={onToggle3d} className={`round-btn h-10 gap-1.5 px-3.5 text-xs font-medium ${view3d ? 'round-btn-on' : ''}`} title="Toggle 3D terrain">
          <ICube size={16} />
          {view3d ? '3D' : '2D'}
        </button>
        {onToggleGlobe && (
          <button onClick={onToggleGlobe} className={`round-btn h-10 gap-1.5 px-3.5 text-xs font-medium ${globe ? 'round-btn-on' : ''}`} title="Whole-planet globe view">
            <IGlobe size={16} />
            Globe
          </button>
        )}
      </div>
    </header>
  );
}
