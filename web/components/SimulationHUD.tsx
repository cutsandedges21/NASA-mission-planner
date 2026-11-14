'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EVA_DEFAULTS } from '../../planner/src/eva.js';
import { hm, MARS_HOUR_S } from '@/lib/mars-context';
import type { Frame, Mission } from '@/lib/mission-timeline';
import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import type { Poi } from '@/lib/region';

const SPEEDS = [1, 2, 4] as const;
const START_DELAY = 0.9; // seconds: lets the camera settle on the base before the walk begins

const fmtClock = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};
const fmtKm = (m: number) => `${(m / 1000).toFixed(1)} km`;

/**
 * Playback controls and live readouts for "Simulate Mission". It owns the animation clock; the map
 * (marker, trail, camera) is driven through onFrame so the planner screen doesn't re-render every frame.
 */
export default function SimulationHUD({
  route,
  mission,
  startH,
  sunsetH,
  pois,
  color,
  label,
  onFrame,
  onClose,
}: {
  route: PlannedRoute;
  mission: Mission;
  startH: number;
  sunsetH: number;
  pois: Poi[];
  color: string;
  label: string;
  strategy?: Strategy;
  onFrame: (f: Frame) => void;
  onClose: () => void;
}) {
  const [u, setU] = useState(-START_DELAY);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(1);
  const raf = useRef(0);
  const last = useRef(0);
  const uRef = useRef(u);
  const cb = useRef(onFrame);
  useEffect(() => {
    cb.current = onFrame;
  });

  // animation clock
  useEffect(() => {
    if (!playing) return;
    last.current = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      const next = Math.min(mission.duration, uRef.current + dt * speed);
      uRef.current = next;
      setU(next);
      if (next >= mission.duration) {
        setPlaying(false);
        return;
      }
      raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [playing, speed, mission]);

  // tell the map where the astronaut is (not during the start delay)
  const frame = useMemo(() => mission.at(Math.max(0, u)), [mission, u]);
  useEffect(() => {
    if (u >= 0) cb.current(frame);
  }, [frame, u]);

  const done = u >= mission.duration;
  const cap = EVA_DEFAULTS.o2CapKg as number;
  const reserve = EVA_DEFAULTS.reservePct as number;
  const o2Left = Math.max(0, ((cap - frame.o2) / cap) * 100);
  const lowO2 = o2Left < reserve + 15;
  const localH = startH + frame.tau / MARS_HOUR_S;
  const nearSunset = sunsetH - localH < 0.75;
  const stop = frame.stopId ? pois.find((p) => p.id === frame.stopId) : undefined;
  const phase = done ? 'EVA complete' : u < 0 ? 'Leaving the airlock' : frame.phase === 'working' ? `Working at ${stop?.name ?? 'site'}` : frame.phase === 'returning' ? 'Returning to base' : 'Walking out';

  const seek = (v: number) => {
    uRef.current = v;
    setU(v);
  };
  const toggle = () => {
    if (done) {
      seek(-START_DELAY);
      setPlaying(true);
    } else setPlaying((p) => !p);
  };

  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: color }} />
          <h2 className="eyebrow">Mission simulation · {label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-md border border-white/10 px-2 py-0.5 text-[11px] font-medium text-zinc-200">{phase}</span>
          <button onClick={onClose} aria-label="Close simulation" className="rounded-md px-2 py-0.5 text-zinc-400 transition hover:bg-white/10 hover:text-white">
            ✕
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-4 gap-3 font-mono">
        <Readout k="Mission clock" v={`T+${fmtClock(frame.tau)}`} />
        <Readout k="Local solar time" v={hm(localH)} warn={nearSunset} />
        <Readout k="Distance" v={`${fmtKm(frame.d)} / ${fmtKm(mission.total)}`} />
        <div>
          <div className="font-sans text-[9px] uppercase tracking-[0.18em] text-zinc-500">Oxygen left</div>
          <div className={`text-lg leading-tight ${lowO2 ? 'text-amber-300' : 'text-zinc-100'}`}>{o2Left.toFixed(0)} %</div>
          <div className="relative mt-1 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full transition-[width]" style={{ width: `${o2Left}%`, background: lowO2 ? '#fbbf24' : '#34d399' }} />
            <div className="absolute inset-y-0 w-px bg-red-400" style={{ left: `${reserve}%` }} title={`${reserve} % must remain at the airlock`} />
          </div>
        </div>
      </div>

      {stop && (
        <div className="mt-3 rounded-xl border border-violet-300/20 bg-violet-400/10 p-3">
          <div className="flex items-baseline justify-between">
            <div className="text-sm font-semibold text-violet-100">{stop.name}</div>
            <div className="font-mono text-[10px] text-violet-200/70">sampling · {Math.round(frame.stopProgress * 100)} %</div>
          </div>
          <p className="mt-1 text-xs leading-relaxed text-violet-50/90">{stop.why}</p>
          <p className="mt-1 text-[10px] text-violet-200/60">Source: {stop.source} (position approximate)</p>
        </div>
      )}
      {done && (
        <div className="mt-3 rounded-xl border border-emerald-300/20 bg-emerald-400/10 p-3 text-xs text-emerald-50/90">
          Back at the airlock after {fmtClock(mission.totalT)} with {Math.max(0, route.budget.marginPct).toFixed(0)} % oxygen
          {route.budget.doseMSv !== undefined ? ` and ${route.budget.doseMSv.toFixed(2)} mSv of radiation.` : '.'}
        </div>
      )}

      <div className="mt-3 flex items-center gap-3">
        <button onClick={toggle} className="w-16 rounded-lg bg-white/90 px-3 py-1.5 text-xs font-semibold text-[#07080a] transition hover:bg-white">
          {done ? 'Replay' : playing ? 'Pause' : 'Play'}
        </button>
        <input
          type="range"
          min={0}
          max={mission.duration}
          step={0.05}
          value={Math.max(0, u)}
          onChange={(e) => seek(+e.target.value)}
          className="h-1 flex-1 accent-orange-400"
          aria-label="Playback position"
        />
        <div className="flex items-center gap-1 rounded-lg bg-white/5 p-0.5 text-[11px]">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`rounded-md px-2 py-0.5 transition ${speed === s ? 'bg-white/15 text-white' : 'text-zinc-400 hover:text-white'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Readout({ k, v, warn }: { k: string; v: string; warn?: boolean }) {
  return (
    <div>
      <div className="font-sans text-[9px] uppercase tracking-[0.18em] text-zinc-500">{k}</div>
      <div className={`text-lg leading-tight ${warn ? 'text-amber-300' : 'text-zinc-100'}`}>{v}</div>
    </div>
  );
}
