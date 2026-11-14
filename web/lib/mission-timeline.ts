// Mission playback maths for "Simulate Mission": turns a planned route into a keyframed timeline
// (animation time → mission clock, distance walked, oxygen used, phase) and maps distance → position.
// Pure functions, no DOM: tested in Node (web/scripts/test-mission-timeline.mjs).
import type { PlannedRoute } from './plan-client';

export type Phase = 'outbound' | 'working' | 'returning';

export type Frame = {
  /** Animation time, seconds from the start of playback. */
  u: number;
  /** Mission clock: seconds since leaving the airlock. */
  tau: number;
  /** Distance walked so far (m) along the round trip. */
  d: number;
  /** Oxygen used so far (kg), including the work done at stops. */
  o2: number;
  phase: Phase;
  /** Set while the astronaut is working at a science stop. */
  stopId: string | null;
  /** 0..1 progress through the current stop. */
  stopProgress: number;
};

type Key = { u: number; tau: number; d: number; o2: number; stopId: string | null };

export type Mission = {
  /** Total animation length (s). */
  duration: number;
  /** One-way distance (m) and whole-EVA distance (m). */
  oneWay: number;
  total: number;
  /** Total mission time (s) and oxygen (kg). */
  totalT: number;
  totalO2: number;
  at: (u: number) => Frame;
  /** Inverse of `at(u).tau`: the animation time at which the mission clock reads `tau` (used to switch pacing without losing your place). */
  uAtTau: (tau: number) => number;
};

export type MissionOptions = {
  /** Real seconds the walking takes when played at 1x (stops add their own dwell). */
  walkSeconds?: number;
  /** Real seconds spent at each science stop, so its card can be read. */
  stopDwell?: number;
};

/** Linear interpolation of y over the monotonic series (xs, ys) at x. */
function lerpAt(xs: number[], ys: number[], x: number): number {
  const n = xs.length;
  if (x <= xs[0]) return ys[0];
  if (x >= xs[n - 1]) return ys[n - 1];
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (xs[m] <= x) lo = m;
    else hi = m;
  }
  const f = (x - xs[lo]) / (xs[hi] - xs[lo] || 1);
  return ys[lo] + (ys[hi] - ys[lo]) * f;
}

/**
 * Build the playback timeline from a planner route.
 * `budget.timeline` covers walking only (cumulative distance, walking time, oxygen). Science stops are
 * added on top: each lasts `stopT / stops` of mission time and uses its share of the oxygen, and is played as a
 * fixed real-time dwell so the viewer can read the card.
 */
export function buildMission(route: PlannedRoute, opts: MissionOptions = {}): Mission | null {
  const b = route.budget;
  if (!b || !b.timeline || b.timeline.length < 2) return null;
  const walkSeconds = opts.walkSeconds ?? 22;
  const dwell = opts.stopDwell ?? 3.5;

  const tl = b.timeline;
  const ds = tl.map((p) => p.d);
  const ts = tl.map((p) => p.t);
  const os = tl.map((p) => p.o2);
  const walkT = ts[ts.length - 1];
  const walkO2 = os[os.length - 1];
  const stops = [...route.stops].sort((a, b2) => a.d - b2.d);
  const stopDur = stops.length ? b.stopT / stops.length : 0;
  const stopO2 = stops.length ? Math.max(0, b.o2 - walkO2) / stops.length : 0;
  const factor = walkT / walkSeconds || 1; // mission seconds per real second while walking

  const last = ds.length - 1;
  // A key at walking distance d, after `done` science stops have been completed.
  const key = (d: number, done: number, stopId: string | null): Key => ({
    u: lerpAt(ds, ts, d) / factor + done * dwell,
    tau: lerpAt(ds, ts, d) + done * stopDur,
    d,
    o2: lerpAt(ds, os, d) + done * stopO2,
    stopId,
  });
  const keys: Key[] = [key(ds[0], 0, null)];
  // walking keys strictly between two distances, with `done` stops already finished
  const pushWalk = (fromD: number, toD: number, done: number) => {
    for (let i = 0; i <= last; i++) if (ds[i] > fromD && ds[i] < toD) keys.push(key(ds[i], done, null));
  };
  let done = 0;
  let prevD = ds[0];
  for (const st of stops) {
    const sd = Math.min(Math.max(st.d, ds[0]), ds[last]);
    pushWalk(prevD, sd, done);
    keys.push(key(sd, done, st.id)); // arrive at the stop
    done += 1;
    keys.push(key(sd, done, st.id)); // leave it (same place, later)
    prevD = sd;
  }
  pushWalk(prevD, ds[last] + 1, done);
  keys.push(key(ds[last], done, null));
  keys.sort((x, y) => x.u - y.u || x.tau - y.tau); // stable: keeps arrive before leave

  const us = keys.map((k) => k.u);
  const duration = us[us.length - 1];
  const oneWay = b.oneWay ?? b.distance / 2;
  const ks = keys;

  const at = (uRaw: number): Frame => {
    const u = Math.min(Math.max(uRaw, 0), duration);
    let lo = 0, hi = ks.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (ks[m].u <= u) lo = m;
      else hi = m;
    }
    const a = ks[lo], c = ks[hi];
    const f = c.u - a.u > 1e-9 ? (u - a.u) / (c.u - a.u) : 1;
    const d = a.d + (c.d - a.d) * f;
    const working = a.stopId !== null && c.stopId !== null && a.stopId === c.stopId && Math.abs(c.d - a.d) < 1e-6 && c.u > a.u;
    return {
      u,
      tau: a.tau + (c.tau - a.tau) * f,
      d,
      o2: a.o2 + (c.o2 - a.o2) * f,
      phase: working ? 'working' : d > oneWay + 1 ? 'returning' : 'outbound',
      stopId: working ? a.stopId : null,
      stopProgress: working ? f : 0,
    };
  };

  const taus = keys.map((k) => k.tau);
  const uAtTau = (tau: number): number => {
    if (tau <= taus[0]) return ks[0].u;
    if (tau >= taus[taus.length - 1]) return duration;
    let lo = 0, hi = ks.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (taus[m] <= tau) lo = m;
      else hi = m;
    }
    const span = taus[hi] - taus[lo];
    return span > 1e-9 ? ks[lo].u + ((tau - taus[lo]) / span) * (ks[hi].u - ks[lo].u) : ks[lo].u;
  };

  return { duration, oneWay, total: b.distance, totalT: b.totalT, totalO2: b.o2, at, uAtTau };
}

