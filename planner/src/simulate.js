// Mission Simulator (T-35): fly each planned route N times under seeded random conditions
// (crew pace, ground, effort, local dust storms, solar particle events) and see what happens.
// Same seed → same conditions on every route ("common random numbers"), so run 7 has the same
// weather for SAFE, FAST and SCIENCE and the comparison is fair.
// Pure ES module, no Node-only imports: runs in the browser Web Worker.
//
// HONESTY: the walking/O2 physics is the same EVA model as the planner (eva.js). The *chances*
// and *sizes* of the random events below are TEAM ASSUMPTIONS, not NASA measurements. They are all
// in SIM_DEFAULTS, each with a `why`, and the UI lists them next to the results.
import { walkSpeed, metabolicW, o2KgPerSec, evaDoseMSv, verdict, EVA_DEFAULTS } from './eva.js';
import { toSamples } from './plan.js';

/** Every knob of the simulator. `value` is used; `why` is shown in the UI. */
export const SIM_ASSUMPTIONS = {
  runs: { value: 20, why: 'Number of simulated EVAs per route' },
  seed: { value: 2026, why: 'Base seed. Run i uses seed + i, so every result can be replayed exactly' },
  paceSd: { value: 0.08, why: 'Crew walking pace varies ±8 % (1 σ) around the model speed. Team assumption' },
  terrainMin: { value: 1.1, why: 'Ground is between packed soil (Pandolf terrain factor 1.1) …' },
  terrainMax: { value: 1.5, why: '… and loose sand (1.5). The planner uses 1.2 (loose regolith)' },
  effortSd: { value: 0.08, why: 'Metabolic effort varies ±8 % (1 σ) between crew and days. Team assumption' },
  dustChanceSeason: { value: 0.20, why: 'Fallback only, when dust.json is missing: chance of a storm during one EVA in dust season (Ls 180–360°). Team assumption' },
  dustChanceOff: { value: 0.05, why: 'Fallback only: same chance outside dust season. Team assumption' },
  dustTauMin: { value: 1.0, why: 'A local storm raises dust optical depth τ to between 1 …' },
  localTauMax: { value: 3.0, why: '… and 3; a regional storm (≥ 1.6 million km², MDAD size class) to between 3 …' },
  dustTauMax: { value: 5.0, why: '… and 5. τ values are a team assumption (MDAD maps storm outlines, not opacity; clear Gale sky is roughly τ 0.5–1)' },
  pushMaxTau: { value: 3.0, why: 'Flight rule (ours) for FAST and SCIENCE: keep walking through a storm if τ ≤ 3, otherwise turn back' },
  safePushMaxTau: { value: 0, why: 'Flight rule (ours, Gianluca) for SAFE: turn back for any dust storm on the way out' },
  dustSlow: { value: 0.8, why: 'In a storm the crew walks at 80 % pace (poor visibility, footing). Team assumption' },
  heavyDustSlow: { value: 0.6, why: 'Above τ 3 on the way home: 60 % pace. Team assumption' },
  speChanceQuiet: { value: 0.02, why: 'Chance of a solar particle event alert during an 8 h window, quiet Sun. Team assumption' },
  speChanceWarn: { value: 0.30, why: 'Same chance when NASA DONKI reports a solar storm toward Mars (live space weather = warn). Team assumption' },
};
export const SIM_DEFAULTS = Object.fromEntries(Object.entries(SIM_ASSUMPTIONS).map(([k, v]) => [k, v.value]));

/** Small, fast, seedable PRNG (mulberry32). Returns floats in [0, 1). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const gauss = (r) => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(2 * Math.PI * r());
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const inDustSeason = (Ls) => Ls != null && ((Ls % 360) + 360) % 360 >= 180;

/**
 * MDAD dust-storm rate over the region for this season (data/dust_gale.py → dust.json).
 * p = share of sols in Mars Years 24–32 with a storm over the region; one EVA ≈ one sol.
 */
