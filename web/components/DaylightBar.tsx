'use client';

import { hm, type Daylight } from '@/lib/mars-context';
import type { Strategy } from '@/lib/plan-client';

const pct = (h: number) => `${Math.min(100, Math.max(0, (h / 24) * 100))}%`;

/** 24 h strip: night / day, and each route's EVA window from leaving the airlock to getting back. */
export default function DaylightBar({
  rise,
  set,
  startH,
  onStart,
  windows,
  colors,
  selected,
}: {
  rise: number;
  set: number;
  startH: number;
  onStart: (h: number) => void;
  windows: { strategy: Strategy; d: Daylight | null }[];
  colors: Record<Strategy, string>;
  selected: Strategy;
}) {
  return (
    <section>
      <div className="flex items-baseline justify-between">
        <h2 className="eyebrow">EVA start</h2>
        <span className="font-mono text-sm text-zinc-100">{hm(startH)}</span>
      </div>
      <input
        type="range"
        min={Math.ceil(rise * 4) / 4}
        max={Math.floor((set - 1) * 4) / 4}
        step={0.25}
        value={startH}
        onChange={(e) => onStart(+e.target.value)}
        className="mt-2 w-full accent-orange-400"
        aria-label="EVA start time, local solar time"
      />
      <div className="relative mt-2 h-9 overflow-hidden rounded-lg bg-[#05060a]">
        <div className="absolute inset-y-0 bg-gradient-to-r from-orange-300/10 via-orange-200/20 to-orange-300/10" style={{ left: pct(rise), width: `calc(${pct(set)} - ${pct(rise)})` }} />
        {windows.map(({ strategy, d }, i) =>
          d ? (
            <div
              key={strategy}
              className="absolute rounded-full transition-all"
              style={{
                left: pct(d.startH),
                width: `calc(${pct(d.endH)} - ${pct(d.startH)})`,
                top: 6 + i * 9,
                height: strategy === selected ? 6 : 3,
                background: colors[strategy],
                opacity: strategy === selected ? 1 : 0.45,
              }}
            />
          ) : null,
        )}
      </div>
      <div className="mt-1 flex justify-between font-mono text-[10px] text-zinc-500">
        <span>sunrise {hm(rise)}</span>
        <span>local solar time</span>
        <span>sunset {hm(set)}</span>
      </div>
    </section>
  );
}
