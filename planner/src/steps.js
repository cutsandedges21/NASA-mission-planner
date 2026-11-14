// Step-by-step route description (T-35): the outbound walk cut into legs at the turns, each with
// heading, distance, climb/descent, steepest ground, time and O2. Every number is computed from the
// route (planner output) and the terrain grid. Pure ES module: runs in the browser Web Worker.
import { STEEP_DEG } from './plan.js';

const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
const TURN_DEG = 25;     // a change of heading bigger than this starts a new leg
const MIN_LEG_M = 150;   // legs shorter than this merge into the next one
const CLIMB_M = 15;      // a high point this far above both ends of a leg = "going over" a rise
const MAX_LEG_M = 1000;  // long straight runs are cut into checkpoints of at most this length

/** Heading in degrees clockwise from north. Grid row 0 is north, so +y is south. */
const heading = (dx, dy) => ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
const turnOf = (h1, h2) => ((h2 - h1 + 540) % 360) - 180; // + = right, − = left

/**
 * @param {object} route  one planMission() route (needs path, line, budget, stops)
 * @param {object} a      { elev, w, h, cellX, cellY, fineSlope }
 * @param {object} [names] POI id → display name
 * @returns {Array<{n, fromM, toM, distM, heading, compass, turn, dhM, gainM, lossM, maxSlope, avgGradePct, tS, o2Kg, steep, climb, stopAtEnd, text}>}
 */
export function describeSteps(route, a, names = {}) {
  if (!route?.path || route.path.length < 2) return [];
  const { elev, w, h, cellX, cellY, fineSlope } = a;
  const raw = (route.line && route.line.length >= 2 ? route.line : route.path);
  // Densify to ≤ 250 m pieces so a long straight run can be cut into ≤ MAX_LEG_M checkpoints.
  const pts = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const [ax, ay] = raw[i - 1], [bx, by] = raw[i];
    const n = Math.max(1, Math.ceil(Math.hypot((bx - ax) * cellX, (by - ay) * cellY) / 250));
    for (let j = 1; j <= n; j++) pts.push([ax + (bx - ax) * (j / n), ay + (by - ay) * (j / n)]);
  }
  const cellAt = ([x, y]) => [Math.min(w - 1, Math.max(0, Math.round(x))), Math.min(h - 1, Math.max(0, Math.round(y)))];
  const eAt = (p) => { const [x, y] = cellAt(p); return elev[y * w + x]; };

  // 1. Segments of the display line with heading and length.
  const segs = [];
  for (let i = 1; i < pts.length; i++) {
    const dx = (pts[i][0] - pts[i - 1][0]) * cellX, dy = (pts[i][1] - pts[i - 1][1]) * cellY;
    const len = Math.hypot(dx, dy);
    if (len > 0) segs.push({ i0: i - 1, i1: i, len, hd: heading(dx, dy) });
  }
  if (!segs.length) return [];

  // 2. Group segments into legs: cut where the heading has turned more than TURN_DEG since the leg began.
  const groups = [];
  let cur = { segs: [segs[0]] };
  for (const s of segs.slice(1)) {
    const lenSoFar = cur.segs.reduce((t, x) => t + x.len, 0);
    const legHd = meanHeading(cur.segs);
    const turned = Math.abs(turnOf(legHd, s.hd)) > TURN_DEG && lenSoFar >= MIN_LEG_M;
    if (turned || lenSoFar + s.len > MAX_LEG_M) { groups.push(cur); cur = { segs: [s] }; }
    else cur.segs.push(s);
  }
  groups.push(cur);
  // merge a too-short final leg into the previous one
  if (groups.length > 1 && groups.at(-1).segs.reduce((t, x) => t + x.len, 0) < MIN_LEG_M) {
    const last = groups.pop(); groups.at(-1).segs.push(...last.segs);
  }

  // 3. Line distance → budget distance (the budget is measured on the cell path, ≤ 8 % longer).
  const lineLen = segs.reduce((t, x) => t + x.len, 0);
  const oneWay = route.budget?.oneWay ?? lineLen;
  const k = oneWay / (lineLen || 1);
  const tl = route.budget?.timeline || [];
  const at = (d) => interpTimeline(tl, d);
  const stopDs = (route.stops || []).map((s) => ({ ...s }));

  const legs = [];
  let d0 = 0;
  groups.forEach((g, n) => {
    const distLine = g.segs.reduce((t, x) => t + x.len, 0);
    const fromM = d0 * k, toM = (d0 + distLine) * k;
    d0 += distLine;
    // Walk the leg every ~half cell for elevation and steepest fine-scale slope.
    let gain = 0, loss = 0, maxSlope = 0, steepM = 0, eMax = -Infinity;
    let prevE = eAt(pts[g.segs[0].i0]);
    for (const s of g.segs) {
      const A = pts[s.i0], B = pts[s.i1];
      const nStep = Math.max(1, Math.ceil(s.len / (Math.min(cellX, cellY) / 2)));
      for (let j = 1; j <= nStep; j++) {
        const p = [A[0] + (B[0] - A[0]) * (j / nStep), A[1] + (B[1] - A[1]) * (j / nStep)];
        const e = eAt(p);
        const stepLen = s.len / nStep;
        const grade = Math.atan2(Math.abs(e - prevE), stepLen) * 180 / Math.PI;
        if (e > prevE) gain += e - prevE; else loss += prevE - e;
        prevE = e;
        eMax = Math.max(eMax, e);
        const [cx, cy] = cellAt(p);
        const fs = fineSlope ? fineSlope[cy * w + cx] : 0;
        maxSlope = Math.max(maxSlope, fs, grade);
        if (fs > STEEP_DEG) steepM += stepLen;
      }
    }
    const eStart = eAt(pts[g.segs[0].i0]), eEnd = eAt(pts[g.segs.at(-1).i1]);
    const hd = meanHeading(g.segs);
    const next = groups[n + 1];
    const turn = next ? Math.round(turnOf(hd, meanHeading(next.segs))) : 0;
    const t0 = at(fromM), t1 = at(toM);
    const stopAtEnd = stopDs.find((s) => s.d > fromM + 1 && s.d <= toM + 1) || null;
    const leg = {
      n: n + 1, fromM, toM, distM: toM - fromM, heading: Math.round(hd), compass: COMPASS[Math.round(hd / 45) % 8],
      turn, dhM: eEnd - eStart, gainM: gain, lossM: loss, maxSlope,
      avgGradePct: ((eEnd - eStart) / ((toM - fromM) || 1)) * 100,
      tS: t1.t - t0.t, o2Kg: t1.o2 - t0.o2, steepM, steep: maxSlope > STEEP_DEG, climb: eMax - Math.max(eStart, eEnd) > CLIMB_M, riseM: Math.max(0, eMax - Math.max(eStart, eEnd)),
      stopAtEnd: stopAtEnd ? stopAtEnd.id : null,
    };
    leg.text = legText(leg, names, !next);
    legs.push(leg);
  });
  return legs;
}

