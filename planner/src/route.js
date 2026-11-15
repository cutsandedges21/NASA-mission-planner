// A* router on the region's elevation grid (8-connected), with one cost function per strategy:
//   ENERGY  least metabolic energy, so least O₂ (eva.js stepCost)
//   FAST    least walking (or driving) time
//   SAFE    energy, plus a quadratic penalty for every degree above 10°, and a 15° routing limit
// `roundTrip` prices each step both ways, because a Marswalk walks back along the same line.
// Rover assist (params.rover) prices steps by driving time / seated O₂ and uses roverMaxSlope.
// Ground steeper than the limit is not forbidden outright, only made very expensive, so a route
// still comes back when no fully walkable one exists (the verdict then flags it).
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
import { stepCost, walkSpeed, EVA_DEFAULTS } from './eva.js';

const DEG_TO_RAD = Math.PI / 180;

/** SAFE: slope (deg) above which every extra degree costs quadratically more. */
export const SAFE_SOFT_DEG = 10;
/** SAFE: penalty strength. At 15° a step costs 2.25× its energy, at 20° 6×. */
export const SAFE_K = 0.05;
/** SAFE: hard walking limit used while routing (the verdict still uses the normal 20° limit). */
export const SAFE_MAX_SLOPE = 15;

/** Cost multiplier for a cell-to-cell step steeper than the limit (a last resort, not a wall). */
const OVER_LIMIT_STEP = 40;
/** Cost multiplier for entering a cell whose fine-scale slope is over the limit. */
const OVER_LIMIT_CELL = 25;
/** Cost multiplier for a cell whose fine-scale slope is within 30 % of the limit. */
const NEAR_LIMIT_CELL = 1.6;
const NEAR_LIMIT_FRACTION = 0.7;
/** Heuristic shrink factor: keeps the straight-line estimate safely below the true cost. */
const HEURISTIC_MARGIN = 0.98;
/** Give up after this many expanded cells. */
const MAX_EXPANSIONS = 2e6;

// Neighbour offsets: 4 straight, then 4 diagonal.
const NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Binary min-heap of (priority, cell index) pairs, stored in two parallel arrays. */
class MinHeap {
  constructor() {
    this.pri = [];
    this.item = [];
  }

  get size() {
    return this.pri.length;
  }

  push(priority, item) {
    const { pri, item: items } = this;
    let at = pri.length;
    pri.push(priority);
    items.push(item);
    while (at > 0) {
      const up = (at - 1) >> 1;
      if (pri[up] <= priority) break;
      pri[at] = pri[up];
      items[at] = items[up];
      at = up;
    }
    pri[at] = priority;
    items[at] = item;
  }

  pop() {
    const { pri, item: items } = this;
    const best = items[0];
    const tailPri = pri.pop();
    const tailItem = items.pop();
    const n = pri.length;
    if (n === 0) return best;
    let at = 0;
    for (;;) {
      const left = 2 * at + 1;
      if (left >= n) break;
      const right = left + 1;
      const child = right < n && pri[right] < pri[left] ? right : left;
      if (pri[child] >= tailPri) break;
      pri[at] = pri[child];
      items[at] = items[child];
      at = child;
    }
    pri[at] = tailPri;
    items[at] = tailItem;
    return best;
  }
}

/** Quadratic SAFE multiplier for ground at `deg` degrees. */
const safeFactor = (deg) => 1 + SAFE_K * Math.max(0, deg - SAFE_SOFT_DEG) ** 2;

/**
 * Cost of one grid step (horizontal `dist` m, climb `dh` m) under a strategy.
 * With roundTrip the same step is also walked back, so both directions are added.
 */
export function strategyCost(strategy, dist, dh, p, roundTrip) {
  if (p.rover) {
    // Constant driving speed; seated O₂ use is rideW × time, so both scale with distance.
    const seconds = dist / p.roverMs;
    let cost = strategy === 'FAST' ? seconds : p.rideW * seconds;
    if (strategy === 'SAFE') cost *= safeFactor(Math.atan2(Math.abs(dh), dist) / DEG_TO_RAD);
    return roundTrip ? 2 * cost : cost;
  }
  const oneWay = (climb) => {
    if (strategy === 'FAST') return dist / walkSpeed(Math.atan2(climb, dist), p);
    const joules = stepCost(dist, climb, p);
    if (strategy === 'SAFE') return joules * safeFactor(Math.atan2(Math.abs(climb), dist) / DEG_TO_RAD);
    return joules;
  };
  return roundTrip ? oneWay(dh) + oneWay(-dh) : oneWay(dh);
}

