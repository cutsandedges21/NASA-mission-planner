// The 2D / 3D map is locked to the planning region (Moss, Sat 14 Nov): you zoom out only until the whole region
// fits between the side panels, and pan only until the region's edge reaches a panel. The rest of Mars (the global
// NASA Trek tiles) is shown only on the Globe, so nothing outside Gale downloads while you plan.
// (MapLibre's maxBounds would also lock the view, but it forbids zooming out past the bounds and crashed in
// calcMatrices on 6.18, so this uses the map's transformConstrain hook instead.)
import * as maplibregl from 'maplibre-gl';
import type { Map as MLMap, LngLat } from 'maplibre-gl';
import type { RegionMeta } from './region';

const TILE = 512; // MapLibre world size at zoom 0, px
const MARGIN = 16;

/** Screen areas the UI covers (px). The region may slide under them, never further. */
export function uiSlack(width: number) {
  return width >= 768 ? { left: 380, right: 360, top: 72, bottom: 0 } : { left: 0, right: 0, top: 64, bottom: 0 };
}

function box(m: RegionMeta) {
  const nw = maplibregl.MercatorCoordinate.fromLngLat([m.lon[0], m.lat[1]]);
  const se = maplibregl.MercatorCoordinate.fromLngLat([m.lon[1], m.lat[0]]);
  return { x0: nw.x, x1: se.x, y0: nw.y, y1: se.y };
}

/** Lowest zoom: the whole region fits in the free space between the panels. */
export function regionMinZoom(m: RegionMeta, mp: MLMap): number {
  const c = mp.getContainer();
  const s = uiSlack(c.clientWidth);
  const b = box(m);
  const w = Math.max(120, c.clientWidth - s.left - s.right - 2 * MARGIN);
  const h = Math.max(120, c.clientHeight - s.top - s.bottom - 2 * MARGIN);
  return Math.log2(Math.min(w / ((b.x1 - b.x0) * TILE), h / ((b.y1 - b.y0) * TILE)));
}

/** The whole region framed between the panels (the "home" view of 2D). */
export function regionHome(m: RegionMeta, mp: MLMap): { center: [number, number]; zoom: number } {
  const c = mp.getContainer();
  const s = uiSlack(c.clientWidth);
  const zoom = regionMinZoom(m, mp);
  const b = box(m);
  const world = TILE * 2 ** zoom;
  // shift the centre so the region sits in the middle of the free space, not under a panel
  const dx = (s.left - s.right) / 2 / world, dy = (s.top - s.bottom) / 2 / world;
  const ll = new maplibregl.MercatorCoordinate((b.x0 + b.x1) / 2 - dx, (b.y0 + b.y1) / 2 - dy).toLngLat();
  return { center: [ll.lng, ll.lat], zoom };
}

/**
 * Keeps the camera on the region. Per axis: when the region is bigger than the screen, the screen stays inside
 * the region (plus the strips the panels cover); when it's smaller, the region stays fully on screen.
 */
export function regionConstrain(m: RegionMeta, mp: MLMap) {
  const b = box(m);
  return (lngLat: LngLat, zoom: number): { center: LngLat; zoom: number } => {
    const c = mp.getContainer();
    const s = uiSlack(c.clientWidth);
    const z = Math.min(mp.getMaxZoom(), Math.max(mp.getMinZoom(), zoom));
    const world = TILE * 2 ** z;
    const p = maplibregl.MercatorCoordinate.fromLngLat(lngLat);
    const axis = (v: number, a: number, bb: number, view: number, lo: number, hi: number) => {
      const half = view / 2 / world;
      const min = a - lo / world + half, max = bb + hi / world - half;
      return Math.min(Math.max(min, max), Math.max(Math.min(min, max), v));
    };
    const x = axis(p.x, b.x0, b.x1, c.clientWidth, s.left, s.right);
    const y = axis(p.y, b.y0, b.y1, c.clientHeight, s.top, s.bottom);
    return { center: new maplibregl.MercatorCoordinate(x, y).toLngLat(), zoom: z };
  };
}

/** Turn the region lock on (2D / 3D) or off (Globe). */
export function lockToRegion(mp: MLMap, m: RegionMeta, on: boolean) {
  if (on) {
    mp.setMinZoom(regionMinZoom(m, mp));
    mp.setTransformConstrain(regionConstrain(m, mp));
  } else {
    mp.setTransformConstrain(null);
    mp.setMinZoom(0);
  }
}