function meanHeading(segs) {
  let sx = 0, sy = 0;
  for (const s of segs) { sx += Math.sin((s.hd * Math.PI) / 180) * s.len; sy += Math.cos((s.hd * Math.PI) / 180) * s.len; }
  return ((Math.atan2(sx, sy) * 180) / Math.PI + 360) % 360;
}

function interpTimeline(tl, d) {
  if (!tl.length) return { t: 0, o2: 0 };
  if (d <= tl[0].d) return tl[0];
  for (let i = 1; i < tl.length; i++) {
    if (tl[i].d >= d) {
      const a = tl[i - 1], b = tl[i], f = (d - a.d) / ((b.d - a.d) || 1);
      return { t: a.t + (b.t - a.t) * f, o2: a.o2 + (b.o2 - a.o2) * f };
    }
    if (tl[i].d < tl[i - 1].d) break; // timeline continues with the return leg: stop at the turnaround
  }
  return tl.at(-1);
}

function legText(l, names, last) {
  const m = (x) => (x >= 1000 ? `${(x / 1000).toFixed(2)} km` : `${Math.round(x)} m`);
  const min = Math.max(1, Math.round(l.tS / 60));
  const parts = [`Head ${l.compass} for ${m(l.distM)} (~${min} min, ${(l.o2Kg * 1000).toFixed(0)} g O₂).`];
  if (Math.abs(l.dhM) < 5) parts.push('Nearly level.');
  else parts.push(`${l.dhM > 0 ? 'Climb' : 'Descend'} ${Math.round(Math.abs(l.dhM))} m (${Math.abs(l.avgGradePct).toFixed(1)} % average grade).`);
  parts.push(`Steepest ground ${l.maxSlope.toFixed(0)}°${l.steep ? `: steep, ${Math.round(l.steepM)} m above 15°` : ''}.`);
  if (l.climb) parts.push(`Goes over a ${Math.round(l.riseM)} m rise: the planner found this cheaper than going around.`);
  if (l.stopAtEnd) parts.push(`Stop: ${l.stopAtEnd === 'pitstop' ? 'your pit stop' : names[l.stopAtEnd] || l.stopAtEnd}.`);
  if (!last && Math.abs(l.turn) >= 10) parts.push(`Then turn ${l.turn > 0 ? 'right' : 'left'} ${Math.abs(l.turn)}°.`);
  if (last) parts.push('Arrive at the destination.');
  return parts.join(' ');
}
