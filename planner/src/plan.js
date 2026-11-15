// planMission(): the one call the web app makes. Returns SAFE / FAST / SCIENCE routes, each
// scored with the EVA model (time, O2, slope) and a GO / CAUTION / NO-GO verdict.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
import { CostGrid } from './route.js';
import { smoothLine } from './smooth.js';
import { budget, verdict, EVA_DEFAULTS } from './eva.js';

export { EVA_DEFAULTS };
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
 * @param {object} [a.params]   overrides for EVA_DEFAULTS (crew mass, O2 capacity, …)
 * @param {boolean} [a.roundTrip=true]  walk back to the start along the same route (a Marswalk ends at the airlock)
 * @param {number} [a.maxStops=2]  most POIs the SCIENCE route visits
 * @param {[number,number]} [a.via]  pit stop ("point 1.5", T-35): every route passes through this cell on the way out
 *   and spends `params.stopMin` there. Never dropped by the SCIENCE safety loop.
 * @param {Array<[number,number]>} [a.vias]  any number of pit stops, visited in this order on the way out (replaces a.via).
 *   Stop ids: 'pitstop' for the first, then 'pitstop2', 'pitstop3', … (pitStopId()).
 * @returns {Array<{strategy, path, line, budget, verdict, poisVisited: string[], stops: Array<{id,d}>, ms, note?: string}>}
 */
export function planMission(a) {
  const { elev, w, h, cellX, cellY, fineSlope = null, start, end, pois = [], sun = null,
    roundTrip = true, maxStops = 2 } = a;
  const params = { ...EVA_DEFAULTS, ...(a.params || {}) };
  const vias = viaCells(a).map(([x, y], i) => ({ id: pitStopId(i), x, y, forced: true }));
  for (const [x, y] of [start, end, ...viaCells(a)]) {
    if (!(x >= 0 && y >= 0 && x < w && y < h)) throw new RangeError(`cell [${x}, ${y}] is outside the ${w}×${h} grid`);
  }
  const grid = new CostGrid(elev, w, h, cellX, cellY, fineSlope);
  const ctx = { grid, elev, w, cellX, cellY, fineSlope, params, sun, roundTrip };
  const viaStops = vias;
  const through = (list) => [start, ...list.map((p) => [p.x, p.y]), end];
  // Pit stops (in the user's order) + science stops: each science stop goes into the stretch between the
  // two pit stops it sits closest to along the way.
  const withVia = (list) => (vias.length ? mergeStops(vias, list, start, end, cellX, cellY) : list);

  const fast = timed(() => legs(ctx, through(viaStops), 'FAST'));
  const safe = timed(() => legs(ctx, through(viaStops), 'SAFE'));
  const { stops: chosen0, target } = pickScienceStops(start, end, pois, cellX, cellY, maxStops);
  // Every route works at the destination for params.stopMin before heading back, like at a pit stop
  // (Justin, Sun 15 Nov). Its stop id is the science site there, or DESTINATION_ID for any other point.
  const atEnd = target || { id: DESTINATION_ID, x: end[0], y: end[1] };
  const chosen = chosen0.filter((p) => vias.every((v) => Math.max(Math.abs(p.x - v.x), Math.abs(p.y - v.y)) > POI_SNAP_CELLS));
  let science;
  if (!chosen.length && !target) {
    // No science site worth the walk: reuse the SAFE path rather than force a big detour.
    science = score(ctx, 'SCIENCE', safe.value, viaStops, atEnd, safe.ms);
    science.note = 'No science site within reach of this route';
  } else {
    // Try the chosen stops; if they make the EVA worse than going without them (e.g. NO-GO on O₂),
    // drop the stop with the biggest detour and try again. Science should never cost the walk home.
    const RANK = { go: 0, caution: 1, nogo: 2 };
    const walkCtx = ctx;
    let stops = chosen.slice();
    let ms = 0;
    let path = null;
    let fellBackToSafe = false;
    for (;;) {
      const sci = timed(() => legs(ctx, through(withVia(stops)), 'ENERGY'));
      ms += sci.ms;
      path = sci.value;
      science = score(walkCtx, 'SCIENCE', path, withVia(stops), atEnd, ms);
      if (!stops.length || RANK[science.verdict.lvl] === 0) break;
      const worst = stops.reduce((a, b) => (detourOf(a, start, end, cellX, cellY) >= detourOf(b, start, end, cellX, cellY) ? a : b));
      const fewer = stops.filter((p) => p !== worst);
      if (!fewer.length && !target) {
        // without any site the route is just SAFE: keep the stop if SAFE is no better
        const safeScore = score(walkCtx, 'SAFE', safe.value, viaStops, atEnd, 0);
        if (RANK[safeScore.verdict.lvl] >= RANK[science.verdict.lvl]) break;
        fellBackToSafe = true;
        break;
      }
      const trial = timed(() => legs(ctx, through(withVia(fewer)), 'ENERGY'));
      ms += trial.ms;
      const t = score(walkCtx, 'SCIENCE', trial.value, withVia(fewer), atEnd, ms);
      const better = RANK[t.verdict.lvl] < RANK[science.verdict.lvl] ||
        (science.verdict.lvl === 'nogo' && t.verdict.lvl === 'nogo' && t.budget.marginPct > science.budget.marginPct);
      if (better) { stops = fewer; path = trial.value; science = t; continue; }
      break;
    }
    if (fellBackToSafe) {
      science = { ...score(ctx, 'SAFE', safe.value, viaStops, atEnd, ms), strategy: 'SCIENCE', note: 'Science stops dropped: they would make this EVA unsafe' };
    } else {
      science = score(ctx, 'SCIENCE', path, withVia(stops), atEnd, ms); // final score
    }
    if (stops.length < chosen.length && !science.note) {
      const n = chosen.length - stops.length;
      science.note = science.verdict.lvl === 'nogo'
        ? `Skipped ${n} extra science stop(s): this EVA is too long even without them`
        : `Skipped ${n} extra science stop(s) to keep the EVA safe`;
    }
  }
  return [
    score(ctx, 'SAFE', safe.value, viaStops, atEnd, safe.ms),
    score(ctx, 'FAST', fast.value, viaStops, atEnd, fast.ms),
    science,
  ];
}

