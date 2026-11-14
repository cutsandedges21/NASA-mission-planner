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

  return { duration, oneWay, total: b.distance, totalT: b.totalT, totalO2: b.o2, at };
}

/** Position along a path of [x, y] cells given the distance walked on the out-and-back (path walked out, then reversed). */
export function makePathLocator(path: [number, number][], cellX: number, cellY: number, toLonLat: (x: number, y: number) => [number, number]) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) {
    cum.push(cum[i - 1] + Math.hypot((path[i][0] - path[i - 1][0]) * cellX, (path[i][1] - path[i - 1][1]) * cellY));
  }
  const coords = path.map(([x, y]) => toLonLat(x, y));
  const oneWay = cum[cum.length - 1];
  const out = (dOut: number): [number, number] => {
    const d = Math.min(Math.max(dOut, 0), oneWay);
    let lo = 0, hi = cum.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (cum[m] <= d) lo = m;
      else hi = m;
    }
    const f = (d - cum[lo]) / (cum[hi] - cum[lo] || 1);
    return [coords[lo][0] + (coords[hi][0] - coords[lo][0]) * f, coords[lo][1] + (coords[hi][1] - coords[lo][1]) * f];
  };
  return {
    oneWay,
    /** Position after walking `d` metres of the round trip. */
    at: (d: number) => out(d <= oneWay ? d : 2 * oneWay - d),
    /** The part of the route walked so far, as a line (out, then back along the same cells). */
    trail: (d: number): [number, number][] => {
      const dOut = Math.min(d, oneWay);
      const pts: [number, number][] = [];
      for (let i = 0; i < cum.length && cum[i] < dOut; i++) pts.push(coords[i]);
      pts.push(out(dOut));
      if (d > oneWay) {
        const back = 2 * oneWay - d;
        for (let i = cum.length - 1; i >= 0; i--) if (cum[i] > back) pts.push(coords[i]);
        pts.push(out(back));
      }
      return pts;
    },
  };
}
