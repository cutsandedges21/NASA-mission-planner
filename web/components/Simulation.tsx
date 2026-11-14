'use client';

// "Simulate Mission": one hook that owns everything about the playback, so the planner screen only needs
//   const simulation = useSimulation({ ... });   (above its return, with the other state)
//   {simulation.panel}                            (anywhere in the JSX: the HUD while running, nothing otherwise)
//   onSimulate={simulation.canStart ? simulation.start : undefined}   (the ▶ button on the dock card)
// Layout/visuals are intentionally plain; restyle `panel`'s wrapper classes and SimulationHUD freely.
// `simulation.start` / `simulation.canStart` are exposed if you'd rather place your own start button.
import { useCallback, useEffect, useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import * as maplibregl from 'maplibre-gl';
import type { GeoJSONSource, Map as MLMap } from 'maplibre-gl';
import SimulationHUD from './SimulationHUD';
import { buildMission, makePathLocator, type Frame, type Mission } from '@/lib/mission-timeline';
import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import { toLonLat, type Poi, type Region } from '@/lib/region';
import { createAstronautMarker } from '@/lib/rover-marker';

type Locator = ReturnType<typeof makePathLocator>;
type Sim = { route: PlannedRoute; mission: Mission; locator: Locator; routes: PlannedRoute[] | null };

export function useSimulation({
  mapRef,
  mapReady,
  region,
  route,
  routes,
  startH,
  sunsetH,
  routeStyle,
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
}): { running: boolean; canStart: boolean; start: () => void; close: () => void; panel: ReactNode } {
  const [sim, setSim] = useState<Sim | null>(null);
  const active = sim && sim.routes === routes ? sim : null;
  const cam = useRef<[number, number] | null>(null);
  const lastTrail = useRef(0);
  const lastFrameAt = useRef(0);
  const canStart = !!(mapReady && region && route?.path && route.budget?.timeline?.length);

  const start = useCallback(() => {
    if (!canStart || !region || !route?.path) return;
    const mission = buildMission(route);
    if (!mission) return;
    const m = region.meta;
    const locator = makePathLocator(route.path, m.cellM[0], m.cellM[1], (x, y) => toLonLat(m, x, y));
    cam.current = null;
    setSim({ route, mission, locator, routes });
  }, [canStart, region, route, routes]);
  const close = useCallback(() => setSim(null), []);

  // marker + trail lifecycle
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
    frameHandler.current = move;
    return () => {
      frameHandler.current = null;
      lastFrameAt.current = 0;
      marker.remove();
      (mp.getSource('trail') as GeoJSONSource | undefined)?.setData({ type: 'FeatureCollection', features: [] });
    };
  }, [active, mapRef, routeStyle]);

  // the HUD calls this every animation frame; the effect above swaps in the current handler
  const frameHandler = useRef<((f: Frame) => void) | null>(null);
  const onFrame = useCallback((f: Frame) => frameHandler.current?.(f), []);

  // HUD sits top-centre under the nav: bottom-centre is the dock card, the right 300 px the route cards.
  // The ▶ button lives on the dock card (pass `onSimulate={simulation.canStart ? simulation.start : undefined}`).
  const panel: ReactNode = active ? (
    <div className="absolute left-1/2 top-[5.25rem] z-20 hidden w-[min(640px,calc(100vw-48rem))] min-w-[460px] -translate-x-1/2 md:block">
      <SimulationHUD
        route={active.route}
        mission={active.mission}
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

  return { running: !!active, canStart, start, close, panel };
}
