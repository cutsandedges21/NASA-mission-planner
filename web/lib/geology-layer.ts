// Approximate geologic units of lower Mount Sharp, drawn like NASA/JPL PIA26042 (T-34).
// Data: web/public/data/<region>/units.png (soft-edged colour tints on the region corners) and units.json
// (label points, Gediz Vallis Channel line), both built by `python data/geology_gale.py`.
// Usage: addGeology(map, region) once the style has loaded (safe to call again), then setGeologyVisible(map, on).
// Light by design: one 43 KB image + one 24 KB JSON, loaded only when geology is first switched on.
import * as maplibregl from 'maplibre-gl';
type MlMap = maplibregl.Map;
import { corners, type Region } from './region';

const SRC_TINT = 'geology-tint';
const SRC_CHANNEL = 'geology-channel';
export const GEOLOGY_LAYERS = ['geology-tint', 'geology-channel'] as const;

type UnitFeature = {
  properties: { id: string; name: string; color: string; kind: 'unit' | 'channel'; label: [number, number]; labelAngle?: number };
  geometry: GeoJSON.Geometry;
};

// one set of label markers per map
const labels = new WeakMap<MlMap, maplibregl.Marker[]>();
const loading = new WeakMap<MlMap, Promise<void>>();

/** The tint goes under the first of these that exists: under the hillshade, so the relief still shades the colours
 *  (that is what makes PIA26042 look painted onto the terrain); the channel line goes under Curiosity's path and the routes. */
const TINT_UNDER = ['hillshade', 'slope', 'traverse', 'routes-casing', 'routes'];
const LINE_UNDER = ['traverse', 'routes-casing', 'routes'];

/** Keep rotated labels (the ridge's) reading left-to-right whatever the map bearing. */
function uprightAll(map: MlMap) {
  const b = map.getBearing();
  for (const m of labels.get(map) ?? []) {
    const want = Number(m.getElement().dataset.angle ?? 'NaN');
    if (Number.isNaN(want)) continue;
    let screen = ((((want - b) % 360) + 540) % 360) - 180; // angle on screen, -180..180
    if (screen > 90) screen -= 180;
    if (screen < -90) screen += 180;
    m.setRotation(screen + b);
  }
}

/**
 * Add the geology tint, channel line and labels to the map (hidden). Resolves when done.
 * Does nothing if the region has no units files (only Gale has them).
 */
export function addGeology(map: MlMap, region: Region): Promise<void> {
  const busy = loading.get(map);
  if (busy) return busy;
  const p = (async () => {
    const res = await fetch(region.url('units.json')).catch(() => null);
    if (!res?.ok) return;
    const fc: { features: UnitFeature[] } = await res.json();
    if (map.getSource(SRC_TINT)) return;
    const before = TINT_UNDER.find((id) => map.getLayer(id));
    const beforeLine = LINE_UNDER.find((id) => map.getLayer(id));
    map.addSource(SRC_TINT, { type: 'image', url: region.url('units.png'), coordinates: corners(region.meta) });
    map.addLayer(
      { id: 'geology-tint', type: 'raster', source: SRC_TINT, layout: { visibility: 'none' }, paint: { 'raster-opacity': 0.8, 'raster-fade-duration': 0, 'raster-resampling': 'linear' } },
      before,
    );
    const channel = fc.features.filter((f) => f.properties.kind === 'channel');
    map.addSource(SRC_CHANNEL, { type: 'geojson', data: { type: 'FeatureCollection', features: channel.map((f) => ({ type: 'Feature', properties: {}, geometry: f.geometry })) } });
    map.addLayer(
      {
        id: 'geology-channel', type: 'line', source: SRC_CHANNEL, layout: { visibility: 'none', 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': '#ffffff', 'line-width': 1.4, 'line-opacity': 0.85, 'line-dasharray': [2, 2.5] },
      },
      beforeLine,
    );
    // labels: white italic like PIA26042; upright to the camera so they stay readable in a steep 3D view
    labels.set(
      map,
      fc.features.map((f) => {
        const el = document.createElement('div');
        el.className = 'geo-label';
        el.textContent = f.properties.name;
        // inline so the module carries its own look (the app's CSS files belong to the UI chat)
        Object.assign(el.style, {
          display: 'none', pointerEvents: 'none', whiteSpace: 'nowrap', fontStyle: 'italic', fontWeight: '600',
          fontSize: f.properties.kind === 'channel' ? '13px' : '17px', letterSpacing: '0.01em', color: '#fff',
          textShadow: '0 1px 3px rgba(0,0,0,.85), 0 0 10px rgba(0,0,0,.45)',
        });
        if (f.properties.labelAngle !== undefined) el.dataset.angle = String(f.properties.labelAngle);
        // a label with a direction (the ridge) turns with the map and is kept upright; the others always face the screen
        const along = f.properties.labelAngle !== undefined;
        return new maplibregl.Marker({ element: el, rotationAlignment: along ? 'map' : 'viewport', pitchAlignment: 'viewport', rotation: f.properties.labelAngle ?? 0 })
          .setLngLat(f.properties.label)
          .addTo(map);
      }),
    );
    uprightAll(map);
    map.on('rotate', () => uprightAll(map));
  })();
  loading.set(map, p);
  return p;
}

/** Show or hide the geology view. Loads the data on first use if `region` is given. */
export async function setGeologyVisible(map: MlMap, on: boolean, region?: Region) {
  if (on && region && !map.getSource(SRC_TINT)) await addGeology(map, region);
  for (const id of GEOLOGY_LAYERS) if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
  for (const m of labels.get(map) ?? []) m.getElement().style.display = on ? '' : 'none';
}

/** Legend rows for the toggle / credits (colours match units.png). */
export const GEOLOGY_LEGEND = [
  { id: 'sulfate', name: 'Sulfate-bearing unit', color: '#d9a82e' },
  { id: 'clay', name: 'Clay-bearing unit', color: '#3fa34d' },
  { id: 'pediment', name: 'Greenheugh Pediment', color: '#2bb3b1' },
  { id: 'ridge', name: 'Gediz Vallis Ridge', color: '#d2453b' },
] as const;

export const GEOLOGY_NOTE = 'Approximate outlines after NASA/JPL PIA26042, derived from NASA terrain data. Not an official geologic map.';
