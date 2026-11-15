'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { corners, loadRegion, toCell, toLonLat, type Poi, type Region } from '@/lib/region';
import { plan, type PlannedRoute, type Strategy } from '@/lib/plan-client';
import { registerRegionTerrain } from '@/lib/terrain';
import { registerTrek, trekSource, falseColourUrl, elevationColourUrl, type MapType } from '@/lib/trek';
import HoverReadout from './map/HoverReadout';
import { MARS_TERRAIN_FACTOR } from '@/lib/mars-scale';
import { hm, marsClock, routeDaylight, verdictWithDaylight, type Daylight } from '@/lib/mars-context';
import type { BriefingRequest } from '@/lib/briefing';
import { pickRecommended } from '@/lib/briefing';
import Hero, { type Target } from './Hero';
import { useBookmarks } from '@/lib/bookmarks';
import Loading from './Loading';
import TopNav, { type NavTab } from './map/TopNav';
import SetupPanel from './map/SetupPanel';
import RouteCards from './map/RouteCards';
import DockCard from './map/DockCard';
import Credits from './map/Credits';
import { useSimulation } from './Simulation';
import ScenarioPanel from './ScenarioPanel';
import { ROUTE_STYLE } from './map/format';
import { setGeologyVisible } from '@/lib/geology-layer';
import { lockToRegion, regionHome } from '@/lib/region-view';
import { bleedCorners, makeEdgeBleed, type EdgeBleed } from '@/lib/edge-bleed';


export { ROUTE_STYLE };

/** 3D relief is drawn 1.5x taller than true scale so slopes read clearly. (MapLibre assumes Earth, see mars-scale.ts.) */
const VERTICAL_EXAGGERATION = 1.5;
/** 3D camera angle. */
const PITCH_3D = 62, BEARING_3D = -25;

/** What the next map click does: set the destination, move the base, or fill in a new bookmark. */
type Placing = 'dest' | 'base' | 'bookmark' | 'pitstop';

/** Routes shown in the app (Gianluca, Sat 14 Nov: SCIENCE removed from the UI; the planner still computes it). */
const SHOWN: Strategy[] = ['SAFE', 'FAST'];

