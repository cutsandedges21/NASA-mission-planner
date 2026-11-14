'use client';

// First-person rover / astronaut view for Simulate Mission (the renderer lives in lib/rover-scene.ts and is loaded
// on demand, so three.js never weighs on the map screen). This component is the camera's driver and its cockpit:
// canvas, drag-to-look, heading compass, site labels that follow the 3D positions, instruments, and the rover deck.
// All styling is plain Tailwind + inline SVG, so the visual pass can restyle it freely.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Frame, makePathLocator } from '@/lib/mission-timeline';
import type { PlannedRoute } from '@/lib/plan-client';
import type { Poi, Region } from '@/lib/region';
import { MARS_HOUR_S } from '@/lib/mars-context';
import { marsTime, sunPosition } from '@/lib/marstime.js';
import type { RoverScene, ViewState } from '@/lib/rover-scene';

type Locator = ReturnType<typeof makePathLocator>;

const PX_PER_DEG = 7;
const CARDINALS: Record<number, string> = { 0: 'N', 45: 'NE', 90: 'E', 135: 'SE', 180: 'S', 225: 'SW', 270: 'W', 315: 'NW' };
const TICKS = Array.from({ length: 108 }, (_, k) => k * 10 - 360); // −360° … 710°: three turns so the tape never runs out

