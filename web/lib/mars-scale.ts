// MapLibre assumes the map is Earth (circumference 40,075 km). Our map is Mars (radius 3,396.19 km, the
// sphere the OpenPlanetaryMap tiles and our elevation grid use), so two things need correcting:
//   1. the scale bar (its labels would be ~1.9x too long on Mars), and
//   2. terrain height: MapLibre converts metres to map units with Earth's circumference, so heights
//      would draw ~1.9x too low next to Mars's horizontal distances.
import type { IControl, Map as MLMap } from 'maplibre-gl';

export const MARS_RADIUS_M = 3396190;
const EARTH_CIRCUMFERENCE_M = 40075016.686;
/** Multiply a real vertical exaggeration by this to get MapLibre's `terrain.exaggeration` on Mars. */
export const MARS_TERRAIN_FACTOR = EARTH_CIRCUMFERENCE_M / (2 * Math.PI * MARS_RADIUS_M);

/** Metres per screen pixel at a latitude and zoom (MapLibre's world is 512 px wide at zoom 0). */
export const metersPerPixel = (latDeg: number, zoom: number) =>
  (2 * Math.PI * MARS_RADIUS_M * Math.cos((latDeg * Math.PI) / 180)) / (512 * 2 ** zoom);

/** Drop-in replacement for ScaleControl with Mars distances. */
export class MarsScaleControl implements IControl {
  private el = document.createElement('div');
  private map: MLMap | null = null;
  private readonly update = () => {
    if (!this.map) return;
    const mpp = metersPerPixel(this.map.getCenter().lat, this.map.getZoom());
    const maxM = mpp * 100;
    const pow = 10 ** Math.floor(Math.log10(maxM));
    const d = [5, 2, 1].map((f) => f * pow).find((v) => v <= maxM) ?? pow;
    this.el.style.width = `${Math.round(d / mpp)}px`;
    this.el.textContent = d >= 1000 ? `${d / 1000} km` : `${d} m`;
  };

  onAdd(map: MLMap) {
    this.map = map;
    this.el.className = 'maplibregl-ctrl maplibregl-ctrl-scale';
    map.on('move', this.update);
    this.update();
    return this.el;
  }

  onRemove() {
    this.map?.off('move', this.update);
    this.el.remove();
    this.map = null;
  }
}
