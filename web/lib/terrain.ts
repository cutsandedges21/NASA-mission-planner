// Turns the region's elevation grid into terrarium-encoded DEM tiles on the fly (custom `elev://` protocol),
// so MapLibre can drape the map in 3D and draw hillshade without a tile server.
import * as maplibregl from 'maplibre-gl';
import type { Region } from './region';

const SIZE = 256;
const FADE_DEG = 0.03; // ~1.8 km: for the 3D terrain only, relief fades down to the region's lowest point outside the bounds

let registered = false;
let current: Region | null = null;

function sample(r: Region, lon: number, lat: number, fade: boolean): number {
  const m = r.meta;
  const fx = ((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * m.width - 0.5;
  const fy = ((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * m.height - 0.5;
  const cx = Math.min(m.width - 1, Math.max(0, fx));
  const cy = Math.min(m.height - 1, Math.max(0, fy));
  const x0 = Math.floor(cx), y0 = Math.floor(cy);
  const x1 = Math.min(m.width - 1, x0 + 1), y1 = Math.min(m.height - 1, y0 + 1);
  const tx = cx - x0, ty = cy - y0, w = m.width, e = r.elev;
  const v =
    e[y0 * w + x0] * (1 - tx) * (1 - ty) + e[y0 * w + x1] * tx * (1 - ty) +
    e[y1 * w + x0] * (1 - tx) * ty + e[y1 * w + x1] * tx * ty;
  const rel = v - m.elevRange[0];
  // distance outside the bounds (degrees), for the fade
  const dLon = Math.max(m.lon[0] - lon, 0, lon - m.lon[1]);
  const dLat = Math.max(m.lat[0] - lat, 0, lat - m.lat[1]);
  const out = Math.hypot(dLon, dLat);
  // hillshade (fade = false) keeps the edge height flat outside, so no fake cliff is shaded dark
  return fade && out > 0 ? rel * Math.max(0, 1 - out / FADE_DEG) : rel;
}

async function tile(z: number, x: number, y: number, fade: boolean): Promise<ArrayBuffer> {
  const canvas = new OffscreenCanvas(SIZE, SIZE);
  const ctx = canvas.getContext('2d')!;
  const img = ctx.createImageData(SIZE, SIZE);
  const n = 2 ** z;
  for (let py = 0; py < SIZE; py++) {
    const lat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + (py + 0.5) / SIZE)) / n))) * 180) / Math.PI;
    for (let px = 0; px < SIZE; px++) {
      const lon = ((x + (px + 0.5) / SIZE) / n) * 360 - 180;
      const v = (current ? sample(current, lon, lat, fade) : 0) + 32768;
      const i = (py * SIZE + px) * 4;
      img.data[i] = Math.floor(v / 256);
      img.data[i + 1] = Math.floor(v) % 256;
      img.data[i + 2] = Math.floor((v - Math.floor(v)) * 256);
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const blob = await canvas.convertToBlob({ type: 'image/png' });
  return blob.arrayBuffer();
}

/** Register the elev:// protocol for this region. Hosts: elev://dem/… (3D terrain, edges fade out) and elev://hs/… (hillshade, no fade). */
export function registerRegionTerrain(region: Region) {
  current = region;
  if (registered) return;
  registered = true;
  maplibregl.addProtocol('elev', async (params: maplibregl.RequestParameters) => {
    const m = /elev:\/\/[^/]+\/(\d+)\/(\d+)\/(\d+)/.exec(params.url);
    if (!m) throw new Error(`bad elev url ${params.url}`);
    return { data: await tile(+m[2], +m[3], +m[4], m[1] === 'dem') };
  });
}
