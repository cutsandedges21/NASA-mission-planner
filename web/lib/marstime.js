// Mars clock and sun geometry, plus the Earth–Mars signal delay.
//
// Sources
// - Mars time, solar longitude, equation of time, sun declination: the Mars24 algorithm,
//   Allison & McEwen (2000), Planet. Space Sci. 48: 215–235, step by step as published by NASA GISS:
//   https://www.giss.nasa.gov/tools/mars24/help/algorithm.html (step numbers below refer to that page).
// - Sun elevation / azimuth and sunrise / sunset: standard spherical astronomy (hour angle, latitude, declination).
// - Earth and Mars positions: E. M. Standish, JPL "Keplerian Elements for Approximate Positions of the Major
//   Planets", Table 1 (valid 1800–2050 AD): https://ssd.jpl.nasa.gov/planets/approx_pos.html
// Gale-specific helpers (Curiosity sol, southern seasons) live in mars-context.ts.

const RAD = Math.PI / 180;
const MS_PER_DAY = 86400000;
const JD_UNIX_EPOCH = 2440587.5;
const JD_J2000 = 2451545.0;
/** TT − UTC in seconds: 32.184 s + 37 leap seconds (unchanged since 2017). */
const TT_MINUS_UTC = 69.184;
/** Length of a Mars solar day in SI seconds. */
const SOL_SECONDS = 88775.244147;

const sinDeg = (deg) => Math.sin(deg * RAD);
const wrap = (x, n) => ((x % n) + n) % n;

/** Julian date in Terrestrial Time for a Unix time in ms (Mars24 steps A-2 to A-5). */
const julianTT = (ms) => JD_UNIX_EPOCH + ms / MS_PER_DAY + TT_MINUS_UTC / 86400;

/** Mars24 step B-3: perturbations by Jupiter, Earth and Venus. Rows: amplitude (deg), period τ (Julian years), phase φ (deg). */
const PERTURBATIONS = [
  [0.0071, 2.2353, 49.409],
  [0.0057, 2.7543, 168.173],
  [0.0039, 1.1177, 191.837],
  [0.0037, 15.7866, 21.736],
  [0.0021, 2.1354, 15.704],
  [0.002, 2.4694, 95.528],
  [0.0018, 32.8493, 49.095],
];

/**
 * Mars clock and sun parameters at a moment.
 * @returns {{ms:number, msd:number, mtc:number, Ls:number, eot:number, decl:number, subsolarLonEast:number}}
 *   msd = Mars Sol Date, mtc = Coordinated Mars Time (h), Ls = solar longitude (deg),
 *   eot = equation of time (deg), decl = sun declination (deg)
 */
export function marsTime(ms = Date.now()) {
  const days = julianTT(ms) - JD_J2000; // Δt_J2000 (A-6)

  const meanAnomaly = wrap(19.3871 + 0.52402073 * days, 360);       // B-1
  const fictitiousSun = wrap(270.3871 + 0.524038496 * days, 360);   // B-2
  let pbs = 0;                                                       // B-3
  for (const [amp, tau, phase] of PERTURBATIONS) pbs += amp * Math.cos((0.985626 * days / tau + phase) * RAD);
  const centre =                                                     // B-4: equation of centre (ν − M)
    (10.691 + 3.0e-7 * days) * sinDeg(meanAnomaly)
    + 0.623 * sinDeg(2 * meanAnomaly)
    + 0.05 * sinDeg(3 * meanAnomaly)
    + 0.005 * sinDeg(4 * meanAnomaly)
    + 0.0005 * sinDeg(5 * meanAnomaly)
    + pbs;
  const Ls = wrap(fictitiousSun + centre, 360);                      // B-5

  const eot = 2.861 * sinDeg(2 * Ls) - 0.071 * sinDeg(4 * Ls) + 0.002 * sinDeg(6 * Ls) - centre; // C-1 (deg)
  const msd = (days - 4.5) / 1.0274912517 + 44796.0 - 0.0009626;    // C-2: Mars Sol Date
  const mtc = wrap(24 * msd, 24);                                    //       Coordinated Mars Time (h)
  const decl = Math.asin(0.42565 * sinDeg(Ls)) / RAD + 0.25 * sinDeg(Ls); // D-5 (deg)
  const subsolarLonWest = mtc * 15 + eot + 180;                     // D-1, as a west longitude
  return { ms, msd, mtc, Ls, eot, decl, subsolarLonEast: wrap(-subsolarLonWest, 360) };
}

