// smoothLine(): turn the A* cell path (8 directions, so a 45° staircase) into the line a rover
// driver would draw: long straight runs where the ground allows, rounded bends.
// Display only. The EVA budget is still computed on the cell path, which is never shorter
// than this line, so the numbers stay conservative.
//
// A straight shortcut from cell i to cell j is accepted only if, compared with the computed
// route between i and j, it
//   (a) never enters a cell whose fine-scale slope is steeper than the steepest cell the route used,
//   (b) never has a steeper cell-to-cell grade than the route had,
//   (c) stays within maxDev cells of the route (so the line is faithful to what was planned).
// Then the corners are cut (Chaikin), each cut capped at maxCut cells.

const MAX_LOOK = 160; // farthest shortcut tried, in path cells

/**
 * @param {Array<[number,number]>} path  cells from A*
 * @param {{elev: Float32Array, w: number, cellX: number, cellY: number, fineSlope?: Float32Array|null}} ctx
 * @param {number[]} [anchors]  path indices the line must pass through exactly (science stops); the ends always are
 * @param {{maxDev?: number, maxCut?: number, rounds?: number}} [opts]
 * @returns {Array<[number,number]>} fractional cell coordinates, same frame as path
 */
export function smoothLine(path, ctx, anchors = [], opts = {}) {
  if (!path || path.length < 3) return path ? path.map(([x, y]) => [x, y]) : path;
  const { maxDev = 2, maxCut = 2, rounds = 2 } = opts;
  const keep = [...new Set([0, path.length - 1, ...anchors.filter((i) => i > 0 && i < path.length - 1)])].sort((a, b) => a - b);
  const out = [];
  for (let s = 1; s < keep.length; s++) {
    const pulled = pull(path, keep[s - 1], keep[s], ctx, maxDev);
    const smooth = chaikin(pulled, rounds, maxCut);
    out.push(...(out.length ? smooth.slice(1) : smooth));
  }
  return out.map(([x, y]) => [round3(x), round3(y)]);
}

function pull(path, a, b, ctx, maxDev) {
  const { elev, w, cellX, cellY, fineSlope } = ctx;
  const res = [path[a]];
  let i = a;
  while (i < b) {
    let best = i + 1;
    let subFine = cellFine(path[i]), subGrade = 0;
    for (let j = i + 1; j <= Math.min(b, i + MAX_LOOK); j++) {
      subFine = Math.max(subFine, cellFine(path[j]));
      subGrade = Math.max(subGrade, grade(path[j - 1], path[j]));
      if (j > i + 1 && ok(i, j, subFine, subGrade)) best = j;
    }
    res.push(path[best]);
    i = best;
  }
  return res;

  function cellFine([x, y]) { return fineSlope ? fineSlope[y * w + x] : 0; }
  function grade([ax, ay], [bx, by]) {
    const d = Math.hypot((bx - ax) * cellX, (by - ay) * cellY);
    return d ? Math.abs(elev[by * w + bx] - elev[ay * w + ax]) / d : 0;
  }
  function ok(i, j, subFine, subGrade) {
    const [ax, ay] = path[i], [bx, by] = path[j];
    const dx = bx - ax, dy = by - ay, len = Math.hypot(dx, dy);
    // (c) every route cell between i and j is within maxDev cells of the shortcut
    for (let k = i + 1; k < j; k++) {
      const [px, py] = path[k];
      if (Math.abs((px - ax) * dy - (py - ay) * dx) / len > maxDev) return false;
    }
    // (a) + (b) walk the shortcut in half-cell steps
    const n = Math.ceil(len * 2);
    let prev = path[i];
    for (let t = 1; t <= n; t++) {
      const c = [Math.round(ax + (dx * t) / n), Math.round(ay + (dy * t) / n)];
      if (c[0] === prev[0] && c[1] === prev[1]) continue;
      if (cellFine(c) > subFine + 1e-6) return false;
      if (grade(prev, c) > subGrade + 1e-6) return false;
      prev = c;
    }
    return true;
  }
}

/** Chaikin corner cutting with fixed ends; each cut is at most maxCut cells from the corner. */
function chaikin(pts, rounds, maxCut) {
  let p = pts;
  for (let r = 0; r < rounds && p.length > 2; r++) {
    const q = [p[0]];
    for (let k = 0; k < p.length - 1; k++) {
      const [ax, ay] = p[k], [bx, by] = p[k + 1];
      const len = Math.hypot(bx - ax, by - ay);
      if (!len) continue;
      const f = Math.min(0.25, maxCut / len);
      if (k > 0) q.push([ax + (bx - ax) * f, ay + (by - ay) * f]);
      if (k < p.length - 2) q.push([bx - (bx - ax) * f, by - (by - ay) * f]);
    }
    q.push(p.at(-1));
    p = q;
  }
  return p;
}

function round3(v) { return Math.round(v * 1000) / 1000; }