export function dustRate(dust, Ls) {
  if (!dust || !Array.isArray(dust.bins) || Ls == null) return null;
  const l = ((Ls % 360) + 360) % 360;
  const b = dust.bins.find((x) => l >= x.ls[0] && l < x.ls[1]);
  return b && b.p != null ? { p: b.p, pRegional: b.pRegional ?? 0, ls: b.ls, sols: b.sols, solsWithStorm: b.solsWithStorm } : null;
}

/**
 * The random conditions for one run. Drawn in a fixed order so they don't depend on the route.
 * @returns {{seed, pace, terrain, effort, dust: null|{tOnS, tau}, spe: null|{tOnS}}}
 */
export function drawConditions(seed, o = {}) {
  const s = { ...SIM_DEFAULTS, ...o };
  const r = rng(seed);
  const pace = clamp(1 + s.paceSd * gauss(r), 0.75, 1.25);
  const terrain = s.terrainMin + (s.terrainMax - s.terrainMin) * r();
  const effort = clamp(1 + s.effortSd * gauss(r), 0.8, 1.25);
  const windowS = (o.evaMaxH ?? EVA_DEFAULTS.evaMaxH) * 3600;
  const rate = dustRate(o.dust, o.Ls);
  const dustP = o.forceDust ? 1 : rate ? rate.p : inDustSeason(o.Ls) ? s.dustChanceSeason : s.dustChanceOff;
  const regionalShare = rate && rate.p > 0 ? rate.pRegional / rate.p : 0.5;
  const u1 = r(), uT = r(), u2 = r(), u3 = r();
  const dustT = uT * windowS;
  const dustHit = u1 < dustP;
  const regional = u3 < regionalShare;
  const tau = regional ? s.localTauMax + (s.dustTauMax - s.localTauMax) * u2 : s.dustTauMin + (s.localTauMax - s.dustTauMin) * u2;
  const speP = o.spaceWeatherLvl === 'warn' ? s.speChanceWarn : s.speChanceQuiet;
  const speHit = r() < speP, speT = r() * windowS;
  return {
    seed, pace, terrain, effort,
    // Stress test: the storm arrives during this route's own EVA (runOnce scales `frac` by its time).
    dust: dustHit ? { tOnS: dustT, frac: uT, forced: !!o.forceDust, tau, kind: regional ? 'regional' : 'local' } : null,
    spe: speHit ? { tOnS: speT } : null,
  };
}

/**
 * Walk one planned route under one set of conditions.
 * @param {object} route   one entry from planMission()
 * @param {object} a       the same args planMission() got (elev, w, cellX, cellY, params, sun, roundTrip)
 * @param {object} c       drawConditions() output
 */
