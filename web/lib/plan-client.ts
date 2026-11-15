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
  /** EVA_DEFAULTS overrides, e.g. { rover: true } for rover assist, { kitKg: 10 } for carried gear. */
  params?: Record<string, unknown>;
  roundTrip?: boolean;
  maxStops?: number;
  /** Pit stop ("point 1.5", T-35): grid cell every route passes through on the way out. Its stop id is 'pitstop'. */
  via?: [number, number] | null;
  /** Any number of pit stops, visited in this order on the way out. Stop ids: 'pitstop', 'pitstop2', 'pitstop3', … */
  vias?: [number, number][];
};

// ---- Mission Simulator (T-35, planner/src/simulate.js + steps.js) ----
export type SimEvent = {
  type: 'dust';
  atS: number;
  atM: number;
  outbound: boolean;
  tau?: number;
  kind?: 'local' | 'regional';
  decision: string;
  effect: string;
  damage: string[];
};
export type SimRun = {
  seed: number;
  pace: number;
  terrain: number;
  effort: number;
  events: SimEvent[];
  outcome: 'completed' | 'turned back' | 'unsafe';
  lvl: Lvl;
  issues: { lvl: Lvl; msg: string }[];
  turnedBackAtM: number | null;
  stopsDone: string[];
  stopsMissed: string[];
  distance: number;
  totalT: number;
  o2: number;
  marginPct: number;
  endMarginH: number | null;
  /** Plain-language summary, compared with the typical run (written in the worker from the numbers). */
  text: string;
};
export type SimSummary = {
  n: number;
  completed: number;
  turnedBack: number;
  unsafe: number;
  nogo: number;
  dustRuns: number;
  medianTotalT: number;
  p10TotalT: number;
  p90TotalT: number;
  medianMarginPct: number;
  worstMarginPct: number;
  typical: number;
  best: number;
  worst: number;
};
export type StepLeg = {
  n: number;
  fromM: number;
  toM: number;
  distM: number;
  heading: number;
  compass: string;
  turn: number;
  dhM: number;
  maxSlope: number;
  tS: number;
  o2Kg: number;
  steep: boolean;
  climb: boolean;
  stopAtEnd: string | null;
  text: string;
};
export type SimResult = {
  routes: { strategy: Strategy; runs: SimRun[]; summary: SimSummary | null }[];
  recommended: Strategy | null;
  text: string;
  assumptions: Record<string, { value: number; why: string }>;
  steps: Record<Strategy, StepLeg[]>;
  /** MDAD storm rate over the region for this season (null without dust.json). */
  dustRate: { p: number; pRegional: number; ls: [number, number]; sols: number; solsWithStorm: number } | null;
  dustSource: string | null;
  forceDust: boolean;
};
export type SimOpts = {
  Ls?: number;
  runs?: number;
  seed?: number;
  names?: Record<string, string>;
  /** dust.json contents (MDAD rates by season); without it the labelled fallback chance is used. */
  dust?: unknown;
  /** Stress test: every run meets a dust storm during the EVA. */
  forceDust?: boolean;
  /** Simulate only these routes (the page may hide SCIENCE). Default: all planned routes. */
  strategies?: Strategy[];
  /** Daylight margin at the end of each route's nominal EVA (from routeDaylight). A run that takes longer can end after sunset. */
  sunByStrategy?: Partial<Record<Strategy, { endMarginH: number }>>;
};

let worker: Worker | null = null;
let seq = 0;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const pending = new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>();

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL('../workers/plan.worker.ts', import.meta.url), { type: 'module' });
    worker.onmessage = (e) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.routes ?? e.data.result);
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

/** Simulate the routes from the most recent plan() call (the worker keeps its grid). Call after plan() resolves. */
export function simulate(opts: SimOpts = {}): Promise<SimResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, kind: 'simulate', opts });
  });
}

// ---- Five seeded simulations Point 1 → Point 2 (T-35, planner/src/candidates.js) ----
export type CandidateRole = 'FASTEST' | 'SAFEST' | 'FASTEST + SAFEST' | 'BALANCED' | 'ALTERNATIVE' | 'NO ROUTE';
export type Candidate = {
  i: number;
  seed: number;
  /** 0 = pure speed … 1 = most cautious: this seed's risk appetite. */
  safety: number;
  role: CandidateRole;
  problems: { w: number; msg: string }[];
  problemScore: number;
  route: { strategy: string; path: [number, number][]; line: [number, number][]; budget: Omit<Budget, 'timeline'>; verdict: Verdict; stops: { id: string; d: number }[] } | null;
  run: (SimRun & { arriveS: number | null }) | null;
  /** Plain-language paragraph from the numbers (worker). */
  text: string;
  steps: StepLeg[];
};
export type CandidatesResult = {
  runs: Candidate[];
  fastest: number | null;
  safest: number | null;
  balanced: number | null;
  alternatives: number[];
  bothFastestAndSafest?: boolean;
  assumptions: Record<string, { value: number; why: string }>;
  dustRate: SimResult['dustRate'];
  dustSource: string | null;
  forceDust: boolean;
};
export type CandidateOpts = Omit<SimOpts, 'strategies' | 'sunByStrategy'> & {
  /** Local solar hours: leave at startH, sunset at sunsetH. Each simulation's daylight margin comes from its own duration. */
  daylight?: { startH: number; sunsetH: number };
};

/** Five seeded simulations of the last plan() call's Point 1 → Point 2 (+ pit stop). ~0.5–2 s in the worker. */
export function simulateCandidates(opts: CandidateOpts = {}): Promise<CandidatesResult> {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ id, kind: 'candidates', opts });
  });
}
