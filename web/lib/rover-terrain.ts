// Heightfield for the first-person rover view.
// The region's elevation grid, padded outwards by clamping to the nearest edge cell so the world doesn't end
// at the region's border, with height lookups that match the rendered triangles exactly (so the camera never
// sinks into the ground). Frame: x = metres east, z = metres SOUTH of the region's north-west corner, y = up.
// Pure functions, no DOM or three.js: tested in Node (web/scripts/test-rover-terrain.mjs).
// (No TypeScript parameter properties: Node's type stripping can't run those.)

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

export class HeightField {
  readonly w: number;
  readonly h: number;
  readonly cellX: number;
  readonly cellY: number;
  readonly pad: number;
  readonly w2: number;
  readonly h2: number;
  /** Lowest elevation in the region (m): subtracted so y is metres above the lowest point. */
  readonly base: number;
  /** Highest point above `base` (m). */
  readonly maxH: number;
  /** Padded grid, row-major (row * w2 + column), metres above `base`. */
  readonly heights: Float32Array;

  constructor(elev: Float32Array, w: number, h: number, cellX: number, cellY: number, pad = 60) {
    this.w = w;
    this.h = h;
    this.cellX = cellX;
    this.cellY = cellY;
    this.pad = pad;
    this.w2 = w + 2 * pad;
    this.h2 = h + 2 * pad;
    let lo = Infinity;
    let hi = -Infinity;
    for (let i = 0; i < elev.length; i++) {
      if (elev[i] < lo) lo = elev[i];
      if (elev[i] > hi) hi = elev[i];
    }
    this.base = lo;
    this.maxH = hi - lo;
    this.heights = new Float32Array(this.w2 * this.h2);
    for (let j = 0; j < this.h2; j++) {
      const sj = clamp(j - pad, 0, h - 1);
      for (let i = 0; i < this.w2; i++) {
        const si = clamp(i - pad, 0, w - 1);
        this.heights[j * this.w2 + i] = elev[sj * w + si] - lo;
      }
    }
  }

  /** East (m) of padded column i. */
  x(i: number): number {
    return (i - this.pad + 0.5) * this.cellX;
  }

  /** South (m) of padded row j. */
  z(j: number): number {
    return (j - this.pad + 0.5) * this.cellY;
  }

  /**
   * Terrain height (m above `base`) at (x, z): exact on the mesh, whose quads are split along the
   * b–c diagonal (a = (i, j), b = (i+1, j), c = (i, j+1), d = (i+1, j+1); triangles a,c,b and b,c,d).
   */
  heightAt(x: number, z: number): number {
    const fi = clamp(x / this.cellX - 0.5 + this.pad, 0, this.w2 - 1.000001);
    const fj = clamp(z / this.cellY - 0.5 + this.pad, 0, this.h2 - 1.000001);
    const i = Math.floor(fi);
    const j = Math.floor(fj);
    const u = fi - i;
    const v = fj - j;
    const a = this.heights[j * this.w2 + i];
    const b = this.heights[j * this.w2 + i + 1];
    const c = this.heights[(j + 1) * this.w2 + i];
    const d = this.heights[(j + 1) * this.w2 + i + 1];
    if (u + v <= 1) return a + u * (b - a) + v * (c - a);
    return d + (1 - u) * (c - d) + (1 - v) * (b - d);
  }

  /** Slope of the ground (radians) along the direction (dx, dz), measured over `span` metres centred on (x, z). */
  slopeAlong(x: number, z: number, dx: number, dz: number, span = 20): number {
    const len = Math.hypot(dx, dz) || 1;
    const ux = (dx / len) * (span / 2);
    const uz = (dz / len) * (span / 2);
    return Math.atan2(this.heightAt(x + ux, z + uz) - this.heightAt(x - ux, z - uz), span);
  }
}
