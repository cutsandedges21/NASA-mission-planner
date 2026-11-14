// Mission context at the region: Mars clock, daylight window, Earth–Mars signal delay, and the
// per-route daylight check. Sun maths come from marstime.js (Mars24 algorithm, via Sol Atlas).
import { dayLength, earthMarsLightTime, formatHM, localTime, marsTime, SOL_SECONDS } from './marstime.js';
import { EVA_DEFAULTS, verdict as evaVerdict } from '../../planner/src/eva.js';
import type { PlannedRoute, Verdict } from './plan-client';

/** One local solar hour on Mars, in Earth seconds (1 sol / 24). */
export const MARS_HOUR_S = SOL_SECONDS / 24;
/** Curiosity touched down at Bradbury Landing on 6 Aug 2012, 05:17:57 UTC (mission sol 0). */
const CURIOSITY_LANDING_MS = Date.UTC(2012, 7, 6, 5, 17, 57);

export type MarsClock = {
  sol: number; // Curiosity mission sol
  ltst: number; // local true solar time at the region, hours
  Ls: number; // solar longitude, degrees
  season: string;
  rise: number; // local solar hours
  set: number;
  delayMin: number; // one-way Earth–Mars light time
};

export function seasonAt(Ls: number, lat: number): string {
  const i = Math.floor((((Ls % 360) + 360) % 360) / 90);
  const north = ['spring', 'summer', 'autumn', 'winter'];
  const south = ['autumn', 'winter', 'spring', 'summer'];
  return `${lat >= 0 ? 'Northern' : 'Southern'} ${(lat >= 0 ? north : south)[i]}`;
}

export function marsClock(lon: number, lat: number, ms = Date.now()): MarsClock {
  const mt = marsTime(ms);
  const lmsd = (t: number) => marsTime(t).msd + lon / 360;
  const { rise, set } = dayLength(lat, mt.decl);
  return {
    sol: Math.floor(lmsd(ms)) - Math.floor(lmsd(CURIOSITY_LANDING_MS)),
    ltst: localTime(mt, lon).ltst,
    Ls: mt.Ls,
    season: seasonAt(mt.Ls, lat),
    rise,
    set,
    delayMin: earthMarsLightTime(ms).seconds / 60,
  };
}

export const hm = (h: number) => formatHM(((h % 24) + 24) % 24);

export type Daylight = { startH: number; endH: number; endMarginH: number };

/** When this route's EVA ends (local solar time) and how much daylight is left then. */
export function routeDaylight(r: PlannedRoute, startH: number, sunsetH: number): Daylight | null {
  if (!r.budget) return null;
  const endH = startH + r.budget.totalT / MARS_HOUR_S;
  return { startH, endH, endMarginH: sunsetH - endH };
}

/** Re-run the planner's own verdict() with this route's daylight margin (each route ends at a different time). */
export function verdictWithDaylight(r: PlannedRoute, d: Daylight | null): Verdict {
  if (!r.budget || !d) return r.verdict;
  return evaVerdict(r.budget, { endMarginH: d.endMarginH }, EVA_DEFAULTS) as Verdict;
}

export function fmtMargin(h: number): string {
  const a = Math.abs(h), hh = Math.floor(a), mm = Math.round((a - hh) * 60);
  const t = hh ? `${hh}h ${String(mm).padStart(2, '0')}m` : `${mm} min`;
  return h >= 0 ? `${t} before sunset` : `${t} after sunset`;
}
