// Edge bleed (Justin, Sun 15 Nov): the Gale image is colourful but the map around it was pure black, so the
// map looked cut out. This builds a soft halo from the image's own edge colours: each edge is stretched
// outward, blurred, and faded into a background colour taken from the image (a dark Mars brown, not black).
// The halo is tiny (about 100 px wide) and is stretched by the map, which smooths it further. Nothing is
// downloaded: it is made in the browser from the region image that is already loaded.
import type { RegionMeta } from './region';

/** How far the halo reaches past each edge, in region widths / heights. */
export const BLEED = 1;
/** Halo pixels across the region itself (the whole halo is (1 + 2 * BLEED) times this). */
const CELLS = 32;

export type EdgeBleed = {
  /** PNG data URL of the halo, for a MapLibre image source at `bleedCorners()`. */
  url: string;
  /** CSS colour the halo fades into: use it for the map background. */
  background: string;
  /** PNG data URL over the region itself (region corners): halo colour at the edge, see-through inside. */
  rim: string;
};

/** How far the rim reaches into the image, in halo cells (a cell is 1/CELLS of the region width). */
const RIM_CELLS = 2.5;

/** Image-source corners of the halo: the region's box grown by BLEED on every side. */
export function bleedCorners(m: RegionMeta): [[number, number], [number, number], [number, number], [number, number]] {
  const dx = (m.lon[1] - m.lon[0]) * BLEED;
  const dy = (m.lat[1] - m.lat[0]) * BLEED;
  const w = m.lon[0] - dx, e = m.lon[1] + dx, s = m.lat[0] - dy, n = m.lat[1] + dy;
  return [[w, n], [e, n], [e, s], [w, s]];
}

const smooth = (x: number) => {
  const u = Math.max(0, Math.min(1, x));
  return u * u * (3 - 2 * u);
};

export async function makeEdgeBleed(imageUrl: string): Promise<EdgeBleed> {
  const img = new Image();
  img.src = imageUrl;
  await img.decode();

  // 1. the image, small (two steps, so the average colours stay right)
  const sw = CELLS;
  const sh = Math.max(4, Math.round((CELLS * img.naturalHeight) / img.naturalWidth));
  const mid = document.createElement('canvas');
  mid.width = sw * 8;
  mid.height = sh * 8;
  mid.getContext('2d')!.drawImage(img, 0, 0, mid.width, mid.height);
  const small = document.createElement('canvas');
  small.width = sw;
  small.height = sh;
  small.getContext('2d')!.drawImage(mid, 0, 0, sw, sh);

  // 2. the halo canvas: the image in the middle, each edge row / column stretched out to the border
  const bx = sw * BLEED, by = sh * BLEED;
  const W = sw + 2 * bx, H = sh + 2 * by;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  g.drawImage(small, bx, by);
  g.drawImage(small, 0, 0, sw, 1, bx, 0, sw, by); // top
  g.drawImage(small, 0, sh - 1, sw, 1, bx, by + sh, sw, by); // bottom
  g.drawImage(small, 0, 0, 1, sh, 0, by, bx, sh); // left
  g.drawImage(small, sw - 1, 0, 1, sh, bx + sw, by, bx, sh); // right
  g.drawImage(small, 0, 0, 1, 1, 0, 0, bx, by); // corners
  g.drawImage(small, sw - 1, 0, 1, 1, bx + sw, 0, bx, by);
  g.drawImage(small, 0, sh - 1, 1, 1, 0, by + sh, bx, by);
  g.drawImage(small, sw - 1, sh - 1, 1, 1, bx + sw, by + sh, bx, by);

  // 3. blur (a few box passes) so the stretched edges become soft colour, not stripes
  const data = g.getImageData(0, 0, W, H);
  const px = data.data;
  const tmp = new Float32Array(W * H * 3);
  for (let pass = 0; pass < 3; pass++) {
    for (const horizontal of [true, false]) {
      const r = 3;
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          let a = 0, b = 0, d = 0, n = 0;
          for (let k = -r; k <= r; k++) {
            const xx = horizontal ? Math.min(W - 1, Math.max(0, x + k)) : x;
            const yy = horizontal ? y : Math.min(H - 1, Math.max(0, y + k));
            const i = (yy * W + xx) * 4;
            a += px[i];
            b += px[i + 1];
            d += px[i + 2];
            n++;
          }
          const o = (y * W + x) * 3;
          tmp[o] = a / n;
          tmp[o + 1] = b / n;
          tmp[o + 2] = d / n;
        }
      }
      for (let i = 0, o = 0; i < px.length; i += 4, o += 3) {
        px[i] = tmp[o];
        px[i + 1] = tmp[o + 1];
        px[i + 2] = tmp[o + 2];
      }
    }
  }

  // 3b. rim: over the image's own edge, the blurred halo colour fading to see-through a little way in, so
  // the photo has no hard border where it meets the halo
  const rimC = document.createElement('canvas');
  rimC.width = sw;
  rimC.height = sh;
  const rg = rimC.getContext('2d')!;
  const rd = rg.createImageData(sw, sh);
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      const d = Math.min(x, y, sw - 1 - x, sh - 1 - y);
      const i = ((by + y) * W + bx + x) * 4, o = (y * sw + x) * 4;
      for (let k = 0; k < 3; k++) rd.data[o + k] = px[i + k] * 0.85;
      rd.data[o + 3] = Math.round(255 * (1 - smooth(d / RIM_CELLS)));
    }
  }
  rg.putImageData(rd, 0, 0);

  // 4. background = the image's average edge colour, darkened (dark Mars brown instead of black)
  let er = 0, eg = 0, eb = 0, en = 0;
  const sp = small.getContext('2d')!.getImageData(0, 0, sw, sh).data;
  for (let y = 0; y < sh; y++) {
    for (let x = 0; x < sw; x++) {
      if (x > 0 && y > 0 && x < sw - 1 && y < sh - 1) continue;
      const i = (y * sw + x) * 4;
      er += sp[i];
      eg += sp[i + 1];
      eb += sp[i + 2];
      en++;
    }
  }
  const dark = 0.42;
  const bg = [er / en, eg / en, eb / en].map((v) => Math.round(v * dark));

  // 5. darken the halo a little and fade it into the background colour away from the image
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = Math.max(0, bx - x, x - (bx + sw - 1)) / bx;
      const dy = Math.max(0, by - y, y - (by + sh - 1)) / by;
      const f = smooth(Math.hypot(dx, dy) / 0.95); // 0 at the image edge, 1 at the halo border
      const i = (y * W + x) * 4;
      const keep = 1 - f;
      const shade = 0.85 - 0.25 * f; // a touch darker further out
      for (let k = 0; k < 3; k++) px[i + k] = px[i + k] * shade * keep + bg[k] * (1 - keep);
      px[i + 3] = 255;
    }
  }
  g.putImageData(data, 0, 0);
  return { url: c.toDataURL('image/png'), background: `rgb(${bg[0]} ${bg[1]} ${bg[2]})`, rim: rimC.toDataURL('image/png') };
}