export function runOnce(route, a, c, o = {}) {
  const s = { ...SIM_DEFAULTS, ...o };
  if (c.dust?.forced) c = { ...c, dust: { ...c.dust, tOnS: c.dust.frac * 0.9 * route.budget.totalT } };
  const p0 = { ...EVA_DEFAULTS, ...(a.params || {}) };
  const p = { ...p0, vFlat: p0.vFlat * c.pace, terrain: c.terrain, suitPenalty: p0.suitPenalty * c.effort };
  const out = toSamples(route.path, a.elev, a.w, a.cellX, a.cellY);
  const oneWay = out.at(-1).d;
  const stops = (route.stops || []).map((x) => ({ ...x, done: false }));
  const events = [];
  let t = 0, o2 = 0, slow = 1, turnedBackAtM = null, homeBound = false, gain = 0, loss = 0;

  const step = (a0, b0, factor) => {
    const dd = Math.abs(b0.d - a0.d);
    if (dd <= 0) return;
    const dh = b0.e - a0.e;
    const g = Math.atan2(dh, dd);
    const v = (p.rover ? p.roverMs * c.pace : walkSpeed(g, p)) * factor;
    const dt = dd / v;
    t += dt;
    o2 += o2KgPerSec(p.rover ? p.rideW * c.effort : metabolicW(v, (dh / dd) * 100, p)) * dt;
    if (dh > 0) gain += dh; else loss -= dh;
  };
  // Events trigger the first time the clock passes their onset. Returns true to turn back now.
  const check = (dHere, outbound) => {
    let back = false;
    if (c.dust && !c.dust.seen && t >= c.dust.tOnS) {
      c = { ...c, dust: { ...c.dust, seen: true } };
      const heavy = c.dust.tau > (route.strategy === 'SAFE' ? s.safePushMaxTau : s.pushMaxTau);
      const decision = heavy ? (outbound ? 'turn back' : 'push home slowly') : 'keep going';
      slow = c.dust.tau > s.pushMaxTau ? s.heavyDustSlow : s.dustSlow;
      if (heavy && outbound) back = true;
      events.push({
        type: 'dust', atS: t, atM: dHere, outbound, tau: c.dust.tau, kind: c.dust.kind || 'local', decision,
        effect: `walking at ${Math.round(slow * 100)} % pace from here`,
        damage: [
          'Fine dust on the visor, suit joints and bearings: brush down and inspect seals at the airlock',
          heavy ? 'Visibility low: navigation by the planned line and suit compass only' : 'Visibility reduced but the route stays in sight',
        ],
      });
    }
    if (c.spe && !c.spe.seen && t >= c.spe.tOnS) {
      c = { ...c, spe: { ...c.spe, seen: true } };
      if (outbound) back = true;
      events.push({
        type: 'spe', atS: t, atM: dHere, outbound,
        decision: outbound ? 'turn back to shelter' : 'continue to the airlock',
        effect: 'solar particle event alert: the extra dose from the event itself is not modelled',
        damage: ['Crew dose rises while outside: get under shielding (habitat) as fast as possible'],
      });
    }
    return back;
  };

  // Outbound
  let i = 1;
  for (; i < out.length; i++) {
    step(out[i - 1], out[i], slow);
    for (const st of stops) {
      if (!st.done && st.d <= out[i].d + 1e-6) {
        st.done = true;
        t += p.stopMin * 60;
        o2 += o2KgPerSec(p.stopW * c.effort) * p.stopMin * 60;
      }
    }
    if (check(out[i].d, true)) { turnedBackAtM = out[i].d; homeBound = true; break; }
  }
  const lastOut = Math.min(i, out.length - 1);
  // Return along the same route (a Marswalk ends at the airlock). Always walk home after a turn-back.
  if (a.roundTrip !== false || homeBound) {
    for (let j = lastOut; j > 0; j--) {
      step(out[j], out[j - 1], slow);
      check(out[j - 1].d, false);
    }
  }

  const distance = turnedBackAtM != null ? 2 * turnedBackAtM : (a.roundTrip !== false ? 2 * oneWay : oneWay);
  const reserveKg = p0.o2CapKg * p0.reservePct / 100;
  const remaining = p0.o2CapKg - o2;
  const b = {
    distance, totalT: t, o2, remaining, reserveKg, marginPct: (remaining / p0.o2CapKg) * 100,
    maxSlope: route.budget.maxSlope, gain, loss, doseMSv: evaDoseMSv(t),
  };
  const sun = a.sun ? { endMarginH: a.sun.endMarginH - (t - route.budget.totalT) / 3600 } : null;
  const vp = p0.rover ? { ...p0, maxSlope: p0.roverMaxSlope ?? 20 } : p0;
  const v = verdict(b, sun, vp);
  const stopsDone = stops.filter((x) => x.done).map((x) => x.id);
  const outcome = v.lvl === 'nogo' ? 'unsafe' : turnedBackAtM != null ? 'turned back' : 'completed';
  return {
    seed: c.seed, pace: c.pace, terrain: c.terrain, effort: c.effort,
    events, turnedBackAtM, outcome, lvl: v.lvl, issues: v.issues,
    stopsDone, stopsMissed: stops.filter((x) => !x.done).map((x) => x.id),
    endMarginH: sun ? sun.endMarginH : null, ...b,
  };
}

