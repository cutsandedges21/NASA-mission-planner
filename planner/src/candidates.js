// Five seeded mission simulations, Point 1 → Point 2 (T-35, Gianluca's spec, Sat 19:40).
// Each seed draws its own (1) risk appetite (how much the route trades time for safety), (2) hidden ground
// (soft sand vs packed soil, which a 25 m orbital map can't resolve) and (3) weather (dust storm,
// crew pace). The router finds that seed's route, then the EVA is simulated on it. Of the five:
//   FASTEST  = first to reach Point 2, among runs that are not NO-GO (safety isn't ignored completely:
//              the 20° walking limit and the O₂ reserve still hold)
//   SAFEST   = fewest safety problems on the way (steep stretches, cautions, storms, turn-backs)
//   BALANCED = of the rest, the best on both rankings at once ("second to both")
//   the other runs stay available as alternatives.
// Physics = the planner's EVA model. Event chances: MDAD dust data + labelled assumptions (simulate.js).
// Pure ES module, no Node-only imports: runs in the browser Web Worker.
import { stepCost, walkSpeed, metabolicW, budget, verdict, EVA_DEFAULTS } from './eva.js';
import { toSamples, STEEP_DEG, pitStopId, viaCells } from './plan.js';
import { smoothLine } from './smooth.js';
import { rng, drawConditions, runOnce, dustRate, SIM_DEFAULTS, SIM_ASSUMPTIONS } from './simulate.js';

export const CANDIDATE_DEFAULTS = { runs: 5, seed: 2026, fieldCells: 10 };
const DEG = Math.PI / 180;
const SOFT_DEG = 10, K = 0.05; // same quadratic slope penalty as SAFE in route.js

/**
 * Hidden ground: Pandolf terrain factor per cell, a smooth random field between terrainMin and terrainMax
 * (bilinear between a coarse G×G grid of random values, ~1–3 km patches on the Gale map).
 */
export function groundField(seed, w, h, tMin = SIM_DEFAULTS.terrainMin, tMax = SIM_DEFAULTS.terrainMax, G = CANDIDATE_DEFAULTS.fieldCells) {
  const r = rng(seed * 7919 + 17);
  const ctl = Float32Array.from({ length: (G + 1) * (G + 1) }, () => tMin + (tMax - tMin) * r());
  const f = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const gy = (y / Math.max(1, h - 1)) * G, y0 = Math.min(G - 1, Math.floor(gy)), fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = (x / Math.max(1, w - 1)) * G, x0 = Math.min(G - 1, Math.floor(gx)), fx = gx - x0;
      const a = ctl[y0 * (G + 1) + x0], b = ctl[y0 * (G + 1) + x0 + 1];
      const c = ctl[(y0 + 1) * (G + 1) + x0], d = ctl[(y0 + 1) * (G + 1) + x0 + 1];
      f[y * w + x] = (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
    }
  }
  return f;
}

/**
 * A* with a blended cost: (1 − safety) × walking time + safety × slope-penalised energy (in seconds of flat
 * walking), energy scaled by the hidden ground. Same hard limits as the planner (route.js); the slope limit
 * tightens from 20° to 15° as safety → 1.
 */
