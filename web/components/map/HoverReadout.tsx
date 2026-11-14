'use client';
// Trek-style cursor readout (T-33): latitude / longitude under the mouse, elevation and a modelled surface
// temperature, plus the legend of the current map type. Listens to the map itself and updates at most
// once per animation frame, so moving the mouse never re-renders the planner screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { Region } from '@/lib/region';
import { probe, loadThermal, TEMP_MODEL_ERR_C, MOLA8_ERR_M, type Probe } from '@/lib/probe';
import { THERMAL_GRADIENT, HEIGHT_GRADIENT, TREK_LAYERS, type MapType } from '@/lib/trek';
import { hm } from '@/lib/mars-context';

export default function HoverReadout({
  map,
  region,
  mapType,
  base,
}: {
  map: maplibregl.Map | null;
  region: Region | null;
  mapType: MapType;
  /** The Mars base [lon, lat]: elevations are shown relative to it (base = 0 m). */
  base: [number, number] | null;
}) {
  const [p, setP] = useState<Probe | null>(null);
  // the base's own elevation (from the region's 1 m DEM; the base is always inside the region)
  const baseElev = useMemo(() => (base && region ? probe(region, base[0], base[1]).now.elevM : null), [base, region]);
  const pending = useRef<{ lng: number; lat: number } | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (region) void loadThermal(region);
  }, [region]);

  useEffect(() => {
    if (!map) return;
    let raf = 0;
    const flush = () => {
      raf = 0;
      const q = pending.current;
      if (!q) return;
      const id = ++seq.current;
      const r = probe(region, q.lng, q.lat);
      setP(r.now);
      r.later?.then((e) => {
        if (id === seq.current) setP((cur) => (cur ? { ...cur, elevM: e } : cur));
      });
    };
    const onMove = (e: maplibregl.MapMouseEvent) => {
      pending.current = { lng: e.lngLat.lng, lat: e.lngLat.lat };
      if (!raf) raf = requestAnimationFrame(flush);
    };
    const onOut = () => {
      pending.current = null;
      setP(null);
    };
    map.on('mousemove', onMove);
    map.on('mouseout', onOut);
    return () => {
      map.off('mousemove', onMove);
      map.off('mouseout', onOut);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map, region]);

  const legend =
    mapType === 'thermal' ? { g: THERMAL_GRADIENT, lo: 'cold', hi: 'warm', src: region ? 'THEMIS IR: day (global), night (Gale)' : TREK_LAYERS.thermal.name } :
    mapType === 'height' ? { g: HEIGHT_GRADIENT, lo: 'low', hi: 'high', src: 'MOLA relief (global), 1 m DEM (Gale)' } :
    null;

  return (
    <div className="pointer-events-none absolute bottom-[52px] left-[332px] z-10 hidden w-[208px] rounded-xl border border-white/[0.07] bg-[#0d0d0f]/90 px-3 py-2.5 text-[11.5px] tabular-nums leading-[1.55] text-zinc-300 shadow-lg backdrop-blur md:block">
      {p ? (
        <>
          <div className="flex justify-between"><span className="text-zinc-500">Lat</span><span>{fmtLat(p.lat)}</span></div>
          <div className="flex justify-between"><span className="text-zinc-500">Lon</span><span>{fmtLon(p.lon)}</span></div>
          <div className="flex justify-between">
            <span className="text-zinc-500" title="Height above (+) or below (−) the Mars base, which is 0 m">Elev vs base</span>
            <span
              title={`${p.elevM == null ? '' : `${Math.round(p.elevM).toLocaleString('en-US')} m vs the Mars datum. `}${p.elevSrc === 'dem' ? 'USGS MSL Gale 1 m DEM (25 m cells)' : `MGS MOLA 463 m via NASA Trek, ±${MOLA8_ERR_M} m`}`}
            >
              {p.elevM == null ? '…' : `${p.elevSrc === 'mola' ? '≈ ' : ''}${fmtRel(p.elevM - (baseElev ?? 0))}`}
            </span>
          </div>
          <div className="flex justify-between">
            <span className="text-zinc-500">Surface</span>
            <span title={`Model, not a measurement: Curiosity REMS ground-temperature range at Gale by local solar time, scaled by latitude${p.inRegion ? ', nudged by THEMIS night IR' : ''}. ±${TEMP_MODEL_ERR_C} °C`}>
              ≈ {Math.round(p.tempC)} °C <span className="text-zinc-500">model</span>
            </span>
          </div>
          <div className="mt-0.5 text-[10px] text-zinc-500">{hm(p.ltst)} local solar · {p.elevSrc === 'dem' ? '1 m DEM' : 'MOLA'}</div>
        </>
      ) : (
        <div className="text-zinc-500">Hover the map for coordinates, elevation and temperature</div>
      )}
      {legend && (
        <div className="mt-2 border-t border-white/[0.07] pt-2">
          <div className="h-1.5 rounded-full" style={{ background: legend.g }} />
          <div className="mt-1 flex justify-between text-[10px] text-zinc-500"><span>{legend.lo}</span><span>{legend.hi}</span></div>
          <div className="text-[10px] text-zinc-500">{legend.src}</div>
        </div>
      )}
    </div>
  );
}

const fmtLat = (v: number) => `${Math.abs(v).toFixed(4)}° ${v < 0 ? 'S' : 'N'}`;
/** Planetocentric, east-positive 0–360 like NASA Trek. */
const fmtLon = (v: number) => `${(((v % 360) + 360) % 360).toFixed(4)}° E`;
/** Signed metres relative to the base: "+123 m", "−45 m", "0 m". */
const fmtRel = (d: number) => {
  const v = Math.round(d);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('en-US')} m`;
};
