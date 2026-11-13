// Main-thread wrapper around the planner Web Worker.

export type Verdict = { lvl: 'go' | 'caution' | 'nogo'; issues: { lvl: string; msg: string }[] };
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
  maxSlope: number;
  timeline: { d: number; t: number; o2: number }[];
};
export type Strategy = 'SAFE' | 'FAST' | 'SCIENCE';
export type PlannedRoute = {
  strategy: Strategy;
  path: [number, number][] | null;
  budget: Budget;
  verdict: Verdict;
  poisVisited: string[];
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
