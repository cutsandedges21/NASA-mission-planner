// EVA model for a suited astronaut on foot (or riding a rover) on Mars: walking speed, metabolic
// power, O₂ use per route, and the GO / CAUTION / NO-GO verdict.
// Pure ES module, no Node-only imports: runs in a browser Web Worker.
//
// Sources
// - Walking speed vs slope: Tobler's hiking function (Tobler 1993), v ∝ e^(−3.5·|s + 0.05|) with s = rise/run,
//   normalised so flat ground gives `vFlat`.
// - Metabolic power: Pandolf, Givoni & Goldman (1977), J. Appl. Physiol. 43: 577–581,
//     M = 1.5·W + 2.0·(W + L)·(L/W)² + η·(W + L)·(1.5·V² + 0.35·V·G)
//   W = body mass, L = carried load, η = terrain factor, V = speed (m/s), G = grade (%).
//   The load and locomotion terms scale with Mars gravity and a pressure-suit factor. Downhill steps
//   cost a fraction of the equivalent uphill grade (braking), not zero.
// - O₂: about 20.1 kJ of metabolic energy per litre of O₂, and 1 L of O₂ weighs 1.429 g.
// Every number below is an editable assumption, surfaced in the planner UI and the README.

export const EVA_DEFAULTS = {
  crewKg: 75,          // astronaut body mass
  suitKg: 58,          // suit + life-support backpack + tools
  kitKg: 0,            // science kit carried on top (drill, sample bags, cameras)
  terrain: 1.2,        // Pandolf terrain factor (1.0 road … 1.2 loose regolith … 1.5+ sand)
  suitPenalty: 1.35,   // pressurised-suit locomotion penalty
  gRatio: 3.71 / 9.81, // Mars surface gravity / Earth
  vFlat: 0.9,          // m/s on flat ground
  o2CapKg: 0.60,       // usable O2 in the suit (≈ 8 h at a nominal 0.075 kg/h)
  reservePct: 25,      // O2 that must remain at the end of the EVA
  maxSlope: 20,        // deg: hard limit for walking on foot
  stopMin: 20,         // minutes spent at each science stop
  stopW: 190,          // metabolic rate while working at a stop (W)
  evaMaxH: 8,          // suit consumables / crew-fatigue rating
  rover: false,        // drive between stops on an unpressurised rover (Apollo LRV style)
  roverMs: 1.4,        // m/s driving over rough ground (5 km/h; the Apollo LRV averaged a little more)
  rideW: 150,          // metabolic rate seated on the rover in a suit (W): between rest and light work
  roverMaxSlope: 20,   // deg: hard limit for driving the unpressurised rover (rover assist mode)
};

const DEG_TO_RAD = Math.PI / 180;

// Tobler's hiking function
const TOBLER_DECAY = 3.5;
const TOBLER_PEAK_SLOPE = 0.05;        // speed peaks on a gentle 5 % downhill
const TOBLER_FLAT = Math.exp(-TOBLER_DECAY * TOBLER_PEAK_SLOPE);
const SLOWEST_WALK_MS = 0.12;          // floor, so a very steep step still has a finite time

// Pandolf
const DOWNHILL_GRADE_FACTOR = 0.3;     // a downhill grade costs 30 % of the same uphill grade (braking)

// Oxygen
const JOULES_PER_LITRE_O2 = 20100;
const KG_PER_LITRE_O2 = 1.429e-3;

/** Walking speed (m/s) on ground inclined at `gradeRad` (positive = uphill). */
export function walkSpeed(gradeRad, p = EVA_DEFAULTS) {
  const rise = Math.tan(gradeRad);
  const speed = p.vFlat * Math.exp(-TOBLER_DECAY * Math.abs(rise + TOBLER_PEAK_SLOPE)) / TOBLER_FLAT;
  return speed < SLOWEST_WALK_MS ? SLOWEST_WALK_MS : speed;
}

/** Metabolic power (W) walking at `v` m/s on a `gradePct` % grade. */
export function metabolicW(v, gradePct, p = EVA_DEFAULTS) {
  const body = p.crewKg;
  const load = p.suitKg + (p.kitKg || 0);
  const mass = body + load;
  const effGrade = gradePct >= 0 ? gradePct : -gradePct * DOWNHILL_GRADE_FACTOR;
  const standing = 1.5 * body;
  const carrying = 2.0 * mass * (load / body) ** 2;
  const moving = p.terrain * mass * (1.5 * v * v + 0.35 * v * effGrade);
  return standing + (carrying + moving) * p.gRatio * p.suitPenalty;
}

