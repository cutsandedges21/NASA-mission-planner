'use client';

// "Simulate Mission": one hook that owns everything about the playback, so the planner screen only needs
//   const simulation = useSimulation({ ... });   (above its return, with the other state)
//   {simulation.viewLayer}                        (right after the map container: the first-person view, under the panels)
//   {simulation.panel}                            (anywhere above the map: the HUD while running, nothing otherwise)
//   {!simulation.immersive && <panels…/>}         (the first-person view is full screen: hide the side panels while it runs)
//   onSimulate={simulation.canStart ? simulation.start : undefined}   (the ▶ button on the dock card)
// Two views of the same mission: the overhead MAP (22 s, camera follows on the map) and the first-person ROVER view
// (a slower 55 s ride, because a map-speed ride at ground level would be ~500 m/s). The HUD switches between them
// without losing your place (see Mission.uAtTau). A rover-assist route starts in the rover view.
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import SimulationHUD from './SimulationHUD';
import RoverView from './RoverView';
import { buildMission, makePathLocator, type Frame, type Mission } from '@/lib/mission-timeline';
import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import { toLonLat, type Poi, type Region } from '@/lib/region';
import { createAstronautMarker } from '@/lib/rover-marker';

type Locator = ReturnType<typeof makePathLocator>;
export type SimView = 'map' | 'rover';
export type Missions = Record<SimView, Mission>;
type Sim = { route: PlannedRoute; missions: Missions; locator: Locator; routes: PlannedRoute[] | null };

export function useSimulation({
  mapRef,
  mapReady,
  region,
  route,
  routes,
  startH,
  sunsetH,
  routeStyle,
  baseName,
}: {
  mapRef: MutableRefObject<MLMap | null>;
  mapReady: boolean;
  region: Region | null;
  /** The route to play (the selected one). */
  route: PlannedRoute | null;
  /** The whole current plan; the simulation closes by itself when this changes (new target, new start time). */
  routes: PlannedRoute[] | null;
  startH: number;
  sunsetH: number;
  routeStyle: Record<Strategy, { color: string; label: string }>;
  /** Display name of the base, for the first-person view's label. */
  baseName: string;
}): {
  running: boolean;
  /** True while the full-screen first-person view is up: hide the side panels. */
  immersive: boolean;
  canStart: boolean;
  start: () => void;
  close: () => void;
  panel: ReactNode;
  viewLayer: ReactNode;
} {
  const [sim, setSim] = useState<Sim | null>(null);
  const [view, setView] = useState<SimView>('map');
  const active = sim && sim.routes === routes ? sim : null;
  const cam = useRef<[number, number] | null>(null);
  const lastTrail = useRef(0);
  const lastFrameAt = useRef(0);
  const viewRef = useRef<SimView>(view);
  useEffect(() => {
    viewRef.current = view;
  });
  const canStart = !!(mapReady && region && route?.path && route.budget?.timeline?.length);

  const start = useCallback(() => {
    if (!canStart || !region || !route?.path) return;
    const missions = { map: buildMission(route), rover: buildMission(route, { walkSeconds: 55, stopDwell: 5 }) };
    if (!missions.map || !missions.rover) return;
    const m = region.meta;
    // follow the smooth line the map draws (T-32), on the timeline's distance base (the budget is computed on route.path)
    const b = route.budget;
    const ref = route.line ? (b?.oneWay ?? (b ? b.distance / 2 : undefined)) : undefined;
    const locator = makePathLocator(route.line ?? route.path, m.cellM[0], m.cellM[1], (x, y) => toLonLat(m, x, y), ref);
    cam.current = null;
    setView(route.budget?.mode === 'rover' ? 'rover' : 'map');
    setSim({ route, missions: missions as Missions, locator, routes });
  }, [canStart, region, route, routes]);
  const close = useCallback(() => setSim(null), []);

  // frame handlers: the map's (marker, trail, camera) and the first-person view's (registered by RoverView)
  const mapHandler = useRef<((f: Frame) => void) | null>(null);
  const roverHandler = useRef<((f: Frame) => void) | null>(null);
  const registerRover = useCallback((h: ((f: Frame) => void) | null) => {
    roverHandler.current = h;
  }, []);
  const onFrame = useCallback((f: Frame) => {
    mapHandler.current?.(f);
    roverHandler.current?.(f);
  }, []);

  // map marker + trail lifecycle
  useEffect(() => {
    const mp = mapRef.current;
    if (!mp || !active) return;
    const begin = active.locator.at(0);
    const marker = new maplibregl.Marker({ element: createAstronautMarker(routeStyle[active.route.strategy].color) }).setLngLat(begin).addTo(mp);
    marker.getElement().style.zIndex = '5';
    mp.easeTo({ center: begin, zoom: Math.max(mp.getZoom(), 13.2), duration: 800 });
    (mp.getSource('trail') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    const move = (f: Frame) => {
      const pos = active.locator.at(f.d);
      marker.setLngLat(pos);
      if (viewRef.current !== 'map') return; // first-person view is up: the map isn't visible, skip the camera and trail work
      // smooth camera follow (time-based so it feels the same at any frame rate)
      const now = performance.now();
      const dt = Math.min(0.1, (now - (lastFrameAt.current || now)) / 1000);
      lastFrameAt.current = now;
      const k = 1 - Math.exp(-dt * 5);
      const c = cam.current ?? pos;
      cam.current = [c[0] + (pos[0] - c[0]) * k, c[1] + (pos[1] - c[1]) * k];
      mp.jumpTo({ center: cam.current });
      if (now - lastTrail.current > 70) {
        lastTrail.current = now;
        (mp.getSource('trail') as GeoJSONSource | undefined)?.setData({
          type: 'Feature',
          properties: {},
          geometry: { type: 'LineString', coordinates: active.locator.trail(f.d) },
        });
      }
    };
    mapHandler.current = move;
    return () => {
      mapHandler.current = null;
      lastFrameAt.current = 0;
      marker.remove();
      (mp.getSource('trail') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    };
  }, [active, mapRef, routeStyle]);

  // HUD sits top-centre under the nav: bottom-centre is the dock card, the right 300 px the route cards.
  const panel: ReactNode = active ? (
    <div className="absolute left-1/2 top-[5.25rem] z-20 hidden w-[min(640px,calc(100vw-48rem))] min-w-[460px] -translate-x-1/2 md:block">
      <SimulationHUD
        route={active.route}
        missions={active.missions}
        view={view}
        onView={setView}
        startH={startH}
        sunsetH={sunsetH}
        pois={(region?.pois ?? []) as Poi[]}
        color={routeStyle[active.route.strategy].color}
        label={routeStyle[active.route.strategy].label}
        onFrame={onFrame}
        onClose={close}
      />
    </div>
  ) : null;

  const viewLayer: ReactNode =
    active && region && view === 'rover' ? (
      <RoverView
        region={region}
        route={active.route}
        locator={active.locator}
        color={routeStyle[active.route.strategy].color}
        pois={region.pois as Poi[]}
        baseName={baseName}
        startH={startH}
        register={registerRover}
        onExit={() => setView('map')}
      />
    ) : null;

  return { running: !!active, immersive: !!active && view === 'rover', canStart, start, close, panel, viewLayer };
}