export function findBlend(g, ax, ay, bx, by, p, safety, field, roundTrip = true) {
  const { w, h, elev, cellX, cellY, fineSlope } = g;
  const N = w * h;
  const cost = new Float64Array(N).fill(Infinity);
  const from = new Int32Array(N).fill(-1);
  const closed = new Uint8Array(N);
  const start = ay * w + ax, goal = by * w + bx;
  const limit = (p.rover ? (p.roverMaxSlope ?? 20) : p.maxSlope) - 5 * safety;
  const maxTan = Math.tan(limit * DEG);
  const P0 = p.rover ? p.rideW : metabolicW(p.vFlat, 0, p); // W on flat ground: J → seconds of flat walking
  let fMin = Infinity;
  for (let i = 0; i < field.length; i++) if (field[i] < fMin) fMin = field[i];
  const rel = (i) => field[i] / p.terrain;
  const tPerM = p.rover ? 1 / p.roverMs : roundTrip ? 2 / p.vFlat : 1 / (p.vFlat * Math.exp(0.175));
  const ePerM = (p.rover ? p.rideW / p.roverMs : stepCost(1, 0, p)) * (roundTrip ? 2 : 1);
  const lb = ((1 - safety) * tPerM + safety * Math.min(1, fMin / p.terrain) * ePerM / P0) * 0.97;
  const heur = (i) => Math.hypot((i % w - bx) * cellX, (((i / w) | 0) - by) * cellY) * lb;
  const one = (dist, dh) => {
    if (p.rover) { const t = dist / p.roverMs; return [t, p.rideW * t]; }
    return [dist / walkSpeed(Math.atan2(dh, dist), p), stepCost(dist, dh, p)];
  };
  const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  // binary heap on (key, index)
  const hk = [], hv = [];
  const push = (k, v) => {
    let i = hk.length; hk.push(k); hv.push(v);
    while (i > 0) { const q = (i - 1) >> 1; if (hk[q] <= k) break; hk[i] = hk[q]; hv[i] = hv[q]; i = q; }
    hk[i] = k; hv[i] = v;
  };
  const pop = () => {
    const top = hv[0], lk = hk.pop(), lv = hv.pop();
    if (hk.length) {
      let i = 0; const n = hk.length;
      for (;;) { let c = 2 * i + 1; if (c >= n) break; if (c + 1 < n && hk[c + 1] < hk[c]) c++; if (hk[c] >= lk) break; hk[i] = hk[c]; hv[i] = hv[c]; i = c; }
      hk[i] = lk; hv[i] = lv;
    }
    return top;
  };
  cost[start] = 0;
  push(heur(start), start);
  let iter = 0;
  while (hk.length) {
    const cur = pop();
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
      if (Math.abs(dh) / dist > maxTan) pen = 40;
      let slopePen = 1 + K * Math.max(0, Math.atan2(Math.abs(dh), dist) / DEG - SOFT_DEG) ** 2;
      if (fineSlope) {
        const fs = fineSlope[ni];
        if (fs > limit) pen = Math.max(pen, 25);
        else if (fs > limit * 0.7) pen = Math.max(pen, 1.6);
        if (fs > SOFT_DEG) slopePen *= 1 + K * (fs - SOFT_DEG) ** 2;
      }
      const [t1, e1] = one(dist, dh);
      const [t2, e2] = roundTrip ? one(dist, -dh) : [0, 0];
      const step = ((1 - safety) * (t1 + t2) + safety * slopePen * rel(ni) * (e1 + e2) / P0) * pen;
      const c = cost[cur] + step;
      if (c < cost[ni]) { cost[ni] = c; from[ni] = cur; push(c + heur(ni), ni); }
    }
  }
  if (from[goal] === -1 && goal !== start) return null;
  const path = [];
  for (let i = goal; i !== -1; i = from[i]) path.push([i % w, (i / w) | 0]);
  return path.reverse();
}

/** Contiguous stretches of the outbound path on ground steeper than STEEP_DEG: [{fromM, toM, maxDeg}]. */
function steepStretches(path, out, fineSlope, w) {
  const res = [];
  if (!fineSlope) return res;
  let cur = null;
  for (let i = 0; i < path.length; i++) {
    const fs = fineSlope[path[i][1] * w + path[i][0]];
    if (fs > STEEP_DEG) {
      if (!cur) cur = { fromM: out[i].d, toM: out[i].d, maxDeg: fs };
      cur.toM = out[i].d; cur.maxDeg = Math.max(cur.maxDeg, fs);
    } else if (cur) { res.push(cur); cur = null; }
  }
  if (cur) res.push(cur);
  return res;
}

/** Budget + verdict for a path, like plan.js score() (kept separate so plan.js stays untouched). */
function scoreCandidate(a, p, path, viaPois) {
  const { elev, w, cellX, cellY, fineSlope } = a;
  const roundTrip = a.roundTrip !== false;
  const out = toSamples(path, elev, w, cellX, cellY);
  const samples = roundTrip ? out.concat(toSamples(path.slice().reverse(), elev, w, cellX, cellY, out.at(-1).d).slice(1)) : out;
  const stops = [], stopIdx = [];
  let from = 0;
  viaPois.forEach((v, i) => {
    const k = path.findIndex(([x, y], j) => j >= from && x === v.x && y === v.y);
    if (k >= 0) { stops.push({ id: pitStopId(i), d: out[k].d }); stopIdx.push(k); from = k; }
  });
  const b = budget(samples, stops.map((s) => s.d), p);
  b.oneWay = out.at(-1).d;
  b.roundTrip = roundTrip;
  if (!Number.isFinite(b.avgW)) b.avgW = 0;
  b.gradeMaxSlope = b.maxSlope;
  b.fineMaxSlope = fineSlope ? Math.max(0, ...path.map(([x, y]) => fineSlope[y * w + x])) : 0;
  b.maxSlope = Math.max(b.gradeMaxSlope, b.fineMaxSlope);
  const steep = steepStretches(path, out, fineSlope, w);
  b.steepPct = (steep.reduce((t, s) => t + Math.max(s.toM - s.fromM, 25), 0) / (b.oneWay || 1)) * 100;
  b.mode = p.rover ? 'rover' : 'foot';
  const vp = p.rover ? { ...p, maxSlope: p.roverMaxSlope ?? 20 } : p;
  const v = verdict(b, a.sun || null, vp);
  const line = smoothLine(path, { elev, w, cellX, cellY, fineSlope }, stopIdx);
  return { path, line, budget: b, verdict: v, stops, poisVisited: stops.map((s) => s.id), steep };
}

