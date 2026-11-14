'use client';

import type { RegionMeta } from '@/lib/region';

// "Data & credits", laid out on the white-card tablet reference (cosmos_264712403): a dark rounded frame
// holding white cards with big radii, outlined chips (filled black = in use) and a round icon button.

const NASA_DATA = [
  { name: 'MSL Gale Merged DEM (1 m)', who: 'USGS / NASA MRO HiRISE + CTX', url: 'https://astrogeology.usgs.gov/search/map/mars_msl_gale_merged_dem_1m' },
  { name: 'HiRISE colour mosaic of Gale', who: 'NASA MRO HiRISE (U. Arizona)', url: 'https://www.uahirise.org/' },
  { name: 'HRSC + MOLA blended DEM (200 m)', who: 'ESA Mars Express + NASA MGS MOLA', url: 'https://astrogeology.usgs.gov/search/map/mars_mgs_mola_mex_hrsc_blended_dem_global_200m' },
  { name: 'THEMIS night IR mosaic', who: 'NASA Mars Odyssey THEMIS', url: 'https://www.mars.asu.edu/data/' },
  { name: 'DONKI CME forecasts (WSA-ENLIL)', who: 'NASA CCMC, live', url: 'https://kauai.ccmc.gsfc.nasa.gov/DONKI/' },
  { name: 'RAD surface radiation dose', who: 'NASA Curiosity RAD (Hassler et al. 2014)', url: 'https://doi.org/10.1126/science.1244797' },
  { name: 'OpenPlanetaryMap Mars basemap', who: 'NASA MOLA + Viking, by OpenPlanetary', url: 'https://www.openplanetary.org/opm' },
];

const CHIPS = ['Elevation', 'Slope', 'Colour', 'Thermal', 'Space weather', 'Radiation', 'Mars clock', 'Science sites', 'AI briefing'];

export default function Credits({ meta, onClose }: { meta: RegionMeta | null; onClose: () => void }) {
  const real = meta && !meta.synthetic ? meta.sources.filter((s) => s.url) : [];
  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="cr-frame" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-2 pb-3 pt-1">
          <span className="cr-star">✦</span>
          <span className="text-[13px] font-medium text-zinc-300">Data &amp; credits</span>
          <button onClick={onClose} className="cr-close" aria-label="Close">
            ✕
          </button>
        </div>
        <div className="grid gap-3 md:grid-cols-[1.4fr_1fr]">
          <div className="cr-card">
            <h3 className="cr-h">NASA data we use</h3>
            <ul className="mt-3 space-y-2.5">
              {(real.length ? real.map((s) => ({ name: s.dataset, who: `${s.mission} · ${s.layer}`, url: s.url })) : NASA_DATA).map((d) => (
                <li key={d.name} className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-[13px] font-semibold text-black">{d.name}</div>
                    <div className="text-[11.5px] text-zinc-500">{d.who}</div>
                  </div>
                  <a href={d.url} target="_blank" rel="noreferrer" className="cr-chip shrink-0">
                    Source ↗
                  </a>
                </li>
              ))}
            </ul>
            {meta?.synthetic && <p className="mt-4 text-[11px] text-zinc-500">The map currently shows demo terrain; the list above is what the real Gale region is built from.</p>}
          </div>
          <div className="flex flex-col gap-3">
            <div className="cr-card">
              <h3 className="cr-h">Computed from data</h3>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {CHIPS.map((c, i) => (
                  <span key={c} className={`cr-chip ${i < 6 ? 'cr-chip-on' : ''}`}>
                    {c}
                  </span>
                ))}
              </div>
              <p className="mt-3 text-[11.5px] leading-relaxed text-zinc-500">Routes, oxygen, slope, daylight and dose are computed. The AI only words the briefing, and the server rejects any number it didn&apos;t get.</p>
            </div>
            <div className="cr-card">
              <h3 className="cr-h">Credits</h3>
              <p className="mt-2 text-[12px] leading-relaxed text-zinc-700">
                Routing and EVA oxygen model adapted from <a className="underline" href="https://github.com/saracen66/the-sol-explorers" target="_blank" rel="noreferrer">Sol Atlas</a> by The SOL Explorers. Mars clock: Mars24 algorithm (NASA GISS). Basemap: OpenPlanetaryMap. Built for NASA Space Apps 2026.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