const fmtDist = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(1)} km` : `${Math.round(m)} m`);
const compass = (deg: number) => ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'][Math.round((((deg % 360) + 360) % 360) / 45) % 8];

type Pin = { id: string; name: string; x: number; z: number; color: string; kind: 'base' | 'site' | 'target' };

export default function RoverView({
  region,
  route,
  locator,
  color,
  pois,
  baseName,
  startH,
  register,
  onExit,
}: {
  region: Region;
  route: PlannedRoute;
  locator: Locator;
  color: string;
  pois: Poi[];
  baseName: string;
  startH: number;
  /** Hands the simulation's per-frame callback to this view (and takes it back with null). */
  register: (handler: ((f: Frame) => void) | null) => void;
  onExit: () => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const tape = useRef<HTMLDivElement>(null);
  const deck = useRef<SVGSVGElement>(null);
  const labels = useRef<Record<string, HTMLDivElement | null>>({});
  const readout = useRef<{ speed: HTMLElement | null; head: HTMLElement | null; tilt: HTMLElement | null; range: HTMLElement | null }>({ speed: null, head: null, tilt: null, range: null });
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [message, setMessage] = useState('');
  const mode = route.budget?.mode === 'rover' ? 'rover' : 'foot';

  // pins: the base, every science site, and the route's end if it isn't one of them
  const pins = useMemo<Pin[]>(() => {
    const m = region.meta;
    const W = m.width * m.cellM[0];
    const H = m.height * m.cellM[1];
    const toM = (lon: number, lat: number): [number, number] => [((lon - m.lon[0]) / (m.lon[1] - m.lon[0])) * W, ((m.lat[1] - lat) / (m.lat[1] - m.lat[0])) * H];
    const pts = locator.metresPts;
    const first = pts[0];
    const last = pts[pts.length - 1];
    const list: Pin[] = [{ id: 'base', name: baseName, x: first[0], z: first[1], color: '#ffffff', kind: 'base' }];
    let endIsSite = false;
    for (const p of pois) {
      const [x, z] = toM(p.lon, p.lat);
      const isEnd = Math.hypot(x - last[0], z - last[1]) < 60;
      endIsSite = endIsSite || isEnd;
      list.push({ id: p.id, name: p.name, x, z, color: isEnd ? '#fb923c' : '#a78bfa', kind: isEnd ? 'target' : 'site' });
    }
    if (!endIsSite) list.push({ id: 'target', name: 'Target', x: last[0], z: last[1], color: '#fb923c', kind: 'target' });
    return list;
  }, [region, locator, pois, baseName]);
  const sceneRef = useRef<RoverScene | null>(null);

  useEffect(() => {
    let disposed = false;
    let raf = 0;
    let scene: RoverScene | null = null;
    let ro: ResizeObserver | null = null;
    const size = { w: 1, h: 1 };
    const m = region.meta;
    const lat = (m.lat[0] + m.lat[1]) / 2;
    const decl = marsTime().decl as number;
    const sunAt = (tau: number) => sunPosition(lat, startH + tau / MARS_HOUR_S, decl) as { azimuth: number; elevation: number };

    // state the simulation's frames write and the render loop reads
    const st = {
      view: null as ViewState | null,
      working: false,
      lastTau: -1,
      lastD: 0,
      speed: 0,
      heading: 0,
      tau: 0,
      d: 0,
    };

    const handle = (f: Frame) => {
      const [x, z] = locator.metres(f.d);
      const a = locator.metres(f.d - 8);
      const b = locator.metres(f.d + 50);
      if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 1) st.heading = Math.atan2(b[0] - a[0], -(b[1] - a[1]));
      if (st.lastTau >= 0 && f.tau > st.lastTau + 1e-6) st.speed += ((f.d - st.lastD) / (f.tau - st.lastTau) - st.speed) * 0.15;
      if (f.phase === 'working') st.speed *= 0.9;
      st.lastTau = f.tau;
      st.lastD = f.d;
      st.tau = f.tau;
      st.d = f.d;
      st.working = f.phase === 'working';
      const returning = f.d > locator.oneWay;
      const sun = sunAt(f.tau);
      st.view = {
        x,
        z,
        heading: st.heading,
        speed: Math.max(0, st.speed),
        sRoute: returning ? 2 * locator.oneWay - f.d : f.d,
        dir: returning ? -1 : 1,
        sunAzDeg: sun.azimuth,
        sunElDeg: sun.elevation,
      };
    };

    (async () => {
      try {
        const { RoverScene } = await import('@/lib/rover-scene');
        if (disposed || !canvas.current) return;
        scene = new RoverScene({
          canvas: canvas.current,
          elev: region.elev,
          w: m.width,
          h: m.height,
          cellX: m.cellM[0],
          cellY: m.cellM[1],
          fineSlope: region.fineSlope,
          textureUrl: region.url('visible.jpg'),
          routePts: locator.metresPts,
          routeCum: locator.cum,
          routeColor: color,
          beacons: pins.map((p) => ({ ...p })),
          mode,
        });
        sceneRef.current = scene;
        const first = sunAt(0);
        scene.setSun(first.azimuth, first.elevation);
        const apply = () => {
          const el = wrap.current;
          if (!el || !scene) return;
          size.w = el.clientWidth;
          size.h = el.clientHeight;
          scene.setSize(size.w, size.h);
        };
        apply();
        ro = new ResizeObserver(apply);
        if (wrap.current) ro.observe(wrap.current);
        register(handle);
        await scene.ready;
        if (disposed) return;
        setStatus('ready');

        let last = performance.now();
        const tick = (now: number) => {
          raf = requestAnimationFrame(tick);
          const s = scene!;
          const dt = (now - last) / 1000;
          last = now;
          if (st.view) s.setView(st.view);
          s.autoYaw = st.working && !s.dragging ? Math.sin(now / 1000 * 0.55) * 0.7 : 0;
          s.render(dt);

          // overlays: compass tape, site labels, instruments, deck shake
          const lookDeg = ((-s.camera.rotation.y * 180) / Math.PI + 360 * 4) % 360; // where the camera actually points
          if (tape.current) tape.current.style.transform = `translateX(${-(lookDeg + 360) * PX_PER_DEG}px)`;
          for (const p of pins) {
            const el = labels.current[p.id];
            if (!el) continue;
            const gy = s.field.heightAt(p.x, p.z) + 9;
            const pr = s.project(p.x, gy, p.z, size.w, size.h);
            if (pr.visible && pr.dist < 7500 && pr.dist > 15) {
              el.style.opacity = String(Math.max(0.25, 1 - pr.dist / 8000));
              el.style.transform = `translate(${pr.sx}px, ${pr.sy}px) translate(-50%, -100%)`;
              const dist = el.querySelector('[data-dist]');
              if (dist) dist.textContent = fmtDist(pr.dist);
            } else el.style.opacity = '0';
          }
          const att = s.attitude();
          const r = readout.current;
          if (r.speed) r.speed.textContent = `${(st.view?.speed ?? 0).toFixed(1)} m/s`;
          if (r.head) r.head.textContent = `${String(Math.round(lookDeg)).padStart(3, '0')}° ${compass(lookDeg)}`;
          if (r.tilt) r.tilt.textContent = `${att.pitch + 4 >= 0 ? '+' : ''}${(att.pitch + (mode === 'rover' ? 4 : 1.7)).toFixed(1)}° / ${att.roll >= 0 ? '+' : ''}${att.roll.toFixed(1)}°`;
          if (r.range) {
            const end = locator.metresPts[locator.metresPts.length - 1];
            const v = st.view;
            r.range.textContent = v ? fmtDist(Math.hypot(end[0] - v.x, end[1] - v.z)) : '—';
          }
          if (deck.current) {
            const k = Math.min(1.2, (st.view?.speed ?? 0) / 1.4);
            deck.current.style.transform = `translate(${Math.sin(now / 130) * 0.9 * k}px, ${Math.sin(now / 53) * 1.4 * k}px)`;
          }
        };
        raf = requestAnimationFrame(tick);
      } catch (e) {
        if (disposed) return;
        setStatus('error');
        setMessage(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      register(null);
      ro?.disconnect();
      sceneRef.current = null;
      scene?.dispose();
    };
    // the view is rebuilt when the route, region or mode changes; startH only feeds the sun (read through `handle`)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region, route, locator, color, mode, pins]);

  // Escape leaves the view
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  // drag to look around (the view eases back when you let go)
  const drag = useRef<{ x: number; y: number } | null>(null);

  return (
    <div
      ref={wrap}
      className="absolute inset-0 z-[5] select-none overflow-hidden bg-[#2a1810]"
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY };
        e.currentTarget.setPointerCapture(e.pointerId);
        if (sceneRef.current) sceneRef.current.dragging = true;
      }}
      onPointerMove={(e) => {
        const s = sceneRef.current;
        if (!drag.current || !s) return;
        s.look.yaw = Math.max(-1.3, Math.min(1.3, s.look.yaw + (e.clientX - drag.current.x) * 0.004));
        s.look.pitch = Math.max(-0.55, Math.min(0.55, s.look.pitch + (e.clientY - drag.current.y) * 0.003));
        drag.current = { x: e.clientX, y: e.clientY };
      }}
      onPointerUp={() => {
        drag.current = null;
        if (sceneRef.current) sceneRef.current.dragging = false;
      }}
    >
      <canvas ref={canvas} className="h-full w-full" />

      {/* edge vignette */}
      <div className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(ellipse at 50% 45%, transparent 55%, rgba(8,4,2,0.55) 100%)' }} />

      {/* heading compass */}
      <div className="pointer-events-none absolute bottom-[21%] left-1/2 h-10 w-[480px] -translate-x-1/2 overflow-hidden" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 22%, #000 78%, transparent)' }}>
        <div ref={tape} className="absolute left-1/2 top-0 h-full will-change-transform" style={{ width: TICKS.length * 10 * PX_PER_DEG }}>
          {TICKS.map((deg) => {
            const d = ((deg % 360) + 360) % 360;
            const major = d % 30 === 0;
            return (
              <div key={deg} className="absolute top-0 flex -translate-x-1/2 flex-col items-center" style={{ left: (deg + 360) * PX_PER_DEG }}>
                <div className={`w-px ${major ? 'h-3.5 bg-white/80' : 'h-2 bg-white/40'}`} />
                {major && <div className={`mt-0.5 font-mono text-[10px] ${CARDINALS[d] ? 'font-semibold text-[#f5c84b]' : 'text-white/70'}`}>{CARDINALS[d] ?? d}</div>}
              </div>
            );
          })}
        </div>
        <div className="absolute left-1/2 top-0 h-4 w-0.5 -translate-x-1/2 bg-[#f5c84b]" />
      </div>

      {/* instruments */}
      <div className="pointer-events-none absolute bottom-[8%] left-1/2 flex -translate-x-1/2 gap-6 rounded-xl bg-black/45 px-5 py-2 font-mono text-[11px] text-white/85 backdrop-blur-sm">
        <Gauge k="Speed" r={(el) => {
            readout.current.speed = el;
          }} />
        <Gauge k="Heading" r={(el) => {
            readout.current.head = el;
          }} />
        <Gauge k="Pitch / roll" r={(el) => {
            readout.current.tilt = el;
          }} />
        <Gauge k="To target" r={(el) => {
            readout.current.range = el;
          }} />
      </div>

      {/* site labels, positioned in 3D every frame */}
      {pins.map((p) => (
        <div key={p.id} ref={(el) => void (labels.current[p.id] = el)} className="pointer-events-none absolute left-0 top-0 opacity-0 will-change-transform">
          <div className="flex flex-col items-center">
            <div className="whitespace-nowrap rounded-md px-2 py-0.5 text-[11px] font-semibold text-black shadow-lg" style={{ background: p.color }}>
              {p.name}
            </div>
            <div data-dist className="mt-0.5 font-mono text-[10px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)]" />
            <div className="h-5 w-px" style={{ background: p.color }} />
          </div>
        </div>
      ))}

      {/* rover deck (open-seat unpressurised rover) or plain visor */}
      {mode === 'rover' ? (
        <svg ref={deck} className="pointer-events-none absolute inset-x-0 bottom-0 h-[24%] w-full will-change-transform" viewBox="0 0 1600 260" preserveAspectRatio="xMidYMax slice" aria-hidden>
          <defs>
            <linearGradient id="deck" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#34343a" />
              <stop offset="0.35" stopColor="#1c1c20" />
              <stop offset="1" stopColor="#09090b" />
            </linearGradient>
            <linearGradient id="fender" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#2b2b31" />
              <stop offset="1" stopColor="#0e0e10" />
            </linearGradient>
          </defs>
          <path d="M0 262 L0 196 Q400 154 800 150 Q1200 154 1600 196 L1600 262 Z" fill="url(#deck)" />
          <path d="M0 196 Q400 154 800 150 Q1200 154 1600 196" fill="none" stroke="#6b6b75" strokeWidth="2" opacity="0.55" />
          <path d="M0 200 Q70 118 210 114 Q330 114 372 172 L372 210 L0 232 Z" fill="url(#fender)" stroke="#45454d" strokeWidth="1.5" />
          <path d="M1600 200 Q1530 118 1390 114 Q1270 114 1228 172 L1228 210 L1600 232 Z" fill="url(#fender)" stroke="#45454d" strokeWidth="1.5" />
          <g transform="translate(800 206)">
            <rect x="-7" y="-26" width="14" height="48" rx="6" fill="#26262b" stroke="#4d4d56" />
            <rect x="-82" y="-36" width="164" height="16" rx="8" fill="#2c2c32" stroke="#555560" />
          </g>
          <rect x="96" y="26" width="6" height="118" fill="#2d2d33" />
          <circle cx="99" cy="26" r="24" fill="none" stroke="#45454d" strokeWidth="3" />
          <circle cx="99" cy="26" r="9" fill="#1d1d21" stroke="#5a5a64" />
        </svg>
      ) : (
        <div className="pointer-events-none absolute inset-0" style={{ boxShadow: 'inset 0 0 160px 40px rgba(0,0,0,0.55)' }} />
      )}

      {status === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-[#1b100a]/85 text-sm tracking-[0.3em] text-[#f5c84b]">LANDING ON MARS…</div>
      )}
      {status === 'error' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-[#1b100a] px-6 text-center text-sm text-zinc-200">
          <div className="text-base font-semibold text-red-300">Rover view needs WebGL</div>
          <div className="max-w-md text-xs text-zinc-400">{message}</div>
          <button onClick={onExit} className="rounded-full bg-white px-4 py-1.5 text-xs font-semibold text-black">
            Back to the map
          </button>
        </div>
      )}
    </div>
  );
}

function Gauge({ k, r }: { k: string; r: (el: HTMLElement | null) => void }) {
  return (
    <div className="text-center">
      <div className="font-sans text-[9px] uppercase tracking-[0.18em] text-white/45">{k}</div>
      <div ref={r} className="text-[13px] text-white">
        —
      </div>
    </div>
  );
}