/** Safety problems met on the way, each with a weight (NO-GO issues count double). */
function problemsOf(route, run) {
  const list = [];
  for (const s of route.steep) list.push({ w: 1, msg: `${Math.round(Math.max(25, s.toM - s.fromM))} m of ground steeper than ${STEEP_DEG}° (up to ${s.maxDeg.toFixed(0)}°) at ${(s.fromM / 1000).toFixed(1)} km` });
  for (const e of run.events) list.push({ w: 1, msg: e.type === 'dust' ? `${e.kind === 'regional' ? 'Regional' : 'Local'} dust storm, τ ${e.tau.toFixed(1)}: ${e.decision}` : e.decision });
  for (const i of run.issues) if (i.lvl !== 'go') list.push({ w: i.lvl === 'nogo' ? 2 : 1, msg: `${i.lvl === 'nogo' ? 'NO-GO' : 'Caution'}: ${i.msg}` });
  return list;
}

/**
 * Run the five seeded simulations.
 * @param {object} a  planMission() args (elev, w, h, cellX, cellY, fineSlope, start, end, via, params, sun, roundTrip)
 * @param {object} [o] { runs, seed, Ls, dust, forceDust, daylight: { startH, sunsetH } } + SIM_DEFAULTS overrides
 */
export function simulateCandidates(a, o = {}) {
  const s = { ...SIM_DEFAULTS, ...CANDIDATE_DEFAULTS, ...o };
  const p = { ...EVA_DEFAULTS, ...(a.params || {}) };
  const g = { w: a.w, h: a.h, elev: a.elev, cellX: a.cellX, cellY: a.cellY, fineSlope: a.fineSlope || null };
  const cells = viaCells(a);
  const viaPoi = cells.map(([x, y]) => ({ x, y }));
  const wps = [a.start, ...cells, a.end];
  // Risk appetite: one seed in each fifth of [0, 1] (seeded order), so the five routes really differ.
  const r0 = rng(s.seed);
  const order = Array.from({ length: s.runs }, (_, i) => i).sort(() => r0() - 0.5);
  const runs = [];
  for (let i = 0; i < s.runs; i++) {
    const seed = s.seed + i;
    const safety = Math.min(1, (order[i] + r0()) / s.runs);
    const field = groundField(seed, a.w, a.h, s.terrainMin, s.terrainMax, s.fieldCells);
    let path = [];
    for (let k = 1; k < wps.length && path; k++) {
      const leg = findBlend(g, wps[k - 1][0], wps[k - 1][1], wps[k][0], wps[k][1], p, safety, field, a.roundTrip !== false);
      path = leg ? path.concat(path.length ? leg.slice(1) : leg) : null;
    }
    if (!path) { runs.push({ i, seed, safety, route: null, run: null, problems: [{ w: 2, msg: 'No walkable route found' }] }); continue; }
    let route = { strategy: `SIM ${i + 1}`, ...scoreCandidate(a, p, path, viaPoi) };
    // Daylight (o.daylight = { startH, sunsetH }, local solar hours): margin from this route's own duration.
    let ar = a;
    if (o.daylight) {
      ar = { ...a, sun: { endMarginH: o.daylight.sunsetH - o.daylight.startH - route.budget.totalT / 3600 } };
      route = { strategy: route.strategy, ...scoreCandidate(ar, p, path, viaPoi) };
    }
    const c = drawConditions(seed, { ...o, evaMaxH: p.evaMaxH });
    // Cautious seeds follow the SAFE storm rule (turn back for any storm on the way out).
    const run = runOnce(route, ar, c, { ...o, field, safeRule: safety > 0.6 });
    const problems = problemsOf(route, run);
    runs.push({ i, seed, safety, route, run, problems, problemScore: problems.reduce((t, x) => t + x.w, 0) });
  }
  return {
    runs, ...pickRoles(runs), assumptions: SIM_ASSUMPTIONS,
    dustRate: dustRate(o.dust, o.Ls), dustSource: o.dust?.source ?? null, forceDust: !!o.forceDust,
  };
}