/** Local mean and true solar time (h) at an east longitude (Mars24 C-3 and C-4). */
export function localTime(mt, lonEast) {
  const lmst = wrap(mt.mtc + lonEast / 15, 24);
  return { lmst, ltst: wrap(lmst + mt.eot / 15, 24) };
}

/** Sun elevation and azimuth (deg; azimuth clockwise from north) at a latitude, local true solar time (h) and declination. */
export function sunPosition(latDeg, ltstHours, declDeg) {
  const hourAngle = (ltstHours - 12) * 15 * RAD;
  const lat = latDeg * RAD;
  const dec = declDeg * RAD;
  const elevation = Math.asin(Math.sin(lat) * Math.sin(dec) + Math.cos(lat) * Math.cos(dec) * Math.cos(hourAngle));
  // Azimuth measured from south (Meeus), then turned to "from north".
  const fromSouth = Math.atan2(Math.sin(hourAngle), Math.cos(hourAngle) * Math.sin(lat) - Math.tan(dec) * Math.cos(lat));
  return { elevation: elevation / RAD, azimuth: wrap(fromSouth / RAD + 180, 360) };
}

/** Sunrise and sunset in local true solar time (h). Polar day → 0–24, polar night → 12–12. */
export function dayLength(latDeg, declDeg) {
  const cosH0 = -Math.tan(latDeg * RAD) * Math.tan(declDeg * RAD);
  if (cosH0 <= -1) return { rise: 0, set: 24 };
  if (cosH0 >= 1) return { rise: 12, set: 12 };
  const halfDayH = Math.acos(cosH0) / RAD / 15;
  return { rise: 12 - halfDayH, set: 12 + halfDayH };
}

/** Hours → "HH:MM" (minutes rounded down). */
export function formatHM(h) {
  const hours = Math.floor(h);
  const minutes = Math.floor((h - hours) * 60);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// --- Earth–Mars signal delay ------------------------------------------------------------------------------------
// Standish Table 1: value at J2000 and rate per Julian century, for
// a (au), e, I (deg), L mean longitude (deg), ϖ longitude of perihelion (deg), Ω longitude of ascending node (deg).
const ORBITS = {
  earth: {
    a: [1.00000261, 0.00000562], e: [0.01671123, -0.00004392], I: [-0.00001531, -0.01294668],
    L: [100.46457166, 35999.37244981], peri: [102.93768193, 0.32327364], node: [0.0, 0.0],
  },
  mars: {
    a: [1.52371034, 0.00001847], e: [0.0933941, 0.00007882], I: [1.84969142, -0.00813131],
    L: [-4.55343205, 19140.30268499], peri: [-23.94362959, 0.44441088], node: [49.55953891, -0.29257343],
  },
};

/** Heliocentric position (au, J2000 ecliptic) T Julian centuries after J2000. */
function heliocentric(orbit, T) {
  const at = ([v0, rate]) => v0 + rate * T;
  const a = at(orbit.a), e = at(orbit.e);
  const incl = at(orbit.I) * RAD, peri = at(orbit.peri), node = at(orbit.node) * RAD;
  const argPeri = peri * RAD - node;
  const M = (wrap(at(orbit.L) - peri + 180, 360) - 180) * RAD;
  // Kepler's equation M = E − e·sin E, by Newton's method
  let E = M + e * Math.sin(M);
  for (let k = 0; k < 8; k++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const x = a * (Math.cos(E) - e);
  const y = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(argPeri), sw = Math.sin(argPeri);
  const cn = Math.cos(node), sn = Math.sin(node);
  const ci = Math.cos(incl), si = Math.sin(incl);
  return [
    (cw * cn - sw * sn * ci) * x - (sw * cn + cw * sn * ci) * y,
    (cw * sn + sw * cn * ci) * x - (sw * sn - cw * cn * ci) * y,
    sw * si * x + cw * si * y,
  ];
}

/** Earth–Mars distance and one-way light time at a moment. */
export function earthMarsLightTime(ms = Date.now()) {
  const T = (julianTT(ms) - JD_J2000) / 36525;
  const [ex, ey, ez] = heliocentric(ORBITS.earth, T);
  const [mx, my, mz] = heliocentric(ORBITS.mars, T);
  const au = Math.hypot(mx - ex, my - ey, mz - ez);
  const km = au * 149597870.7;
  return { au, km, seconds: km / 299792.458 };
}

export { SOL_SECONDS };