const median = (xs) => { const s = xs.slice().sort((x, y) => x - y); return s.length ? s[Math.floor((s.length - 1) / 2)] : 0; };
const pct = (xs, q) => { const s = xs.slice().sort((x, y) => x - y); return s.length ? s[Math.round(q * (s.length - 1))] : 0; };

/**
 * Simulate every planned route.
 * @param {object[]} routes  planMission() output
 * @param {object} a         planMission() args
 * @param {object} [o]       SIM_DEFAULTS overrides + { Ls, spaceWeatherLvl, sunByStrategy }
 * @returns {{ routes: Array<{strategy, runs, summary}>, recommended: string|null, conditions: object[], assumptions }}
 */
export function simulateMission(routes, a, o = {}) {
  const s = { ...SIM_DEFAULTS, ...o };
  const p0 = { ...EVA_DEFAULTS, ...(a.params || {}) };
  const conditions = Array.from({ length: s.runs }, (_, i) =>
    drawConditions(s.seed + i, { ...o, evaMaxH: p0.evaMaxH, spaceWeatherLvl: o.spaceWeatherLvl ?? a.spaceWeather?.lvl }));
  const res = routes.map((r) => {
    if (!r.path || !r.budget) return { strategy: r.strategy, runs: [], summary: null };
    // Daylight per route (the web app applies it after planning): o.sunByStrategy = { SAFE: { endMarginH } }.
    const ar = o.sunByStrategy?.[r.strategy] ? { ...a, sun: o.sunByStrategy[r.strategy] } : a;
    const runs = conditions.map((c) => runOnce(r, ar, c, o));
    return { strategy: r.strategy, runs, summary: summarise(runs) };
  });
  // Recommend: most runs completed safely, then the most runs not NO-GO, then the best median O2 margin.
  const ranked = res.filter((x) => x.summary).sort((x, y) =>
    y.summary.completed - x.summary.completed || x.summary.nogo - y.summary.nogo ||
    y.summary.medianMarginPct - x.summary.medianMarginPct);
  return {
    routes: res, recommended: ranked[0]?.strategy ?? null, conditions, assumptions: SIM_ASSUMPTIONS,
    dustRate: dustRate(o.dust, o.Ls), dustSource: o.dust?.source ?? null, forceDust: !!o.forceDust,
  };
}

export function summarise(runs) {
  const n = runs.length;
  const count = (f) => runs.filter(f).length;
  const totals = runs.map((r) => r.totalT);
  const med = median(totals);
  // Typical run = the completed run closest to the median time (falls back to any run).
  const pool = runs.map((r, i) => ({ r, i })).filter(({ r }) => r.outcome === 'completed');
  const pick = (pool.length ? pool : runs.map((r, i) => ({ r, i })))
    .reduce((b, x) => (Math.abs(x.r.totalT - med) < Math.abs(b.r.totalT - med) ? x : b));
  const byScore = runs.map((r, i) => ({ i, k: (r.outcome === 'completed' ? 1000 : r.outcome === 'turned back' ? 0 : -1000) + r.marginPct }));
  byScore.sort((x, y) => y.k - x.k);
  return {
    n,
    completed: count((r) => r.outcome === 'completed'),
    turnedBack: count((r) => r.outcome === 'turned back'),
    unsafe: count((r) => r.outcome === 'unsafe'),
    nogo: count((r) => r.lvl === 'nogo'),
    dustRuns: count((r) => r.events.some((e) => e.type === 'dust')),
    speRuns: count((r) => r.events.some((e) => e.type === 'spe')),
    medianTotalT: med, p10TotalT: pct(totals, 0.1), p90TotalT: pct(totals, 0.9),
    medianMarginPct: median(runs.map((r) => r.marginPct)),
    worstMarginPct: Math.min(...runs.map((r) => r.marginPct)),
    medianDoseMSv: median(runs.map((r) => r.doseMSv)),
    typical: pick.i, best: byScore[0].i, worst: byScore.at(-1).i,
  };
}