/** O₂ consumed (kg/s) at a metabolic power of `watts`. */
export const o2KgPerSec = (watts) => (watts / JOULES_PER_LITRE_O2) * KG_PER_LITRE_O2;

/** Metabolic energy (J) to walk one step of `distM` horizontal metres and `dhM` climb. A* minimises this to save O₂. */
export function stepCost(distM, dhM, p = EVA_DEFAULTS) {
  const v = walkSpeed(Math.atan2(dhM, distM), p);
  return metabolicW(v, (dhM / distM) * 100, p) * (distM / v);
}

/** Speed (m/s) and metabolic power (W) for one leg, on foot or seated on the rover. */
function legRates(dist, dh, p) {
  if (p.rover) return { v: p.roverMs, watts: p.rideW };
  const v = walkSpeed(Math.atan2(dh, dist), p);
  return { v, watts: metabolicW(v, (dh / dist) * 100, p) };
}

/**
 * Time, O₂ and terrain totals for a route.
 * @param {Array<{d:number, e:number}>} samples  dense profile: cumulative distance (m) and elevation (m)
 * @param {number[]} stopAt  cumulative distances of the science stops
 */
export function budget(samples, stopAt, p = EVA_DEFAULTS) {
  let time = 0, o2 = 0, gain = 0, loss = 0, steepestDeg = 0;
  const timeline = [{ d: 0, t: 0, o2: 0 }];
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1], to = samples[i];
    const dist = to.d - from.d;
    if (dist <= 0) continue; // duplicate point
    const dh = to.e - from.e;
    const { v, watts } = legRates(dist, dh, p);
    const dt = dist / v;
    time += dt;
    o2 += o2KgPerSec(watts) * dt;
    if (dh > 0) gain += dh; else loss -= dh;
    const deg = Math.abs(Math.atan2(dh, dist)) / DEG_TO_RAD;
    if (deg > steepestDeg) steepestDeg = deg;
    timeline.push({ d: to.d, t: time, o2 });
  }
  const walkT = time;
  const stopT = stopAt.length * p.stopMin * 60;
  time += stopT;
  o2 += stopAt.length * o2KgPerSec(p.stopW) * p.stopMin * 60;
  const reserveKg = (p.o2CapKg * p.reservePct) / 100;
  const remaining = p.o2CapKg - o2;
  return {
    distance: samples.at(-1)?.d || 0,
    walkT,
    stopT,
    totalT: time,
    o2,
    remaining,
    marginPct: (remaining / p.o2CapKg) * 100,
    reserveKg,
    gain,
    loss,
    maxSlope: steepestDeg,
    timeline,
    avgW: o2 / time / o2KgPerSec(1),
  };
}

/**
 * Safety verdict for a budgeted route. `sun.endMarginH` = hours of daylight left when the EVA ends.
 * Slope messages keep the "(limit N°)" wording: plan.js rewrites it to "(rover limit N°)" in rover mode.
 */
export function verdict(b, sun, p = EVA_DEFAULTS) {
  const issues = [];
  const nogo = (msg) => issues.push({ lvl: 'nogo', msg });
  const caution = (msg) => issues.push({ lvl: 'caution', msg });

  if (b.remaining < b.reserveKg) {
    nogo(`Not enough O₂: back at the airlock with ${Math.max(0, b.remaining).toFixed(3)} kg, but the reserve is ${b.reserveKg.toFixed(3)} kg`);
  } else if (b.marginPct < p.reservePct + 15) {
    caution(`Low O₂ margin: ${b.marginPct.toFixed(0)} % left on return`);
  }

  const hours = b.totalT / 3600;
  if (hours > p.evaMaxH) nogo(`${hours.toFixed(1)} h outside is longer than the ${p.evaMaxH} h suit limit`);

  if (b.maxSlope > p.maxSlope) nogo(`Crosses ${b.maxSlope.toFixed(0)}° slopes (limit ${p.maxSlope}°)`);
  else if (b.maxSlope > p.maxSlope * 0.75) caution(`Steep stretches up to ${b.maxSlope.toFixed(0)}°`);

  if (sun && sun.endMarginH < 0) nogo('Gets back after sunset');
  else if (sun && sun.endMarginH < 0.75) caution('Under 45 min of daylight to spare');

  const lvl = issues.some((i) => i.lvl === 'nogo') ? 'nogo' : issues.length ? 'caution' : 'go';
  return { lvl, issues };
}
