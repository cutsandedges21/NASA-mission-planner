// planMission(): the one call the web app makes. Returns SAFE / FAST / SCIENCE routes, each
// scored with the EVA model (time, O2, slope) and a GO / CAUTION / NO-GO verdict.
// Routing and EVA oxygen model adapted from Sol Atlas by The SOL Explorers.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
import { CostGrid } from './route.js';
import { budget, verdict, evaDoseMSv, RAD_MSV_PER_DAY, EVA_DEFAULTS } from './eva.js';

export { EVA_DEFAULTS, RAD_MSV_PER_DAY };
/** Slope (deg) above which ground counts as steep for budget.steepPct. */
export const STEEP_DEG = 15;
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
 * @param {{lvl:string, short?:string}} [a.spaceWeather]  status from /api/space-weather; 'warn' adds a CAUTION to every route
 * @param {object} [a.params]   overrides for EVA_DEFAULTS (crew mass, O2 capacity, …)
 * @param {boolean} [a.roundTrip=true]  walk back to the start along the same route (a Marswalk ends at the airlock)
 * @param {number} [a.maxStops=2]  most POIs the SCIENCE route visits
 * @returns {Array<{strategy, path, budget, verdict, poisVisited: string[], stops: Array<{id,d}>, ms, note?: string}>}
 */
export function planMission(a) {
  const { elev, w, h, cellX, cellY, fineSlope = null, start, end, pois = [], sun = null, spaceWeather = null,
    roundTrip = true, maxStops = 2 } = a;
  const params = { ...EVA_DEFAULTS, ...(a.params || {}) };
  for (const [x, y] of [start, end]) {
    if (!(x >= 0 && y >= 0 && x < w && y < h)) throw new RangeError(`cell [${x}, ${y}] is outside the ${w}×${h} grid`);
  }
  const grid = new CostGrid(elev, w, h, cellX, cellY, fineSlope);
  const ctx = { grid, elev, w, cellX, cellY, fineSlope, params, sun, spaceWeather, roundTrip };

  const fast = timed(() => legs(ctx, [start, end], 'FAST'));
  const safe = timed(() => legs(ctx, [start, end], 'SAFE'));
  const { stops: chosen, target } = pickScienceStops(start, end, pois, cellX, cellY, maxStops);
  let science;
  if (!chosen.length && !target) {
    // No science site worth the walk: reuse the SAFE path rather than force a big detour.
    science = score(ctx, 'SCIENCE', safe.value, [], null, safe.ms);
    science.note = 'No science site within reach of this route';
  } else {
    const sci = timed(() => legs(ctx, [start, ...chosen.map((p) => [p.x, p.y]), end], 'ENERGY'));
    science = score(ctx, 'SCIENCE', sci.value, chosen, target, sci.ms);
  }
  return [
    score(ctx, 'SAFE', safe.value, [], null, safe.ms),
    score(ctx, 'FAST', fast.value, [], null, fast.ms),
    science,
  ];
}

/** Cells within this many cells (Chebyshev) of a POI count as "at" the POI (clicking a marker). */
export const POI_SNAP_CELLS = 2;

/**
 * Choose which POIs the SCIENCE route visits.
 * - `target`: the POI at the destination (within POI_SNAP_CELLS of `end`), if any. Visiting it is the
 *   point of the walk, so it always counts as a science stop.
 * - `stops`: on-the-way POIs that add the least straight-line detour, up to `maxStops`, within a
 *   detour budget of max(1 km, 50 % of the direct distance). No fallback: if nothing fits the budget,
 *   there are no on-the-way stops (a huge detour would only turn the route NO-GO).
 * POIs at the start are ignored. Stops come back in the order they're met walking start → end.
 */
export function pickScienceStops(start, end, pois, cellX, cellY, maxStops = 2) {
  const m = ([ax, ay], [bx, by]) => Math.hypot((ax - bx) * cellX, (ay - by) * cellY);
  const near = (p, c) => Math.max(Math.abs(p.x - c[0]), Math.abs(p.y - c[1])) <= POI_SNAP_CELLS;
  const direct = m(start, end);
  const atEnd = pois.filter((p) => near(p, end)).sort((a, b) => m([a.x, a.y], end) - m([b.x, b.y], end));
  const target = atEnd[0] || null;
  const limit = Math.max(1000, 0.5 * direct);
  const picked = pois
    .filter((p) => !near(p, start) && !near(p, end))
    .map((p) => ({ ...p, detour: m(start, [p.x, p.y]) + m([p.x, p.y], end) - direct }))
    .filter((p) => p.detour <= limit)
    .sort((a, b) => a.detour - b.detour)
    .slice(0, Math.max(0, maxStops));
  const [ux, uy] = [(end[0] - start[0]) * cellX, (end[1] - start[1]) * cellY];
  const t = (p) => ((p.x - start[0]) * cellX * ux + (p.y - start[1]) * cellY * uy) / (direct * direct || 1);
  const stops = picked.sort((a, b) => t(a) - t(b)).map(({ detour, ...p }) => p);
  return { stops, target };
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

function score(ctx, strategy, path, stopsPois, target, ms) {
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
  if (target) stops.push({ id: target.id, d: out.at(-1).d }); // work at the destination site
  const b = budget(samples, stops.map((s) => s.d), params);
  b.oneWay = out.at(-1).d;
  b.roundTrip = roundTrip;
  // Radiation: surface dose rate measured by Curiosity's RAD in Gale crater × time outside.
  b.doseMSv = evaDoseMSv(b.totalT);
  // Terrain risk: share of the outbound distance on cells whose steepest fine-scale slope > STEEP_DEG.
  b.steepPct = steepShare(path, out, ctx.fineSlope, w);
  const v = verdict(b, sun, params);
  if (ctx.spaceWeather && ctx.spaceWeather.lvl === 'warn') {
    v.issues.push({ lvl: 'caution', msg: `Space weather: ${ctx.spaceWeather.short || 'solar storm forecast at Mars'}. Check before egress, keep the shelter close` });
    if (v.lvl === 'go') v.lvl = 'caution';
  }
  return { strategy, path, budget: b, verdict: v, poisVisited: stops.map((s) => s.id), stops, ms };
}

function steepShare(path, out, fineSlope, w) {
  if (!fineSlope || path.length < 2) return 0;
  let steep = 0;
  for (let i = 1; i < path.length; i++) {
    const [x, y] = path[i];
    if (fineSlope[y * w + x] > STEEP_DEG) steep += out[i].d - out[i - 1].d;
  }
  return (steep / (out.at(-1).d || 1)) * 100;
}

function timed(fn) {
  const t0 = performance.now();
  const value = fn();
  return { value, ms: performance.now() - t0 };
}
