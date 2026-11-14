import type { Strategy } from '@/lib/plan-client';

/** Route colours + copy. Shared by the map layers and every route widget. */
export const ROUTE_STYLE: Record<Strategy, { color: string; label: string; blurb: string; grad: string }> = {
  SAFE: {
    color: '#34d399',
    label: 'Safe',
    blurb: 'Least oxygen, avoids steep ground',
    grad: 'radial-gradient(120% 80% at 30% 45%, #04120c 0%, #064e3b 45%, #10b981 100%)',
  },
  FAST: {
    color: '#fbbf24',
    label: 'Fast',
    blurb: 'Least walking time',
    grad: 'radial-gradient(120% 80% at 30% 45%, #160d02 0%, #7c4a03 45%, #f59e0b 100%)',
  },
  SCIENCE: {
    color: '#a78bfa',
    label: 'Science',
    blurb: 'Stops at the best targets on the way',
    grad: 'radial-gradient(120% 80% at 30% 45%, #0c0420 0%, #3b1a8a 45%, #8b5cf6 100%)',
  },
};

export const ROUTE_COLORS: Record<Strategy, string> = {
  SAFE: ROUTE_STYLE.SAFE.color,
  FAST: ROUTE_STYLE.FAST.color,
  SCIENCE: ROUTE_STYLE.SCIENCE.color,
};

export const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
export const fmtDur = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m} min`;
};
/** "1:31" style, for dot-matrix readouts */
export const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600),
    m = Math.round((s % 3600) / 60);
  return `${h}:${String(m).padStart(2, '0')}`;
};
export const fmtLL = ([lon, lat]: [number, number]) => `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${lon.toFixed(3)}°E`;

export const VERDICT_LABEL = { go: 'GO', caution: 'CAUTION', nogo: 'NO-GO' } as const;
export const VERDICT_TONE = {
  go: 'text-emerald-300',
  caution: 'text-amber-300',
  nogo: 'text-red-300',
} as const;
