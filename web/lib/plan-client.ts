// Main-thread wrapper around the planner Web Worker.

export type Lvl = 'go' | 'caution' | 'nogo';
export type Verdict = { lvl: Lvl; issues: { lvl: Lvl; msg: string }[] };
export type Budget = {
  distance: number;
  oneWay?: number;
  walkT: number;
  stopT: number;
  totalT: number;
  o2: number;
  remaining: number;
  marginPct: number;
  gain: number;
  loss: number;
  /** Steeper of gradeMaxSlope and fineMaxSlope (deg): what the verdict and the card should show. */
  maxSlope: number;
  /** Steepest cell-to-cell grade along the route (deg). */
  gradeMaxSlope?: number;
  /** Steepest fine-scale slope inside any cell on the route, from slope.png (deg). */
  fineMaxSlope?: number;
  timeline: { d: number; t: number; o2: number }[];
  /** 'rover' when planned with params.rover (rover assist), else 'foot'. */
  mode?: 'foot' | 'rover';
  /** Radiation dose for the whole EVA (mSv), from Curiosity RAD's measured Gale surface rate. */
  doseMSv?: number;
  /** % of the outbound distance on ground steeper than 15° (from slope.png). Terrain risk for the card. */
  steepPct?: number;
};
export type Strategy = 'SAFE' | 'FAST' | 'SCIENCE';
export type PlannedRoute = {
  strategy: Strategy;
  path: [number, number][] | null;
  /** Display line (fractional cell coords, outbound): straight runs + rounded bends, never on steeper ground than `path` (planner/src/smooth.js). Budget numbers come from `path`. */
  line?: [number, number][];
  budget: Budget;
  verdict: Verdict;
  poisVisited: string[];
  /** Set on SCIENCE when no science site is within reach: the route is the SAFE path. Show it on the card. */
  note?: string;
  stops: { id: string; d: number }[];
  ms: number;
};
export type PlanArgs = {
  elev: Float32Array;
  w: number;
  h: number;
  cellX: number;
  cellY: number;
  fineSlope: Float32Array | null;
  start: [number, number];
  end: [number, number];
  pois: { x: number; y: number; id: string }[];
  sun?: { endMarginH: number } | null;
  /** Pass `status` from /api/space-weather: 'warn' adds a CAUTION to every route. */
  spaceWeather?: { lvl: string; short?: string } | null;
  /** EVA_DEFAULTS overrides, e.g. { rover: true } for rover assist, { kitKg: 10 } for carried gear. */
  params?: Record<string, unknown>;
  roundTrip?: boolean;
  maxStops?: number;
};

let worker: Worker | null = null;
let seq = 0;
const pending = new Map<number, { resolve: (r: PlannedRoute[]) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/plan.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.routes);
    };
  }
  return worker;
}

export function plan(args: PlanArgs): Promise<PlannedRoute[]> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, args });
  });
}