/** Stop id used for the user's (first) pit stop (`a.via` / `a.vias[0]`) in `route.stops` / `poisVisited`. */
export const PIT_STOP_ID = 'pitstop';
/** Stop id of the stop at the destination when it isn't a science site. */
export const DESTINATION_ID = 'destination';
/** Stop id of pit stop number i (0-based): 'pitstop', 'pitstop2', 'pitstop3', … */
export const pitStopId = (i) => (i ? `${PIT_STOP_ID}${i + 1}` : PIT_STOP_ID);
/** Pit stop number (1-based) for a stop id, or 0 if it isn't a pit stop. */
export const pitStopNumber = (id) => {
  const m = /^pitstop(\d*)$/.exec(id || '');
  return m ? Number(m[1] || 1) : 0;
};
/** The pit stop cells of a planMission() call: a.vias, or the single legacy a.via. */
export function viaCells(a) {
  return a.vias && a.vias.length ? a.vias : a.via ? [a.via] : [];
}

/** Science stops slotted between the pit stops (kept in the user's order), each in the stretch it's nearest. */
function mergeStops(vias, list, start, end, cellX, cellY) {
  const pts = [start, ...vias.map((v) => [v.x, v.y]), end];
  const seg = (p) => {
    let best = 0, bestD = Infinity;
    for (let i = 1; i < pts.length; i++) {
      const d = detourOf(p, pts[i - 1], pts[i], cellX, cellY);
      if (d < bestD) { bestD = d; best = i - 1; }
    }
    return best;
  };
  const out = [];
  for (let i = 0; i <= vias.length; i++) {
    const inSeg = list.filter((p) => seg(p) === i);
    out.push(...orderAlong(inSeg, pts[i], pts[i + 1], cellX, cellY));
    if (i < vias.length) out.push(vias[i]);
  }
  return out;
}

/** Sort stops by how far along start → end they sit (projection on the straight line). */
function orderAlong(list, start, end, cellX, cellY) {
  const [ux, uy] = [(end[0] - start[0]) * cellX, (end[1] - start[1]) * cellY];
  const d2 = ux * ux + uy * uy || 1;
  const t = (p) => ((p.x - start[0]) * cellX * ux + (p.y - start[1]) * cellY * uy) / d2;
  return list.slice().sort((a, b) => t(a) - t(b));
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

function detourOf(p, start, end, cellX, cellY) {
  const m = ([ax, ay], [bx, by]) => Math.hypot((ax - bx) * cellX, (ay - by) * cellY);
  return m(start, [p.x, p.y]) + m([p.x, p.y], end) - m(start, end);
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
  const stopIdx = [];
  let k = 0;
  for (const p of stopsPois) {
    while (k < path.length && !(path[k][0] === p.x && path[k][1] === p.y)) k++;
    if (k < path.length) { stops.push({ id: p.id, d: out[k].d }); stopIdx.push(k); }
  }
  if (target) stops.push({ id: target.id, d: out.at(-1).d }); // work at the destination before heading back
  const b = budget(samples, stops.map((s) => s.d), params);
  b.oneWay = out.at(-1).d;
  b.roundTrip = roundTrip;
  if (!Number.isFinite(b.avgW)) b.avgW = 0; // zero-length route (start == end)
  // Max slope = the steeper of the cell-to-cell grade and the steepest ground inside any cell walked
  // through (from fineSlope). The grade alone misses short steep pitches, e.g. a target on a cliff.
  b.gradeMaxSlope = b.maxSlope;
  b.fineMaxSlope = ctx.fineSlope ? Math.max(0, ...path.map(([x, y]) => ctx.fineSlope[y * w + x])) : 0;
  b.maxSlope = Math.max(b.gradeMaxSlope, b.fineMaxSlope);
  // Terrain risk: share of the outbound distance on cells whose steepest fine-scale slope > STEEP_DEG.
  b.steepPct = steepShare(path, out, ctx.fineSlope, w);
  b.mode = params.rover ? 'rover' : 'foot';
  // The rover has its own slope limit; the verdict judges the route against the limit of the mode used.
  const vParams = params.rover ? { ...params, maxSlope: params.roverMaxSlope ?? 20 } : params;
  const v = verdict(b, sun, vParams);
  if (params.rover) for (const i of v.issues) i.msg = i.msg.replace('(limit ', '(rover limit ');
  // Display line: straight runs + rounded bends, never on steeper ground than the cell path (smooth.js).
  // The budget above stays computed on the cell path.
  const line = smoothLine(path, ctx, stopIdx);
  return { strategy, path, line, budget: b, verdict: v, poisVisited: stops.map((s) => s.id).filter((id) => id !== DESTINATION_ID), stops, ms };
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