const hmin = (s) => { const m = Math.round(s / 60); return m >= 60 ? `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')} min` : `${m} min`; };
const km = (m) => `${(m / 1000).toFixed(1)} km`;

/**
 * Plain-language summary of one run, compared with the typical run of the same route.
 * Every number comes from the run objects. `names` maps POI id → display name.
 */
export function describeRun(run, typical, names = {}) {
  const nm = (id) => names[id] || id;
  const parts = [];
  for (const e of run.events) {
    const where = e.outbound ? `${km(e.atM)} out` : `on the way home, ${km(e.atM)} from base`;
    if (e.type === 'dust') parts.push(`${e.kind === 'regional' ? 'Regional' : 'Local'} dust storm (τ ${e.tau.toFixed(1)}) at ${hmin(e.atS)}, ${where}: ${e.decision}, ${e.effect}.`);
    else parts.push(`Solar particle alert at ${hmin(e.atS)}, ${where}: ${e.decision}.`);
  }
  if (!run.events.length) parts.push('Clear sky, no space-weather alert.');
  parts.push(`Pace ${Math.round(run.pace * 100)} %, ground factor ${run.terrain.toFixed(2)}, effort ${Math.round(run.effort * 100)} %.`);
  if (run.stopsMissed.length) parts.push(`Missed: ${run.stopsMissed.map(nm).join(', ')}.`);
  if (typical && run !== typical) {
    const dt = run.totalT - typical.totalT;
    const dm = run.marginPct - typical.marginPct;
    parts.push(`${hmin(Math.abs(dt))} ${dt >= 0 ? 'longer' : 'shorter'} than the typical run; O₂ left ${run.marginPct.toFixed(0)} % (typical ${typical.marginPct.toFixed(0)} %, ${dm >= 0 ? '+' : ''}${dm.toFixed(0)} pts).`);
  } else {
    parts.push(`${hmin(run.totalT)} outside, ${km(run.distance)}, O₂ left ${run.marginPct.toFixed(0)} %, dose ${run.doseMSv.toFixed(2)} mSv.`);
  }
  for (const i of run.issues) if (i.lvl !== 'go') parts.push(`${i.lvl === 'nogo' ? 'NO-GO' : 'Caution'}: ${i.msg}.`);
  return parts.join(' ');
}

/** Why the recommended route beat the others, from the summaries only. */
export function describeRecommendation(sim) {
  const rec = sim.routes.find((r) => r.strategy === sim.recommended);
  if (!rec) return 'No route could be simulated.';
  const s = rec.summary;
  const others = sim.routes.filter((r) => r.summary && r !== rec)
    .map((r) => `${r.strategy} ${r.summary.completed}/${r.summary.n}`).join(', ');
  return `${rec.strategy} finished safely in ${s.completed} of ${s.n} simulated EVAs` +
    (others ? ` (${others})` : '') +
    `. Typical time ${hmin(s.medianTotalT)} (10–90 %: ${hmin(s.p10TotalT)}–${hmin(s.p90TotalT)}), median O₂ left ${s.medianMarginPct.toFixed(0)} %, worst ${s.worstMarginPct.toFixed(0)} %.` +
    (s.turnedBack ? ` ${s.turnedBack} run(s) turned back (a dust storm or a solar alert on the way out).` : '') +
    (sim.forceDust ? ' Stress test: every run meets a dust storm.'
      : sim.dustRate ? ` At this season (Ls ${sim.dustRate.ls[0]}–${sim.dustRate.ls[1]}°) NASA orbiter maps show a dust storm over this area on ${(sim.dustRate.p * 100).toFixed(1)} % of sols (${sim.dustRate.solsWithStorm} of ${sim.dustRate.sols}, Mars Years 24–32).` : '');
}