export default function MissionPlanner() {
  const mapEl = useRef<HTMLDivElement>(null);
  const map = useRef<MLMap | null>(null);
  const markers = useRef<{ base?: maplibregl.Marker; dest?: maplibregl.Marker }>({});
  const [region, setRegion] = useState<Region | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [base, setBase] = useState<[number, number] | null>(null);
  const [dest, setDest] = useState<[number, number] | null>(null);
  const [destName, setDestName] = useState<string | null>(null);
  const [routes, setRoutes] = useState<PlannedRoute[] | null>(null);
  const [selected, setSelected] = useState<Strategy>('SAFE');
  const [bookmarkAt, setBookmarkAt] = useState<[number, number] | null>(null); // a map click picked for a new bookmark
  const bookmarks = useBookmarks();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view3d, setView3d] = useState(false);
  const [placing, setPlacing] = useState<Placing>('dest');
  // pit stops between Point 1 and Point 2 (T-35): lng/lat, as many as you like; every route visits them in the
  // order they were added, on the way out (Justin, Sun 15 Nov). Added from Quick targets in the EVA Planner.
  const [pitStops, setPitStops] = useState<[number, number][]>([]);
  // map type (T-33): colour / height / thermal / slope. Slope keeps the colour base + the slope overlay.
  const [mapType, setMapType] = useState<MapType>('colour');
  const showSlope = mapType === 'slope';
  const setShowSlope = useCallback((v: boolean) => setMapType(v ? 'slope' : 'colour'), []);
  const [globe, setGlobe] = useState(false);
  // 2D / 3D is locked to the region; only the Globe shows (and downloads) the rest of Mars. See lib/region-view.ts.
  const globeRef = useRef(false);
  const globeFly = useRef<[number, number] | null>(null); // a place outside the region to fly to once the globe is on
  const [mapInst, setMapInst] = useState<MLMap | null>(null); // for children that listen to the map (HoverReadout)
  const [geology] = useState(false); // T-34: approximate rock units after NASA/JPL PIA26042
  const [rover, setRover] = useState(false); // rover assist: plan with an unpressurised rover (planner params.rover)
  const [kitKg, setKitKg] = useState(0); // science gear carried on top of the suit (planner params.kitKg), challenge objective O7
  const [navTab, setNavTab] = useState<NavTab>('plan');
  const [frameTick, setFrameTick] = useState(0);
  const [hero, setHero] = useState(() => !new URLSearchParams(window.location.search).has('nointro'));
  // loading screen: stays until the region data is in (at least 1.4 s so it reads as an intro), then fades
  const [ldOut, setLdOut] = useState(false);
  const [ldGone, setLdGone] = useState(false);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!region) return;
    const t1 = setTimeout(() => setLdOut(true), Math.max(0, 1400 - (Date.now() - mountedAt)));
    const t2 = setTimeout(() => setLdGone(true), Math.max(0, 1400 - (Date.now() - mountedAt)) + 750);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [region, mountedAt]);
  const [startH, setStartH] = useState(9);

  // 1. load region data
  useEffect(() => {
    loadRegion()
      .then((r) => {
        setRegion(r);
        const b = r.meta.base;
        if (b) setBase([b.lon, b.lat]);
      })
      .catch((e) => setError(`Could not load map data: ${e.message}`));
  }, []);

  // 2. create the map once the region is known
  useEffect(() => {
    if (!region || !mapEl.current || map.current) return;
    const m = region.meta;
    maplibregl.setWorkerUrl('/maplibre-gl-worker.mjs');
    registerRegionTerrain(region);
    registerTrek();
    const centre: [number, number] = [(m.lon[0] + m.lon[1]) / 2, (m.lat[0] + m.lat[1]) / 2];
    const mp = new maplibregl.Map({
      container: mapEl.current,
      center: centre,
      zoom: 11,
      attributionControl: false,
      maxPitch: 75,
      // you can zoom out only as far as the edges of the map (no empty space around Mars)
      renderWorldCopies: false,
      style: {
        version: 8,
        sources: {
          // global NASA layers via NASA Mars Trek (T-33): shown on the Globe only, and only the active one, so
          // no tile outside the region downloads while planning in 2D / 3D
          'trek-colour': trekSource('colour'),
          'trek-height': trekSource('height'),
          'trek-thermal': trekSource('thermal'),
          region: { type: 'image', url: region.url('visible.jpg'), coordinates: corners(m) },
          // the region's own NASA layers in false colour (urls swapped in once built, see the map-type effect)
          'region-height': { type: 'image', url: region.url('visible.jpg'), coordinates: corners(m) },
          'region-thermal': { type: 'image', url: region.url('thermal.jpg'), coordinates: corners(m) },
          slope: { type: 'image', url: region.url('slope.png'), coordinates: corners(m) },
          dem: { type: 'raster-dem', tiles: ['elev://dem/{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 13 },
          hs: { type: 'raster-dem', tiles: ['elev://hs/{z}/{x}/{y}'], tileSize: 256, encoding: 'terrarium', maxzoom: 13 },
          traverse: { type: 'geojson', data: region.traverse ?? { type: 'FeatureCollection', features: [] } },
          routes: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          trail: { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
          // Mission simulator (T-35): the simulation picked in ScenarioPanel
          'sim-route': { type: 'geojson', data: { type: 'FeatureCollection', features: [] } },
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#120a07' } },
          { id: 'trek-colour', type: 'raster', source: 'trek-colour', layout: { visibility: 'none' }, paint: { 'raster-saturation': -0.3, 'raster-brightness-max': 0.6, 'raster-fade-duration': 0 } },
          { id: 'trek-height', type: 'raster', source: 'trek-height', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.8, 'raster-fade-duration': 0 } },
          { id: 'trek-thermal', type: 'raster', source: 'trek-thermal', layout: { visibility: 'none' }, paint: { 'raster-brightness-max': 0.8, 'raster-fade-duration': 0 } },
          { id: 'region', type: 'raster', source: 'region', paint: { 'raster-fade-duration': 0 } },
          { id: 'region-height', type: 'raster', source: 'region-height', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
          { id: 'region-thermal', type: 'raster', source: 'region-thermal', layout: { visibility: 'none' }, paint: { 'raster-fade-duration': 0 } },
          { id: 'hillshade', type: 'hillshade', source: 'hs', paint: { 'hillshade-exaggeration': 0.6, 'hillshade-shadow-color': '#1a0d07' } },
          {
            id: 'slope', type: 'raster', source: 'slope', layout: { visibility: 'none' },
            paint: { 'raster-opacity': 0.75, 'raster-hue-rotate': 0 },
          },
          {
            id: 'traverse', type: 'line', source: 'traverse',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            // NASA's detailed drive line (T-34a), drawn the way PIA26042 draws it: one thin, solid, pale line
            paint: { 'line-color': '#f5efe6', 'line-width': ['interpolate', ['linear'], ['zoom'], 11, 1.1, 15, 2], 'line-opacity': 0.9 },
          },
          {
            id: 'routes-casing', type: 'line', source: 'routes',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#05060a', 'line-width': ['case', ['get', 'selected'], 6, 3.5], 'line-opacity': ['case', ['get', 'selected'], 0.7, 0.35] },
          },
          {
            id: 'routes', type: 'line', source: 'routes',
            layout: { 'line-join': 'round', 'line-cap': 'round', 'line-sort-key': ['case', ['get', 'selected'], 1, 0] },
            paint: { 'line-color': ['get', 'color'], 'line-width': ['case', ['get', 'selected'], 2.8, 1.6], 'line-opacity': ['case', ['get', 'selected'], 1, 0.5] },
          },
          {
            id: 'sim-route-casing', type: 'line', source: 'sim-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#05060a', 'line-width': 6.5, 'line-opacity': 0.75 },
          },
          {
            id: 'sim-route', type: 'line', source: 'sim-route',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 2.8, 'line-dasharray': [2, 1.2] },
          },
          {
            id: 'trail', type: 'line', source: 'trail',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': 3.5, 'line-opacity': 0.95 },
          },
        ],
      },
    });
    mp.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'bottom-right');
    // start on the whole region, locked to it (no flight in from space: that would download the planet's tiles)
    lockToRegion(mp, m, true);
    mp.jumpTo(regionHome(m, mp));
    mp.on('resize', () => {
      if (!globeRef.current) lockToRegion(mp, m, true);
    });
    mp.on('load', () => {
      setMapReady(true);
      setMapInst(mp);
    });
    map.current = mp;
    return () => {
      mp.remove();
      map.current = null;
      setMapInst(null);
    };
  }, [region]);

  // 3. POI markers
  useEffect(() => {
    if (!mapReady || !region) return;
    const ms = region.pois.map((p) => {
      const el = document.createElement('button');
      el.className = 'poi-marker';
      el.title = p.name;
      el.innerHTML = `<span class="poi-dot"></span><span class="poi-label">${p.name}</span>`;
      el.onclick = (ev) => {
        ev.stopPropagation();
        setDest([p.lon, p.lat]);
        setDestName(p.name);
      };
      return new maplibregl.Marker({ element: el }).setLngLat([p.lon, p.lat]).addTo(map.current!);
    });
    return () => ms.forEach((m) => m.remove());
  }, [mapReady, region]);

  // 3b. bookmark markers (gold): click to plan to it (inside the region) or just to look
  const pickTargetRef = useRef<(t: Target) => void>(() => {});
  useEffect(() => {
    if (!mapReady || !map.current) return;
    const ms = bookmarks.map((b) => {
      const el = document.createElement('button');
      el.className = 'poi-marker bm-marker';
      el.title = b.name;
      const dot = document.createElement('span');
      dot.className = 'poi-dot bm-dot';
      const label = document.createElement('span');
      label.className = 'poi-label';
      label.textContent = b.name; // typed by the user: never innerHTML
      el.append(dot, label);
      el.onclick = (ev) => {
        ev.stopPropagation();
        pickTargetRef.current(b);
      };
      return new maplibregl.Marker({ element: el }).setLngLat([b.lon, b.lat]).addTo(map.current!);
    });
    return () => ms.forEach((m) => m.remove());
  }, [mapReady, bookmarks]);

  // 3c. labels of sites + bookmarks never cover each other (Vera Rubin Ridge, Glen Torridon and Woodland Bay are a few
  // hundred metres apart, so at the whole-crater zoom their names piled up). Top to bottom, each label goes right of
  // its dot; if that covers a label already placed, another dot or a pin it tries the left, else it hides (hover shows it).
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp) return;
    const near = (a: DOMRect, b: DOMRect) => a.left < b.right + 3 && b.left < a.right + 3 && a.top < b.bottom + 1 && b.top < a.bottom + 1;
    const place = () => {
      const els = [...mp.getContainer().querySelectorAll<HTMLElement>('.poi-marker')];
      const dots = els.map((el) => el.getBoundingClientRect());
      // the BASE / TARGET / PIT STOP pins are obstacles too, except the pin standing on this label's own site
      const pins = [...mp.getContainer().querySelectorAll<HTMLElement>('.pin')].map((el) => el.getBoundingClientRect());
      const placed: DOMRect[] = [];
      const covers = (r: DOMRect, self: number) => {
        const cx = (dots[self].left + dots[self].right) / 2;
        const cy = (dots[self].top + dots[self].bottom) / 2;
        const own = (p: DOMRect) => Math.abs((p.left + p.right) / 2 - cx) < 4 && Math.abs(p.bottom - cy) < 8;
        return placed.some((p) => near(r, p)) || dots.some((d, k) => k !== self && near(r, d)) || pins.some((p) => !own(p) && near(r, p));
      };
      els
        .map((el, i) => ({ el, i }))
        .sort((a, b) => dots[a.i].top - dots[b.i].top)
        .forEach(({ el, i }) => {
          const label = el.querySelector<HTMLElement>('.poi-label');
          if (!label) return;
          label.classList.remove('poi-label-left', 'poi-label-off');
          let r = label.getBoundingClientRect();
          if (covers(r, i)) {
            label.classList.add('poi-label-left');
            r = label.getBoundingClientRect();
            if (covers(r, i)) {
              label.classList.replace('poi-label-left', 'poi-label-off');
              return;
            }
          }
          placed.push(r);
        });
    };
    const raf = requestAnimationFrame(place);
    mp.on('moveend', place);
    mp.on('resize', place);
    return () => {
      cancelAnimationFrame(raf);
      mp.off('moveend', place);
      mp.off('resize', place);
    };
  }, [mapReady, region, bookmarks, base, dest, pitStops]);

  // 4. click to place base / destination
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp || !region) return;
    const onClick = (e: maplibregl.MapMouseEvent) => {
      const { lng, lat } = e.lngLat;
      if (placing === 'bookmark') {
        setBookmarkAt([lng, lat]);
        setPlacing('dest');
        return;
      }
      if (!toCell(region.meta, lng, lat)) {
        setError('That spot is outside the mapped region. Pick a point inside the highlighted area.');
        return;
      }
      setError(null);
      if (placing === 'pitstop') {
        setPitStops((s) => [...s, [lng, lat]]);
        setPlacing('dest');
        return;
      }
      if (placing === 'base') {
        setBase([lng, lat]);
        setPlacing('dest');
      } else {
        setDest([lng, lat]);
        setDestName(null);
      }
    };
    mp.on('click', onClick);
    mp.getCanvas().style.cursor = 'crosshair';
    return () => {
      mp.off('click', onClick);
    };
  }, [mapReady, region, placing]);

  // 5. base / destination markers
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp) return;
    const put = (key: 'base' | 'dest', pos: [number, number] | null, cls: string, text: string) => {
      markers.current[key]?.remove();
      markers.current[key] = undefined;
      if (!pos) return;
      const el = document.createElement('div');
      el.className = cls;
      el.innerHTML = `<span>${text}</span>`;
      markers.current[key] = new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(pos).addTo(mp);
    };
    put('base', base, 'pin pin-base', 'BASE');
    put('dest', dest, 'pin pin-dest', 'TARGET');
  }, [mapReady, base, dest]);

  // 5b. pit stop markers, numbered in the order the route visits them
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp) return;
    const ms = pitStops.map((pos, i) => {
      const el = document.createElement('div');
      el.className = 'pin pin-pitstop';
      el.innerHTML = `<span>PIT STOP ${i + 1}</span>`;
      return new maplibregl.Marker({ element: el, anchor: 'bottom' }).setLngLat(pos).addTo(mp);
    });
    return () => ms.forEach((m) => m.remove());
  }, [mapReady, pitStops]);

  // 6. plan routes whenever base + destination are set
  useEffect(() => {
    if (!region || !base || !dest) return;
    const m = region.meta;
    const start = toCell(m, base[0], base[1]);
    const end = toCell(m, dest[0], dest[1]);
    if (!start || !end) return;
    const vias = pitStops.map((p) => toCell(m, p[0], p[1])).filter((c): c is [number, number] => !!c);
    const pois = region.pois
      .map((p) => ({ p, c: toCell(m, p.lon, p.lat) }))
      .filter((q): q is { p: Poi; c: [number, number] } => !!q.c)
      .map(({ p, c }) => ({ x: c[0], y: c[1], id: p.id }));
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- loading flag for async planning
    setBusy(true);
    setError(null);
    // the Mission simulator reuses these args (the worker keeps the last plan), so it prices the gear too
    const params = rover || kitKg ? { ...(rover ? { rover: true } : {}), ...(kitKg ? { kitKg } : {}) } : undefined;
    plan({ elev: region.elev, w: m.width, h: m.height, cellX: m.cellM[0], cellY: m.cellM[1], fineSlope: region.fineSlope, start, end, vias, pois, params })
      .then((r) => !cancelled && setRoutes(r))
      .catch((e) => !cancelled && setError(`Route planning failed: ${e.message}`))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [region, base, dest, rover, kitKg, pitStops]);

  // 6b. draw the simulation picked in the Mission simulator panel (T-35)
  const previewSim = useCallback(
    (line: [number, number][] | null) => {
      const src = map.current?.getSource('sim-route') as GeoJSONSource | undefined;
      if (!src || !region) return;
      src.setData({
        type: 'FeatureCollection',
        features: line ? [{ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: line.map(([x, y]) => toLonLat(region.meta, x, y)) } }] : [],
      });
    },
    [region],
  );

  // 7. draw routes
  useEffect(() => {
    const src = map.current?.getSource('routes') as GeoJSONSource | undefined;
    if (!mapReady || !src || !region) return;
    const features = (routes ?? [])
      .filter((r) => SHOWN.includes(r.strategy))
      .filter((r) => r.path)
      .map((r) => ({
        type: 'Feature' as const,
        properties: { strategy: r.strategy, color: ROUTE_STYLE[r.strategy].color, selected: r.strategy === selected },
        geometry: { type: 'LineString' as const, coordinates: (r.line ?? r.path!).map(([x, y]) => toLonLat(region.meta, x, y)) },
      }));
    src.setData({ type: 'FeatureCollection', features });
  }, [mapReady, routes, selected, region]);

  // 7b. frame the routes when a new plan arrives
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp || !region || !routes) return;
    const pts = routes.filter((r) => SHOWN.includes(r.strategy)).flatMap((r) => r.path ?? []).map(([x, y]) => toLonLat(region.meta, x, y));
    if (base) pts.push(base);
    if (!pts.length) return;
    const b = new maplibregl.LngLatBounds(pts[0], pts[0]);
    pts.forEach((p) => b.extend(p));
    const wide = window.innerWidth >= 768;
    mp.fitBounds(b, { padding: wide ? { top: 100, bottom: 380, left: 360, right: 340 } : { top: 90, bottom: window.innerHeight * 0.5, left: 30, right: 30 }, duration: 1200, maxZoom: 14 });
  }, [mapReady, routes, region, frameTick]); // eslint-disable-line react-hooks/exhaustive-deps

  // 8. 2D / 3D (skip the very first run so the intro flight isn't cancelled)
  const viewInit = useRef(false);
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp) return;
    if (!viewInit.current) {
      viewInit.current = true;
      if (!view3d) return;
    }
    if (view3d) {
      mp.setTerrain({ source: 'dem', exaggeration: VERTICAL_EXAGGERATION * MARS_TERRAIN_FACTOR });
      mp.easeTo({ pitch: PITCH_3D, bearing: BEARING_3D, duration: 1400 });
      mp.dragRotate.enable();
    } else {
      mp.setTerrain(null);
      mp.easeTo({ pitch: 0, bearing: 0, duration: 1000 });
    }
  }, [mapReady, view3d]);

  // 8b. geology (T-34): tint + channel + labels, loaded on first use (one 43 KB image + 24 KB JSON)
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp || !region) return;
    if (geology || mp.getSource('geology-tint')) void setGeologyVisible(mp, geology, region);
  }, [mapReady, region, geology]);

  // 9. map type (T-33): one global Trek layer + the matching region layer. Hidden layers load no tiles.
  const regionImgs = useRef<{ height?: string; thermal?: string }>({});
  const [imgTick, setImgTick] = useState(0); // bumped when a false-colour image or an edge halo is ready
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp || !region) return;
    const show = (id: string, on: boolean) => mp.setLayoutProperty(id, 'visibility', on ? 'visible' : 'none');
    const base = mapType === 'height' || mapType === 'thermal' ? mapType : 'colour';
    // the rest of Mars only on the Globe (hidden layers download nothing)
    show('trek-colour', globe && base === 'colour');
    show('trek-height', globe && base === 'height');
    show('trek-thermal', globe && base === 'thermal');
    show('region', base === 'colour');
    show('region-height', base === 'height');
    show('region-thermal', base === 'thermal');
    show('slope', mapType === 'slope');
    // build the region's false-colour images once, on first use
    const src = (id: string) => mp.getSource(id) as maplibregl.ImageSource | undefined;
    if (base === 'height' && !regionImgs.current.height) {
      regionImgs.current.height = 'pending';
      const m = region.meta;
      elevationColourUrl(region.elev, m.width, m.height, m.cellM).then(({ url }) => {
        regionImgs.current.height = url;
        setImgTick((n) => n + 1);
        src('region-height')?.updateImage({ url, coordinates: corners(m) });
      });
    }
    if (base === 'thermal' && !regionImgs.current.thermal) {
      regionImgs.current.thermal = 'pending';
      falseColourUrl(region.url('thermal.jpg'), 0.8).then((url) => {
        regionImgs.current.thermal = url;
        setImgTick((n) => n + 1);
        src('region-thermal')?.updateImage({ url, coordinates: corners(region.meta) });
      });
    }
  }, [mapReady, mapType, region, globe]);

  // 9b. edge bleed (Justin, Sun 15 Nov): no black around the map. A soft halo of the shown image's own edge
  // colours fades into a matching dark Mars brown (lib/edge-bleed.ts). Hidden on the Globe (Trek shows Mars there).
  const bleeds = useRef<Partial<Record<'colour' | 'height' | 'thermal', EdgeBleed | 'pending'>>>({});
  useEffect(() => {
    const mp = map.current;
    if (!mapReady || !mp || !region) return;
    const kind = mapType === 'height' || mapType === 'thermal' ? mapType : 'colour';
    const url = kind === 'colour' ? region.url('visible.jpg') : regionImgs.current[kind];
    if (!url || url === 'pending') return; // the false-colour image is still being made (imgTick re-runs this)
    const b = bleeds.current[kind];
    if (!b) {
      bleeds.current[kind] = 'pending';
      makeEdgeBleed(url)
        .then((made) => {
          bleeds.current[kind] = made;
          setImgTick((n) => n + 1);
        })
        .catch(() => {
          delete bleeds.current[kind];
        });
      return;
    }
    if (b === 'pending') return;
    const corners4 = bleedCorners(region.meta);
    const src = mp.getSource('bleed') as maplibregl.ImageSource | undefined;
    if (!src) {
      mp.addSource('bleed', { type: 'image', url: b.url, coordinates: corners4 });
      mp.addLayer({ id: 'bleed', type: 'raster', source: 'bleed', paint: { 'raster-fade-duration': 0 } }, 'trek-colour');
      // the rim sits on the image (under the hillshade, slope and routes) and softens its border
      mp.addSource('bleed-rim', { type: 'image', url: b.rim, coordinates: corners(region.meta) });
      mp.addLayer({ id: 'bleed-rim', type: 'raster', source: 'bleed-rim', paint: { 'raster-fade-duration': 0 } }, 'hillshade');
    } else {
      src.updateImage({ url: b.url, coordinates: corners4 });
      (mp.getSource('bleed-rim') as maplibregl.ImageSource | undefined)?.updateImage({ url: b.rim, coordinates: corners(region.meta) });
    }
    mp.setLayoutProperty('bleed', 'visibility', globe ? 'none' : 'visible');
    mp.setLayoutProperty('bleed-rim', 'visibility', globe ? 'none' : 'visible');
    mp.setPaintProperty('bg', 'background-color', globe ? '#120a07' : b.background);
    mapEl.current?.style.setProperty('background', globe ? '' : b.background);
  }, [mapReady, region, mapType, globe, imgTick]);

  // 10. globe view (MapLibre's own globe projection: no extra library). Leaving the globe flies back to the
  // region and locks the view to it again.
  const globeInit = useRef(false);
  useEffect(() => {
    const mp = map.current;
    globeRef.current = globe;
    if (!mapReady || !mp || !region) return;
    if (!globeInit.current) {
      globeInit.current = true;
      if (!globe) return;
    }
    const m = region.meta;
    if (globe) {
      lockToRegion(mp, m, false);
      mp.setProjection({ type: 'globe' });
      const to = globeFly.current;
      globeFly.current = null;
      if (to) mp.flyTo({ center: to, zoom: 5, pitch: 0, bearing: 0, duration: 2200, essential: true });
      else mp.easeTo({ zoom: 2.2, pitch: 0, bearing: 0, duration: 1400 });
      return;
    }
    mp.setProjection({ type: 'mercator' });
    const home = regionHome(m, mp);
    const relock = () => {
      if (!globeRef.current) lockToRegion(mp, m, true);
    };
    mp.once('moveend', relock);
    mp.easeTo({ ...home, pitch: view3d ? PITCH_3D : 0, bearing: view3d ? BEARING_3D : 0, duration: 1400 });
    return () => {
      mp.off('moveend', relock);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- react to the globe toggle only
  }, [mapReady, globe]);

  // pit stop ids from the planner: 'pitstop' (1st), 'pitstop2', 'pitstop3', …
  const poiName = useCallback(
    (id: string) => {
      const n = /^pitstop(\d*)$/.exec(id);
      if (n) return pitStops.length > 1 ? `pit stop ${n[1] || 1}` : 'your pit stop';
      return region?.pois.find((p) => p.id === id)?.name ?? id;
    },
    [region, pitStops.length],
  );

  // daylight at the base: sunrise/sunset for today's solar declination
  const clock = useMemo(() => (base ? marsClock(base[0], base[1]) : null), [base]);
  const startClamped = clock ? Math.min(Math.max(startH, Math.ceil(clock.rise * 4) / 4), Math.floor((clock.set - 1) * 4) / 4) : startH;

  // routes with each one's daylight window, and the verdict re-run with its own daylight margin
  const scored = useMemo(
    () =>
      (routes ?? []).filter((r) => SHOWN.includes(r.strategy)).map((r) => {
        const d: Daylight | null = clock ? routeDaylight(r, startClamped, clock.set) : null;
        return { ...r, verdict: verdictWithDaylight(r, d), daylight: d };
      }),
    [routes, clock, startClamped],
  );

  // what the mission briefing explains: computed numbers only
  const briefingRequest = useMemo<BriefingRequest | null>(() => {
    const rs = scored.filter((r) => r.budget);
    if (!rs.length || !region) return null;
    const routesIn = rs.map((r) => ({
      strategy: r.strategy,
      distanceKm: +(r.budget.distance / 1000).toFixed(1),
      durationMin: Math.round(r.budget.totalT / 60),
      o2MarginPct: Math.round(Math.max(0, r.budget.marginPct)),
      maxSlopeDeg: +r.budget.maxSlope.toFixed(1),
      steepPct: r.budget.steepPct,
      verdict: r.verdict,
      poisVisited: r.poisVisited.filter((id) => !/^pitstop\d*$/.test(id)).map(poiName), // pit stops aren't science sites
      note: r.note ?? (rover ? 'Rover assist: the crew drives an unpressurised rover between sites and works on foot at each site' : undefined),
    }));
    const rec = scored.find((r) => r.strategy === pickRecommended(routesIn));
    return {
      region: region.meta.name,
      routes: routesIn,
      daylight: clock && rec?.daylight ? { endMarginH: +rec.daylight.endMarginH.toFixed(1), sunsetLocal: hm(clock.set) } : null,
    };
  }, [scored, region, clock, poiName, rover]);


  const baseName = region?.meta.base && base && base[0] === region.meta.base.lon ? region.meta.base.name : base ? fmtLL(base) : '—';

  // Simulate Mission: marker, trail, camera follow and HUD (see Simulation.tsx)
  const simulation = useSimulation({
    mapRef: map,
    mapReady,
    region,
    route: scored.find((r) => r.strategy === selected) ?? null,
    routes,
    startH: startClamped,
    sunsetH: clock?.set ?? 18,
    routeStyle: ROUTE_STYLE,
    baseName,
  });
  /** A bookmark (or a landing-page target): plan to it inside the region, otherwise just fly there. */
  const pickTarget = (t: Target) => {
    if (region && toCell(region.meta, t.lon, t.lat)) {
      setError(null);
      setDest([t.lon, t.lat]);
      setDestName(t.name);
      return;
    }
    // outside the region: open the Globe there (2D / 3D show only the region)
    const mp = map.current;
    if (mp) {
      if (view3d) setView3d(false);
      if (globe) mp.flyTo({ center: [t.lon, t.lat], zoom: 5, pitch: 0, duration: 2200, essential: true });
      else {
        globeFly.current = [t.lon, t.lat];
        setGlobe(true);
      }
    }
    setError(`${t.name} is outside the Gale planning area: you can look around on the globe, but walks are planned only inside the NASA 1 m terrain.`);
    setTimeout(() => setError(null), 6000);
  };
  useEffect(() => {
    pickTargetRef.current = pickTarget;
  });
  const moveBase = () => setPlacing(placing === 'base' ? 'dest' : 'base');

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080a] text-zinc-100">
      <div className="absolute inset-0">
        <div ref={mapEl} className="h-full w-full" />
      </div>
      {simulation.viewLayer}
      {!simulation.immersive && <HoverReadout map={mapInst} region={region} mapType={mapType} base={base} globe={globe} />}

      <TopNav
        tab={hero ? 'sites' : navTab}
        onTab={(t) => {
          if (t === 'sites') setHero(true);
          else setNavTab(t);
        }}
        regionName={region?.meta.name.replace(/\s*\(.*\)/, '') ?? 'Loading Mars…'}
        view3d={view3d}
        onToggle3d={() => {
          setGlobe(false);
          setView3d((v) => !v);
        }}
        globe={globe}
        onToggleGlobe={() => {
          setView3d(false);
          setGlobe((g) => !g);
        }}
      />

      {!simulation.immersive && (
        <>
      <SetupPanel
        meta={region?.meta ?? null}
        destName={destName}
        onPickTarget={pickTarget}
        onPickBookmarkOnMap={() => setPlacing('bookmark')}
        pickingBookmark={placing === 'bookmark'}
        bookmarkAt={bookmarkAt}
        onBookmarkDone={() => setBookmarkAt(null)}
        baseLabel={baseName}
        placingBase={placing === 'base'}
        onMoveBase={moveBase}
        selected={selected}
        clock={clock}
        startH={startClamped}
        onStart={setStartH}
        windows={scored.map((r) => ({ strategy: r.strategy, d: r.daylight }))}
        mapType={mapType}
        onMapType={setMapType}
        view3d={view3d}
        onView3d={(v) => {
          setGlobe(false);
          setView3d(v);
        }}
        base={base}
        rover={rover}
        onRover={setRover}
        kit={kitKg}
        onKit={setKitKg}
        pitStops={pitStops}
        placingPitStop={placing === 'pitstop'}
        onAddPitStop={() => setPlacing(placing === 'pitstop' ? 'dest' : 'pitstop')}
        onRemovePitStop={(i) => setPitStops((s) => s.filter((_, k) => k !== i))}
        hasTraverse={!!region?.traverse}
      />

      {/* right-hand column: Safe route, Fast route, Mission simulator (seeds); each starts small, grows on hover */}
      <RouteCards routes={scored} selected={selected} onSelect={setSelected} busy={busy} poiName={poiName}>
        {!simulation.running && (
          <ScenarioPanel
            routes={scored}
            poiName={poiName}
            Ls={clock?.Ls}
            daylight={clock ? { startH: startClamped, sunsetH: clock.set } : null}
            onPreview={mapReady ? previewSim : undefined}
            regionId={region?.meta.id ?? 'gale'}
          />
        )}
      </RouteCards>

      <DockCard
        base={base}
        routes={scored}
        selected={selected}
        briefing={briefingRequest}
        onRecommended={setSelected}
        onFrame={() => setFrameTick((n) => n + 1)}
        showSlope={showSlope}
        onSlope={setShowSlope}
        onSimulate={simulation.canStart ? simulation.start : undefined}
        hidden={simulation.running}
      />

      {/* phone: route cards as a bottom sheet */}
      {scored.length > 0 && (
        <div className="absolute inset-x-0 bottom-0 z-10 flex snap-x gap-2 overflow-x-auto p-3 [scrollbar-width:none] md:hidden">
          {[...scored].sort((a, b) => (a.strategy === selected ? -1 : b.strategy === selected ? 1 : 0)).map((r) => (
            <button
              key={r.strategy}
              onClick={() => setSelected(r.strategy)}
              className="min-w-[70%] snap-center rounded-3xl border border-white/10 p-4 text-left"
              style={{ background: r.strategy === selected ? ROUTE_STYLE[r.strategy].grad : '#141416' }}
            >
              <div className="flex justify-between text-sm font-medium">
                <span>{ROUTE_STYLE[r.strategy].label} route</span>
                <span className="text-xs">{r.verdict.lvl.toUpperCase()}</span>
              </div>
              <div className="mt-2 font-mono text-xs text-white/80">
                {(r.budget.distance / 1000).toFixed(1)} km · {Math.round(r.budget.totalT / 60)} min · O₂ {Math.max(0, r.budget.marginPct).toFixed(0)} %
              </div>
            </button>
          ))}
        </div>
      )}

      {!scored.length && !hero && (
        <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center md:hidden">
          <span className="rounded-full border border-white/10 bg-black/80 px-4 py-2.5 text-[13px] text-zinc-200 backdrop-blur">
            {busy ? 'Planning routes…' : 'Tap the map or a bookmark to plan a walk'}
          </span>
        </div>
      )}

        </>
      )}
      {simulation.panel}

      {placing === 'base' && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-[#f5c84b] px-4 py-2 text-xs font-semibold text-black shadow-lg">Click the map to place the base</div>
      )}
      {placing === 'pitstop' && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-[#fdba74] px-4 py-2 text-xs font-semibold text-black shadow-lg">Click the map to place pit stop {pitStops.length + 1}</div>
      )}
      {placing === 'bookmark' && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full bg-[#f5c84b] px-4 py-2 text-xs font-semibold text-black shadow-lg">Click the map to place the bookmark</div>
      )}

      {navTab === 'data' && !hero && <Credits meta={region?.meta ?? null} onClose={() => setNavTab('plan')} />}

      {hero && (
        <Hero
          region={region}
          onSkip={() => setHero(false)}
          onPick={(t) => {
            setHero(false);
            setTimeout(() => pickTarget(t), 50);
          }}
        />
      )}

      {!ldGone && <Loading out={ldOut} status={region ? 'NASA terrain loaded' : 'Loading NASA terrain…'} />}

      {error && (
        <div className="absolute left-1/2 top-20 z-20 -translate-x-1/2 rounded-full border border-red-400/30 bg-black/80 px-4 py-2 text-sm text-red-300">{error}</div>
      )}
    </div>
  );
}

function fmtLL([lon, lat]: [number, number]) {
  return `${Math.abs(lat).toFixed(3)}°${lat < 0 ? 'S' : 'N'} ${lon.toFixed(3)}°E`;
}
