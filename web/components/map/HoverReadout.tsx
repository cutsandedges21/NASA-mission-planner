'use client';
// Trek-style cursor readout (T-33): latitude / longitude under the mouse, elevation and a modelled surface
// temperature, plus the legend of the current map type. Listens to the map itself and updates at most
// once per animation frame, so moving the mouse never re-renders the planner screen.
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as maplibregl from 'maplibre-gl';
import type { Region } from '@/lib/region';
import { probe, loadThermal, TEMP_MODEL_ERR_C, MOLA8_ERR_M, type Probe } from '@/lib/probe';
import { THERMAL_GRADIENT, HEIGHT_GRADIENT, GALE_HEIGHT_GRADIENT, TREK_LAYERS, type MapType } from '@/lib/trek';
import { hm } from '@/lib/mars-context';
import { RAD_GRADIENT, radRate } from '@/lib/radiation-layer';

export default function HoverReadout({
  map,
  region,
  mapType,
  base,
  globe = false,
}: {
  map: maplibregl.Map | null;
  region: Region | null;
  mapType: MapType;
  /** The Mars base [lon, lat]: elevations are shown relative to it (base = 0 m). */
  base: [number, number] | null;
  /** Globe on: readout anywhere on Mars. Off (2D / 3D): only inside the region, so nothing outside it downloads. */
  globe?: boolean;
}) {
  const [p, setP] = useState<Probe | null>(null);
  // the base's own elevation (from the region's 1 m DEM; the base is always inside the region)
  const baseElev = useMemo(() => (base && region ? probe(region, base[0], base[1]).now.elevM : null), [base, region]);
  // the region's height range (Elevation legend) and dose-rate range (Radiation legend)
  const zRange = useMemo(() => {
    if (!region) return null;
    let lo = Infinity, hi = -Infinity;
    for (const z of region.elev) { if (z < lo) lo = z; if (z > hi) hi = z; }
    return [lo, hi] as const;
  }, [region]);
  const radRange = zRange ? ([radRate(zRange[0]), radRate(zRange[1])] as const) : null;
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
      const { lng, lat } = e.lngLat;
      const m = region?.meta;
      if (!globe && m && (lng < m.lon[0] || lng > m.lon[1] || lat < m.lat[0] || lat > m.lat[1])) {
        pending.current = null; // the dark margin around the region: nothing to read, nothing to fetch
        setP(null);
        return;
      }
      pending.current = { lng, lat };
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
  }, [map, region, globe]);

  const legend =
    mapType === 'thermal'
      ? globe
        ? { g: THERMAL_GRADIENT, lo: 'cold', hi: 'warm', src: region ? 'THEMIS IR: day (global), night (Gale)' : TREK_LAYERS.thermal.name }
        : { g: THERMAL_GRADIENT, lo: 'cold', hi: 'warm', src: 'THEMIS night IR, contrast stretched to Gale' } :
    mapType === 'height'
      ? globe
        ? { g: HEIGHT_GRADIENT, lo: 'low', hi: 'high', src: 'MOLA relief (global), 1 m DEM (Gale)' }
        : {
            g: GALE_HEIGHT_GRADIENT,
            lo: zRange ? fmtRel(zRange[0] - (baseElev ?? 0)) : 'low',
            hi: zRange ? `${fmtRel(zRange[1] - (baseElev ?? 0))} vs base` : 'high',
            src: '1 m DEM. Each colour covers about the same area of Gale, so small rises show up',
          } :
    mapType === 'radiation' ? {
      g: RAD_GRADIENT,
      lo: radRange ? `Gale ${radRange[0].toFixed(2)}` : 'low',
      hi: radRange ? `${radRange[1].toFixed(2)} mSv/day` : 'high',
      src: 'Planet: 10–20 rem/yr, NASA PIA03480 (MARIE + MOLA). Gale colours stretched to its own range.',
    } :
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
          {mapType === 'radiation' && p.elevM != null && (
            <div className="flex justify-between">
              <span className="text-zinc-500">Dose rate</span>
              <span title="Galactic cosmic rays at the surface: Curiosity RAD's 0.64 mSv/day at Bradbury Landing, scaled by elevation with NASA's PIA03480 map (+5.1 % per km higher). Model, not a measurement at this spot.">
                ≈ {radRate(p.elevM).toFixed(3)} <span className="text-zinc-500">mSv/day</span>
              </span>
            </div>
          )}
          <div className="mt-0.5 text-[10px] text-zinc-500">{hm(p.ltst)} local solar · {p.elevSrc === 'dem' ? '1 m DEM' : 'MOLA'}</div>
        </>
      ) : (
        <div className="text-zinc-500">Hover the map for coordinates, elevation and temperature{mapType === 'radiation' ? ' and dose rate' : ''}</div>
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
