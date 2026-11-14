// Load a baked region (docs/ARCHITECTURE.md data contract) in Node, for validation scripts and tests.
// Same lon/lat ↔ cell maths as web/lib/region.ts. No dependencies: the slope PNG is decoded with node:zlib.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO = path.resolve(HERE, '..', '..', '..');
export const regionDir = (id = 'gale') => path.join(REPO, 'web', 'public', 'data', id);

/** Decode an 8-bit greyscale, non-interlaced PNG → { width, height, data: Uint8Array }. */
export function decodeGrayPng(buf) {
  const sig = '89504e470d0a1a0a';
  if (buf.subarray(0, 8).toString('hex') !== sig) throw new Error('not a PNG');
  let off = 8, width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      bitDepth = body[8]; colorType = body[9]; interlace = body[12];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    off += 12 + len;
  }
  if (bitDepth !== 8 || colorType !== 0 || interlace !== 0) {
    throw new Error(`unsupported PNG: bitDepth ${bitDepth}, colorType ${colorType}, interlace ${interlace} (need 8-bit grey, non-interlaced)`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const out = new Uint8Array(width * height);
  const stride = width; // 1 byte per pixel
  let prev = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let x = 0; x < stride; x++) {
      const a = x > 0 ? cur[x - 1] : 0, b = prev[x], c = x > 0 ? prev[x - 1] : 0;
      let v = line[x];
      if (f === 1) v += a;
      else if (f === 2) v += b;
      else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      else if (f !== 0) throw new Error(`bad PNG filter ${f} on row ${y}`);
      cur[x] = v & 255;
    }
    out.set(cur, y * width);
    prev = cur;
  }
  return { width, height, data: out };
}

/** lon/lat → grid cell [x, y] (row 0 = north), or null if outside. Same as web/lib/region.ts. */
export function toCell(m, lon, lat) {
  const x = Math.floor(((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * m.width);
  const y = Math.floor(((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * m.height);
  if (x < 0 || y < 0 || x >= m.width || y >= m.height) return null;
  return [x, y];
}

/** grid cell centre → [lon, lat] */
export function toLonLat(m, x, y) {
  return [m.lon[0] + ((x + 0.5) / m.width) * (m.lon[1] - m.lon[0]), m.lat[1] - ((y + 0.5) / m.height) * (m.lat[1] - m.lat[0])];
}

/** lon/lat → local metres (x east, y south) from the region's NW corner, continuous (not snapped to cells). */
export function toMetres(m, lon, lat) {
  return [((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * m.width * m.cellM[0], ((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * m.height * m.cellM[1]];
}

/** Returns null if the region hasn't been baked. */
export function loadRegion(id = 'gale') {
  const dir = regionDir(id);
  if (!fs.existsSync(path.join(dir, 'meta.json'))) return null;
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const pois = JSON.parse(fs.readFileSync(path.join(dir, 'pois.json'), 'utf8'));
  const buf = fs.readFileSync(path.join(dir, 'elev.i16'));
  const elev = Float32Array.from(new Int16Array(buf.buffer, buf.byteOffset, buf.byteLength / 2));
  if (elev.length !== meta.width * meta.height) throw new Error(`elev.i16 has ${elev.length} cells, meta says ${meta.width * meta.height}`);
  const png = decodeGrayPng(fs.readFileSync(path.join(dir, 'slope.png')));
  if (png.width !== meta.width || png.height !== meta.height) throw new Error('slope.png size != grid');
  const scale = meta.slopeScale || 4;
  const fineSlope = Float32Array.from(png.data, (v) => v / scale);
  const tPath = path.join(dir, 'traverse.json');
  let traverse = null;
  if (fs.existsSync(tPath)) {
    const g = JSON.parse(fs.readFileSync(tPath, 'utf8'));
    const geom = g.type === 'FeatureCollection' ? g.features[0].geometry : g.type === 'Feature' ? g.geometry : g;
    traverse = geom.type === 'MultiLineString' ? geom.coordinates.flat() : geom.coordinates;
  }
  const cellOf = (p) => toCell(meta, p.lon, p.lat);
  return {
    meta, elev, fineSlope, pois, traverse, toCell: (lon, lat) => toCell(meta, lon, lat), toLonLat: (x, y) => toLonLat(meta, x, y),
    /** planMission-ready args for base → POI id */
    args(targetId, extra = {}) {
      const t = pois.find((p) => p.id === targetId);
      if (!t) throw new Error(`no POI ${targetId}`);
      return {
        elev, w: meta.width, h: meta.height, cellX: meta.cellM[0], cellY: meta.cellM[1], fineSlope,
        start: toCell(meta, meta.base.lon, meta.base.lat), end: cellOf(t),
        pois: pois.map((p) => ({ id: p.id, x: cellOf(p)[0], y: cellOf(p)[1] })), ...extra,
      };
    },
  };
}