/**
 * Lowest possible cost per horizontal metre, for the A* heuristic (never overestimates, so routes are optimal).
 * Checked numerically with EVA_DEFAULTS: energy per metre never drops below the flat-ground value; one-way
 * walking speed peaks at e^0.175 ≈ 1.19 × vFlat on a 5 % downhill; a round trip never beats 2 × flat.
 */
function minCostPerMetre(strategy, p, roundTrip) {
  const trips = roundTrip ? 2 : 1;
  if (p.rover) return trips * (strategy === 'FAST' ? 1 / p.roverMs : p.rideW / p.roverMs) * HEURISTIC_MARGIN;
  if (strategy === 'FAST') {
    return roundTrip ? (2 / p.vFlat) * HEURISTIC_MARGIN : (1 / (p.vFlat * Math.exp(0.175))) * HEURISTIC_MARGIN;
  }
  const flat = stepCost(1, 0, p) * HEURISTIC_MARGIN;
  return roundTrip ? 2 * flat : flat;
}

export class CostGrid {
  /**
   * @param {Float32Array} elev  elevation (m), row-major, row 0 = north
   * @param {number} w  columns
   * @param {number} h  rows
   * @param {number} cellX  cell width (m)
   * @param {number} cellY  cell height (m)
   * @param {Float32Array|null} fineSlope  steepest slope inside each cell (deg), or null
   */
  constructor(elev, w, h, cellX, cellY, fineSlope = null) {
    this.elev = elev;
    this.w = w;
    this.h = h;
    this.cellX = cellX;
    this.cellY = cellY;
    this.fineSlope = fineSlope;
    this.lastIterations = 0;
  }

  /**
   * Cheapest path from cell (ax, ay) to cell (bx, by).
   * @param {object} opts  { strategy: 'ENERGY'|'FAST'|'SAFE' = 'ENERGY', roundTrip = false }
   * @returns {Array<[number, number]>|null}  [x, y] cells from start to goal, or null if unreachable
   */
  find(ax, ay, bx, by, params = EVA_DEFAULTS, opts = {}) {
    const strategy = opts.strategy || 'ENERGY';
    const roundTrip = !!opts.roundTrip;
    const { w, h, elev, cellX, cellY, fineSlope } = this;
    const cells = w * h;

    const baseLimit = params.rover ? (params.roverMaxSlope ?? 20) : params.maxSlope;
    const limitDeg = strategy === 'SAFE' ? Math.min(baseLimit, SAFE_MAX_SLOPE) : baseLimit;
    const limitRise = Math.tan(limitDeg * DEG_TO_RAD);
    const perMetre = minCostPerMetre(strategy, params, roundTrip);
    const estimate = (cell) => {
      const x = cell % w, y = (cell / w) | 0;
      return Math.hypot((x - bx) * cellX, (y - by) * cellY) * perMetre;
    };

    const cost = new Float64Array(cells).fill(Infinity);
    const cameFrom = new Int32Array(cells).fill(-1);
    const done = new Uint8Array(cells);
    const start = ay * w + ax;
    const goal = by * w + bx;
    const open = new MinHeap();
    cost[start] = 0;
    open.push(estimate(start), start);

    let expanded = 0;
    while (open.size) {
      const cur = open.pop();
      if (done[cur]) continue; // stale heap entry
      if (cur === goal) break;
      done[cur] = 1;
      if (++expanded > MAX_EXPANSIONS) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy] of NEIGHBOURS) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const next = ny * w + nx;
        if (done[next]) continue;
        const dist = Math.hypot(dx * cellX, dy * cellY);
        const dh = elev[next] - elev[cur];
        let mult = Math.abs(dh) / dist > limitRise ? OVER_LIMIT_STEP : 1;
        if (fineSlope) {
          const inside = fineSlope[next];
          if (inside > limitDeg) mult = Math.max(mult, OVER_LIMIT_CELL);
          else if (inside > limitDeg * NEAR_LIMIT_FRACTION) mult = Math.max(mult, NEAR_LIMIT_CELL);
          // SAFE also pays its slope penalty for short steep pitches *inside* the cell, which the
          // cell-to-cell grade misses. This only raises costs, so the heuristic stays admissible.
          if (strategy === 'SAFE' && inside > SAFE_SOFT_DEG) mult *= safeFactor(inside);
        }
        const via = cost[cur] + strategyCost(strategy, dist, dh, params, roundTrip) * mult;
        if (via < cost[next]) {
          cost[next] = via;
          cameFrom[next] = cur;
          open.push(via + estimate(next), next);
        }
      }
    }
    this.lastIterations = expanded;

    if (cameFrom[goal] === -1 && goal !== start) return null;
    const path = [];
    for (let c = goal; c !== -1; c = cameFrom[c]) path.push([c % w, (c / w) | 0]);
    return path.reverse();
  }
}
