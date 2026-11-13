// planMission(): the one call the web app makes. Returns SAFE / FAST / SCIENCE routes, each
// scored with the EVA model (time, O2, slope) and a GO / CAUTION / NO-GO verdict.
// Routing and EVA oxygen model adapted from Sol Atlas by The SOL Explorers.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
import { CostGrid } from './route.js';
import { budget, verdict, EVA_DEFAULTS } from './eva.js';

export { EVA_DEFAULTS };
export const STRATEGIES = ['SAFE', 'FAST', 'SCIENCE'];

/**
 * @param {object} a
 * @param {Float32Array} a.elev   metres, row-major, row 0 = north (w*h)
 * @param {number} a.w, a.h       grid size in cells
 * @param {number} a.cellX, a.cellY  metres per cell
 * @param {Float32Array} [a.fineSlope]  max fine-scale slope per cell (deg)
 * @param {[number,number]} a.start, a.end  grid cells [x, y]
 * @param {Array<{x:number,y:number,id:string}>} [a.pois]
 * @param {{endMarginH:number}} [a.sun]  daylight margin at the end of the EVA, passed to verdict()
 * @param {object} [a.params]   overrides for EVA_DEFAULTS (crew mass, O2 capacity, …)
 * @param {boolean} [a.roundTrip=true]  walk back to the start along the same route (a Marswalk ends at the airlock)
 * @param {number} [a.maxStops=2]  most POIs the SCIENCE route visits
 * @returns {Array<{strategy, path, budget, verdict, poisVisited: string[], stops: Array<{id,d}>, ms}>}
 */
export function planMission(a) {
  const { elev, w, h, cellX, cellY, fineSlope = null, start, end, pois = [], sun = null,
    roundTrip = true, maxStops = 2 } = a;
  const params = { ...EVA_DEFAULTS, ...(a.params || {}) };
  for (const [x, y] of [start, end]) {
    if (!(x >= 0 && y >= 0 && x < w && y < h)) throw new RangeError(`cell [${x}, ${y}] is outside the ${w}×${h} grid`);
  }
  const grid = new CostGrid(elev, w, h, cellX, cellY, fineSlope);
  const ctx = { grid, elev, w, cellX, cellY, params, sun, roundTrip };

  const fast = timed(() => legs(ctx, [start, end], 'FAST'));
  const safe = timed(() => legs(ctx, [start, end], 'SAFE'));
  const chosen = pickScienceStops(start, end, pois, cellX, cellY, maxStops);
  const sci = timed(() => legs(ctx, [start, ...chosen.map((p) => [p.x, p.y]), end], 'ENERGY'));

  return [
    score(ctx, 'SAFE', safe.value, [], safe.ms),
    score(ctx, 'FAST', fast.value, [], fast.ms),
    score(ctx, 'SCIENCE', sci.value, chosen, sci.ms),
  ];
}

/**
 * Choose which POIs the SCIENCE route visits: the ones that add the least straight-line detour,
 * up to `maxStops`, within a detour budget of max(1 km, 50 % of the direct distance). If none fit
 * the budget, the single cheapest POI is still visited (a SCIENCE route should do science).
 * Returned in the order they're met walking from start to end.
 */
export function pickScienceStops(start, end, pois, cellX, cellY, maxStops = 2) {
  const m = ([ax, ay], [bx, by]) => Math.hypot((ax - bx) * cellX, (ay - by) * cellY);
  const direct = m(start, end);
  const same = (p, c) => p.x === c[0] && p.y === c[1];
  const cands = pois
    .filter((p) => !same(p, start) && !same(p, end))
    .map((p) => ({ ...p, detour: m(start, [p.x, p.y]) + m([p.x, p.y], end) - direct }))
    .sort((a, b) => a.detour - b.detour);
  if (!cands.length) return [];
  const limit = Math.max(1000, 0.5 * direct);
  let picked = cands.filter((p) => p.detour <= limit).slice(0, Math.max(0, maxStops));
  if (!picked.length && maxStops > 0) picked = [cands[0]];
  // order along the start → end direction
  const [ux, uy] = [(end[0] - start[0]) * cellX, (end[1] - start[1]) * cellY];
  const t = (p) => ((p.x - start[0]) * cellX * ux + (p.y - start[1]) * cellY * uy) / (direct * direct || 1);
  return picked.sort((a, b) => t(a) - t(b)).map(({ detour, ...p }) => p);
}

function legs(ctx, waypoints, strategy) {
  const path = [];
  for (let i = 1; i < waypoints.length; i++) {
    const [ax, ay] = waypoints[i - 1], [bx, by] = waypoints[i];
    const leg = ctx.grid.find(ax, ay, bx, by, ctx.params, { strategy, roundTrip: ctx.roundTrip });
    if (!leg) return null;
    path.push(...(path.length ? leg.slice(1) : leg));
  }
  return path;
}

/** Cumulative-distance samples along a path: [{ d, e }]. */
export function toSamples(path, elev, w, cellX, cellY, d0 = 0) {
  let d = d0;
  return path.map(([x, y], i) => {
    if (i) { const [px, py] = path[i - 1]; d += Math.hypot((x - px) * cellX, (y - py) * cellY); }
    return { d, e: elev[y * w + x] };
  });
}

function score(ctx, strategy, path, stopsPois, ms) {
  if (!path) {
    return {
      strategy, path: null, budget: null, poisVisited: [], stops: [], ms,
      verdict: { lvl: 'nogo', issues: [{ lvl: 'nogo', msg: 'No walkable route found between these points' }] },
    };
  }
  const { elev, w, cellX, cellY, params, sun, roundTrip } = ctx;
  const out = toSamples(path, elev, w, cellX, cellY);
  const samples = roundTrip
    ? out.concat(toSamples(path.slice().reverse(), elev, w, cellX, cellY, out.at(-1).d).slice(1))
    : out;
  // cumulative distance (outbound) where each science stop happens
  const stops = [];
  let k = 0;
  for (const p of stopsPois) {
    while (k < path.length && !(path[k][0] === p.x && path[k][1] === p.y)) k++;
    if (k < path.length) stops.push({ id: p.id, d: out[k].d });
  }
  const b = budget(samples, stops.map((s) => s.d), params);
  b.oneWay = out.at(-1).d;
  b.roundTrip = roundTrip;
  return { strategy, path, budget: b, verdict: verdict(b, sun, params), poisVisited: stops.map((s) => s.id), stops, ms };
}

function timed(fn) {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}
