'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { EVA_DEFAULTS } from '../../planner/src/eva.js';
import { hm, MARS_HOUR_S } from '@/lib/mars-context';
import type { Frame, Mission } from '@/lib/mission-timeline';
import type { PlannedRoute, Strategy } from '@/lib/plan-client';
import type { Poi } from '@/lib/region';
import DotNum from './ui/DotNum';
import { IPlay } from './map/icons';

const SPEEDS = [1, 2, 4] as const;
const START_DELAY = 0.9; // seconds: lets the camera settle on the base before the walk begins

const two = (n: number) => String(Math.max(0, Math.floor(n))).padStart(2, '0');
const fmtKm = (m: number) => (m / 1000).toFixed(1);

/**
 * Playback controls and live readouts for "Simulate Mission". It owns the animation clock; the map
 * (marker, trail, camera) is driven through onFrame so the planner screen doesn't re-render every frame.
 *
 * Look (chat B, T-16): the countdown block of the "Flight to Mars" reference (red rule, small label,
 * big digits in ruled boxes), the dashboard reference's dot-grid gauge for oxygen, and the Spherium gold
 * slider / round white play button for the controls.
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

  const DOTS = 40;
  const lit = Math.round((o2Left / 100) * DOTS);
  const resDot = Math.round((reserve / 100) * DOTS);
  const lh = ((localH % 24) + 24) % 24;

  return (
    <div className="sim">
      {/* header: red rule + label, phase chip, close */}
      <div className="flex items-center justify-between gap-3">
        <div className="sim-k">
          <i style={{ background: color }} />
          MISSION SIMULATION · {label.toUpperCase()}
        </div>
        <div className="flex items-center gap-2">
          <span className="sim-phase">{phase}</span>
          <button onClick={onClose} aria-label="Close simulation" className="sim-x">
            ✕
          </button>
        </div>
      </div>

      {/* big ruled digits */}
      <div className="mt-3 flex items-end gap-2.5">
        <Box k="T+ HOURS" v={two(frame.tau / 3600)} />
        <Box k="MINUTES" v={two((frame.tau % 3600) / 60)} />
        <span className="sim-sep" />
        <Box k="LOCAL TIME" v={hm(lh)} warn={nearSunset} wide />
        <Box k="KM WALKED" v={fmtKm(frame.d)} sub={`/ ${fmtKm(mission.total)}`} wide />
        <div className="ml-auto text-right">
          <div className="sim-box-k">OXYGEN LEFT</div>
          <DotNum text={`${o2Left.toFixed(0)}%`} height={30} color={lowO2 ? '#fbbf24' : '#ffffff'} />
        </div>
      </div>

      {/* oxygen dot gauge, gold dot = 25 % airlock reserve */}
      <div className="sim-dots" title={`${reserve} % must remain at the airlock`}>
        {Array.from({ length: DOTS }).map((_, i) => (
          <i key={i} data-on={i < lit} data-res={i === resDot - 1} style={i < lit ? { background: lowO2 ? '#fbbf24' : color, borderColor: lowO2 ? '#fbbf24' : color } : undefined} />
        ))}
      </div>

      {stop && (
        <div className="sim-stop">
          <div className="flex items-baseline justify-between gap-3">
            <div className="text-[14px] font-semibold">{stop.name}</div>
            <div className="font-mono text-[10px] text-white/70">SAMPLING · {Math.round(frame.stopProgress * 100)} %</div>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/85">{stop.why}</p>
          <p className="mt-1 text-[10px] text-white/55">
            Source: {stop.source}
            {stop.approx ? ' (position approximate)' : ''}
          </p>
        </div>
      )}
      {done && (
        <div className="sim-done">
          Back at the airlock after {two(mission.totalT / 3600)}:{two((mission.totalT % 3600) / 60)} with {Math.max(0, route.budget.marginPct).toFixed(0)} % oxygen
          {route.budget.doseMSv !== undefined ? ` and ${route.budget.doseMSv.toFixed(2)} mSv of radiation.` : '.'}
        </div>
      )}

      {/* controls */}
      <div className="mt-3.5 flex items-center gap-3">
        <button onClick={toggle} className="sim-play" aria-label={done ? 'Replay' : playing ? 'Pause' : 'Play'} title={done ? 'Replay' : playing ? 'Pause' : 'Play'}>
          {playing && !done ? <span className="sim-pause" /> : done ? '↺' : <IPlay size={15} />}
        </button>
        <input
          type="range"
          min={0}
          max={mission.duration}
          step={0.05}
          value={Math.max(0, u)}
          onChange={(e) => seek(+e.target.value)}
          className="sp-range flex-1"
          aria-label="Playback position"
        />
        <div className="flex items-center gap-0.5 rounded-full border border-white/10 bg-black/40 p-0.5 text-[11px]">
          {SPEEDS.map((s) => (
            <button key={s} onClick={() => setSpeed(s)} className={`rounded-full px-2.5 py-1 transition ${speed === s ? 'bg-white text-black' : 'text-zinc-400 hover:text-white'}`}>
              {s}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Box({ k, v, sub, warn, wide }: { k: string; v: string; sub?: string; warn?: boolean; wide?: boolean }) {
  return (
    <div className={`sim-box ${wide ? 'min-w-[86px]' : ''}`}>
      <span className="sim-box-k">{k}</span>
      <span className={`sim-box-n ${warn ? 'text-amber-300' : ''}`}>
        {v}
        {sub && <span className="sim-box-sub">{sub}</span>}
      </span>
    </div>
  );
}
