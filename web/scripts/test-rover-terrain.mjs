// Run from web/:  node scripts/test-rover-terrain.mjs
// Checks the first-person heightfield on the real Gale grid: padding, exact vertex heights, and that the
// triangle interpolation matches how the mesh is split (a,c,b + b,c,d).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { HeightField } from '../lib/rover-terrain.ts';

const dir = new URL('../public/data/gale/', import.meta.url);
const meta = JSON.parse(fs.readFileSync(new URL('meta.json', dir), 'utf8'));
const buf = fs.readFileSync(new URL('elev.i16', dir));
const elev = Float32Array.from(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
const [cx, cy] = meta.cellM;
const f = new HeightField(elev, meta.width, meta.height, cx, cy, 60);

assert.equal(f.w2, meta.width + 120);
assert.equal(f.h2, meta.height + 120);
let lowest = Infinity;
for (let k = 0; k < elev.length; k++) if (elev[k] < lowest) lowest = elev[k];
assert.equal(f.base, lowest);
assert.ok(f.maxH > 1500 && f.maxH < 2000, `relief ${f.maxH} m looks wrong`);

// exact at vertices, inside the region
for (const [i, j] of [[0, 0], [100, 200], [meta.width - 1, meta.height - 1], [236, 296]]) {
  const h = f.heightAt((i + 0.5) * cx, (j + 0.5) * cy);
  assert.ok(Math.abs(h - (elev[j * meta.width + i] - f.base)) < 1e-3, `vertex ${i},${j}`);
}
// padding continues the edge: far outside the north-west corner equals the corner cell
assert.ok(Math.abs(f.heightAt(-1500, -1500) - (elev[0] - f.base)) < 1e-3, 'north-west pad');
assert.ok(Math.abs(f.heightAt(1e6, 1e6) - (elev[elev.length - 1] - f.base)) < 1e-3, 'south-east pad');

// triangle split: sample a quad on both sides of the b–c diagonal and compare with the barycentric formula
const i = 150, j = 310;
const H = (ii, jj) => elev[jj * meta.width + ii] - f.base;
const a = H(i, j), b = H(i + 1, j), c = H(i, j + 1), d = H(i + 1, j + 1);
for (const [u, v] of [[0.2, 0.3], [0.45, 0.5], [0.8, 0.6], [0.9, 0.9], [0.1, 0.05]]) {
  const want = u + v <= 1 ? a + u * (b - a) + v * (c - a) : d + (1 - u) * (c - d) + (1 - v) * (b - d);
  const got = f.heightAt((i + 0.5 + u) * cx, (j + 0.5 + v) * cy);
  assert.ok(Math.abs(got - want) < 1e-3, `triangle interpolation at u=${u} v=${v}: ${got} vs ${want}`);
}
// continuity across the diagonal
const eps = 1e-4;
const onDiagA = f.heightAt((i + 0.5 + 0.5 - eps) * cx, (j + 0.5 + 0.5 - eps) * cy);
const onDiagB = f.heightAt((i + 0.5 + 0.5 + eps) * cx, (j + 0.5 + 0.5 + eps) * cy);
assert.ok(Math.abs(onDiagA - onDiagB) < 0.01, 'continuous across the diagonal');

// slope helper: a known uphill direction has positive slope (Bradbury Landing → Mount Sharp is uphill to the south)
const bx = ((meta.base.lon - meta.lon[0]) / (meta.lon[1] - meta.lon[0])) * meta.width * cx;
const bz = ((meta.lat[1] - meta.base.lat) / (meta.lat[1] - meta.lat[0])) * meta.height * cy;
const hb = f.heightAt(bx, bz);
assert.ok(hb > 0 && hb < 400, `Bradbury Landing is on the low plains (${hb.toFixed(0)} m above the lowest point)`);
const up = f.slopeAlong(bx, bz + 4000, 0, 1);
console.log(`relief ${f.maxH.toFixed(0)} m, Bradbury ${hb.toFixed(0)} m above the low point, slope heading south at +4 km: ${((up * 180) / Math.PI).toFixed(1)}°`);
console.log('OK');
