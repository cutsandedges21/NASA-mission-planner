// Adapted from Sol Atlas by The SOL Explorers.
// Changes: added `strategy` (ENERGY / FAST / SAFE) and `roundTrip` options to find(), a per-strategy
// step cost and matching admissible heuristic, a SAFE slope penalty (on cell-to-cell grade and on the
// fine-scale slope inside each cell), rover assist routing (params.rover: drive time / seated O2, roverMaxSlope),
// and an `iterations` stat.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
import { stepCost, walkSpeed, EVA_DEFAULTS } from './eva.js';

class Heap {
  constructor() { this.k = []; this.v = []; }
  get size() { return this.k.length; }
  push(key, val) {
    const k = this.k, v = this.v;
    let i = k.length;
    k.push(key); v.push(val);
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (k[p] <= key) break;
      k[i] = k[p]; v[i] = v[p]; i = p;
    }
    k[i] = key; v[i] = val;
  }
  pop() {
    const k = this.k, v = this.v;
    const top = v[0];
    const lk = k.pop(), lv = v.pop();
    if (k.length) {
      let i = 0;
      const n = k.length;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && k[c + 1] < k[c]) c++;
        if (k[c] >= lk) break;
        k[i] = k[c]; v[i] = v[c]; i = c;
      }
      k[i] = lk; v[i] = lv;
    }
    return top;
  }
}

const DEG = Math.PI / 180;

/** SAFE: slope (deg) above which every extra degree costs quadratically more. */
export const SAFE_SOFT_DEG = 10;
/** SAFE: penalty strength. At 15° a step costs 2.25× its energy, at 20° 6×. */
export const SAFE_K = 0.05;
/** SAFE: hard walking limit used while routing (the verdict still uses the normal 20° limit). */
export const SAFE_MAX_SLOPE = 15;

// Seconds to walk one step (one way).
const stepTime = (dist, dh, p) => dist / walkSpeed(Math.atan2(dh, dist), p);

/**
 * Cost of one grid step for a strategy. With roundTrip the astronaut walks the same step back,
 * so the cost is the sum of both directions.
 */
export function strategyCost(strategy, dist, dh, p, roundTrip) {
  if (p.rover) {
    // Rover assist: constant driving speed; O2 use while seated is rideW × time, so ∝ distance.
    const s = Math.atan2(Math.abs(dh), dist) / DEG;
    const t = dist / p.roverMs;
    const base = strategy === 'FAST' ? t : p.rideW * t;
    const c = strategy === 'SAFE' ? base * (1 + SAFE_K * Math.max(0, s - SAFE_SOFT_DEG) ** 2) : base;
    return roundTrip ? 2 * c : c;
  }
  const one = (d) => {
    if (strategy === 'FAST') return stepTime(dist, d, p);
    const e = stepCost(dist, d, p);
    if (strategy === 'SAFE') {
      const s = Math.atan2(Math.abs(d), dist) / DEG;
      return e * (1 + SAFE_K * Math.max(0, s - SAFE_SOFT_DEG) ** 2);
    }
    return e; // ENERGY (minimises O2)
  };
  return roundTrip ? one(dh) + one(-dh) : one(dh);
}

/**
 * Lower bound on cost per metre of horizontal distance (keeps A* admissible, so routes are optimal).
 * Checked numerically for EVA_DEFAULTS: energy per metre is never below the flat value;
 * one-way walking speed peaks at ~1.19× vFlat on a gentle downhill; round trips never beat 2× flat.
 */
function costPerMetreLB(strategy, p, roundTrip) {
  if (p.rover) {
    const perM = strategy === 'FAST' ? 1 / p.roverMs : p.rideW / p.roverMs;
    return (roundTrip ? 2 : 1) * perM * 0.98;
  }
  if (strategy === 'FAST') return roundTrip ? 2 / p.vFlat * 0.98 : 1 / (p.vFlat * Math.exp(0.175)) * 0.98;
  const flat = stepCost(1, 0, p) * 0.98;
  return roundTrip ? 2 * flat : flat;
}

export class CostGrid {
  /**
   * @param {Float32Array} elev  metres, row-major, row 0 = north
   * @param {number} w, h        grid size
   * @param {number} cellX, cellY cell size (m)
   * @param {Float32Array} fineSlope  max fine-scale slope per cell (deg) or null
   */
  constructor(elev, w, h, cellX, cellY, fineSlope = null) {
    Object.assign(this, { elev, w, h, cellX, cellY, fineSlope });
    this.lastIterations = 0;
  }

  /**
   * @param {object} opts  { strategy: 'ENERGY'|'FAST'|'SAFE' = 'ENERGY', roundTrip = false }
   * @returns {Array<[number, number]>|null} cells from start to goal
   */
  find(ax, ay, bx, by, params = EVA_DEFAULTS, opts = {}) {
    const strategy = opts.strategy || 'ENERGY';
    const roundTrip = !!opts.roundTrip;
    const { w, h, elev, cellX, cellY, fineSlope } = this;
    const N = w * h;
    const g = new Float64Array(N).fill(Infinity);
    const from = new Int32Array(N).fill(-1);
    const closed = new Uint8Array(N);
    const start = ay * w + ax, goal = by * w + bx;
    const limit = params.rover ? (params.roverMaxSlope ?? 20) : params.maxSlope;
    const maxSlope = strategy === 'SAFE' ? Math.min(limit, SAFE_MAX_SLOPE) : limit;
    const maxTan = Math.tan(maxSlope * DEG);
    const lb = costPerMetreLB(strategy, params, roundTrip);
    const heur = (i) => {
      const x = i % w, y = (i / w) | 0;
      return Math.hypot((x - bx) * cellX, (y - by) * cellY) * lb;
    };
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const heap = new Heap();
    g[start] = 0;
    heap.push(heur(start), start);
    let iter = 0;
    while (heap.size) {
      const cur = heap.pop();
      if (closed[cur]) continue;
      if (cur === goal) break;
      closed[cur] = 1;
      if (++iter > 2e6) break;
      const cx = cur % w, cy = (cur / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = cx + dx, ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (closed[ni]) continue;
        const dist = Math.hypot(dx * cellX, dy * cellY);
        const dh = elev[ni] - elev[cur];
        let pen = 1;
        if (Math.abs(dh) / dist > maxTan) pen = 40; // too steep between cells: allowed only as last resort
        if (fineSlope) {
          const fs = fineSlope[ni];
          if (fs > maxSlope) pen = Math.max(pen, 25);
          else if (fs > maxSlope * 0.7) pen = Math.max(pen, 1.6);
          // SAFE also pays its quadratic slope penalty for the steepest ground *inside* the cell
          // (the cell-to-cell grade misses short steep pitches). Only raises costs: heuristic stays admissible.
          if (strategy === 'SAFE' && fs > SAFE_SOFT_DEG) pen *= 1 + SAFE_K * (fs - SAFE_SOFT_DEG) ** 2;
        }
        const c = g[cur] + strategyCost(strategy, dist, dh, params, roundTrip) * pen;
        if (c < g[ni]) {
          g[ni] = c;
          from[ni] = cur;
          heap.push(c + heur(ni), ni);
        }
      }
    }
    this.lastIterations = iter;
    if (from[goal] === -1 && goal !== start) return null;
    const path = [];
    for (let i = goal; i !== -1; i = from[i]) path.push([i % w, (i / w) | 0]);
    return path.reverse();
  }
}