/** Point at distance `d` along a polyline, given its cumulative distances. */
export function pointOnPolyline(cum: number[], pts: [number, number][], d: number): [number, number] {
  const oneWay = cum[cum.length - 1];
  const x = Math.min(Math.max(d, 0), oneWay);
  let lo = 0, hi = cum.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (cum[m] <= x) lo = m;
    else hi = m;
  }
  const f = (x - cum[lo]) / (cum[hi] - cum[lo] || 1);
  return [pts[lo][0] + (pts[hi][0] - pts[lo][0]) * f, pts[lo][1] + (pts[hi][1] - pts[lo][1]) * f];
}

/**
 * Position along a path of [x, y] cells given the distance walked on the out-and-back (path walked out, then reversed).
 * `refOneWay`: the one-way length the mission timeline is measured on (`budget.oneWay`). Pass it when `path` is the
 * smooth display line (`route.line`, T-32), which is up to ~8 % shorter than the cell path the budget was computed on:
 * distances are then stretched so the marker reaches the end exactly when the timeline does.
 */
export function makePathLocator(path: [number, number][], cellX: number, cellY: number, toLonLat: (x: number, y: number) => [number, number], refOneWay?: number) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * cellX, (path[i][1] - path[i - 1][1]) * cellY));
  }
  const raw = cum[cum.length - 1];
  if (refOneWay && raw > 0) for (let i = 0; i < cum.length; i++) cum[i] *= refOneWay / raw;
  const coords = path.map(([x, y]) => toLonLat(x, y));
  /** The same path in metres east / south of the region's north-west corner (the first-person view's frame). */
  const metresPts = path.map(([x, y]): [number, number] => [(x + 0.5) * cellX, (y + 0.5) * cellY]);
  const oneWay = cum[cum.length - 1];
  const out = (dOut: number): [number, number] => pointOnPolyline(cum, coords, dOut);
  const back = (d: number) => (d <= oneWay ? d : 2 * oneWay - d);
  return {
    oneWay,
    cum,
    metresPts,
    /** Position after walking `d` metres of the round trip. */
    at: (d: number) => out(back(d)),
    /** Same, in metres east (x) and south (z) of the region's north-west corner. */
    metres: (d: number) => pointOnPolyline(cum, metresPts, back(d)),
    /** The part of the route walked so far, as a line (out, then back along the same cells). */
    trail: (d: number): [number, number][] => {
      const dOut = Math.min(d, oneWay);
      const pts: [number, number][] = [];
      for (let i = 0; i < cum.length && cum[i] < dOut; i++) pts.push(coords[i]);
      pts.push(out(dOut));
      if (d > oneWay) {
        const b = 2 * oneWay - d;
        for (let i = cum.length - 1; i >= 0; i--) if (cum[i] > b) pts.push(coords[i]);
        pts.push(out(b));
      }
      return pts;
    },
  };
}