/** FASTEST / SAFEST / BALANCED / alternatives, by index into runs. */
export function pickRoles(runs) {
  const ok = runs.filter((x) => x.run);
  if (!ok.length) return { fastest: null, safest: null, balanced: null, alternatives: [], why: 'No walkable route found between these points.' };
  const arrived = ok.filter((x) => x.run.arriveS != null && x.run.lvl !== 'nogo');
  const poolF = arrived.length ? arrived : ok.filter((x) => x.run.arriveS != null).length ? ok.filter((x) => x.run.arriveS != null) : ok;
  const fastest = poolF.reduce((b, x) => ((x.run.arriveS ?? Infinity) < (b.run.arriveS ?? Infinity) ? x : b));
  // Runs that reached Point 2 rank ahead of runs that turned back (a turn-back is safe but fails the mission).
  const reached = (x) => (x.run.arriveS != null ? 0 : 1);
  const safer = (x, y) => reached(x) - reached(y) || x.problemScore - y.problemScore ||
    x.route.budget.maxSlope - y.route.budget.maxSlope || y.run.marginPct - x.run.marginPct;
  const bySafety = ok.slice().sort(safer);
  const byTime = ok.slice().sort((x, y) => (x.run.arriveS ?? Infinity) - (y.run.arriveS ?? Infinity) || x.run.totalT - y.run.totalT);
  // Safest overall. If it's also the fastest, that run holds both labels (we don't relabel a less safe run).
  // Ties go to a run that isn't the fastest, so three different routes show when the data allows.
  let safest = bySafety[0];
  if (safest === fastest && bySafety[1] && safer(bySafety[1], fastest) === 0) safest = bySafety[1];
  const rest = ok.filter((x) => x !== fastest && x !== safest);
  const rT = new Map(byTime.map((x, k) => [x, k])), rS = new Map(bySafety.map((x, k) => [x, k]));
  const balanced = rest.length
    ? rest.reduce((b, x) => {
      const kx = [reached(x), Math.max(rT.get(x), rS.get(x)), rT.get(x) + rS.get(x), -x.run.marginPct];
      const kb = [reached(b), Math.max(rT.get(b), rS.get(b)), rT.get(b) + rS.get(b), -b.run.marginPct];
      for (let k = 0; k < 4; k++) if (kx[k] !== kb[k]) return kx[k] < kb[k] ? x : b;
      return b;
    })
    : null;
  const alternatives = ok.filter((x) => x !== fastest && x !== safest && x !== balanced).map((x) => x.i);
  return { fastest: fastest.i, safest: safest.i, balanced: balanced ? balanced.i : null, alternatives, bothFastestAndSafest: safest === fastest };
}

const hm = (sec) => { const m = Math.round(sec / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };

/** One plain-language paragraph per candidate, from its numbers, compared with the BALANCED run. */
export function describeCandidate(x, ref, role) {
  if (!x.run) return 'No walkable route for this simulation.';
  const r = x.run, b = x.route.budget;
  const parts = [];
  const lean = x.safety < 0.34 ? 'leans toward speed' : x.safety > 0.66 ? 'leans toward safety' : 'balances speed and safety';
  parts.push(`Seed ${x.seed}: this route ${lean} (safety weight ${x.safety.toFixed(2)}).`);
  parts.push(r.arriveS != null ? `Reaches Point 2 after ${hm(r.arriveS)}; back at base after ${hm(r.totalT)} (${(r.distance / 1000).toFixed(1)} km).` : `Turned back before Point 2, ${((r.turnedBackAtM ?? 0) / 1000).toFixed(1)} km out; back at base after ${hm(r.totalT)}.`);
  parts.push(`Steepest ground ${b.maxSlope.toFixed(0)}°, climbs ${Math.round(b.gain / (b.roundTrip ? 2 : 1))} m on the way out, O₂ left ${r.marginPct.toFixed(0)} %. Ground factor ${r.terrain.toFixed(2)} on average.`);
  parts.push(x.problems.length ? `${x.problems.length} safety problem(s): ${x.problems.map((q) => q.msg).join('; ')}.` : 'No safety problems on the way.');
  if (ref && ref !== x && ref.run && r.arriveS != null && ref.run.arriveS != null) {
    const dt = r.arriveS - ref.run.arriveS;
    parts.push(`Compared with BALANCED: ${hm(Math.abs(dt))} ${dt <= 0 ? 'faster' : 'slower'} to Point 2, ${x.problems.length - ref.problems.length >= 0 ? '+' : ''}${x.problems.length - ref.problems.length} problem(s).`);
  }
  if (role === 'FASTEST') parts.push(r.lvl === 'nogo'
    ? 'Chosen as FASTEST only because no simulation avoided a NO-GO: it is the quickest, but NOT safe to walk.'
    : 'Chosen as FASTEST: first to Point 2 without a NO-GO.');
  if (role === 'SAFEST') parts.push('Chosen as SAFEST: reaches Point 2 with the fewest safety problems (ties: gentler slopes, then more O₂ left).');
  if (role !== 'FASTEST' && r.lvl === 'nogo') parts.push('NOT safe to walk as planned.');
  if (role === 'BALANCED') parts.push('Chosen as BALANCED: of the rest, the best on both the time and the safety ranking.');
  return parts.join(' ');
}
