'use client';

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { closeCurve, GROW_MS, growCurve } from '@/lib/grow';

/** The card's corner radius when fully open (matches the old `.sim` card). */
const CARD_R = 22;

const ease = (a: number, b: number, x: number) => {
  const u = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return u * u * (3 - 2 * u);
};

/**
 * A card that grows out of a pill and shrinks back into it, the way Moss's Island app grows its
 * cards (windows-dynamic-island, src/core/sheet.ts `grow` / `close` / `placeGrown`):
 * - one glass shape goes from the pill's box to the card's box in a fixed GROW_MS, on Island's
 *   spring curve (growCurve); the close is the same move played backwards (closeCurve);
 * - the card's content stays laid out at full size and is only clipped to the shape and scaled
 *   with it from the top edge, so it grows out of the pill instead of re-wrapping every frame;
 * - growing, the pill's own content fades out at once and the card's fades in with the shape;
 *   closing, the card's content fades over most of the way back and the pill's fades in over the
 *   last part (Island: 0.1–0.85 and 0.55–1 of the way), so the two barely overlap.
 * Top-anchored and centred: it hangs from the top edge of the box it is placed in.
 */
export default function PillCard({ open, pill, children }: { open: boolean; pill: ReactNode; children: ReactNode }) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ fw: 0, fh: 0, pw: 0, ph: 0 });
  const [qAnim, setQ] = useState(open ? 1 : 0); // 0 = pill, 1 = card
  const qRef = useRef(qAnim);
  // Reduced motion: no move at all, it is simply the pill or the card.
  const [reduced] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const closing = !open;

  // Sizes of the full card and of the pill (both change: a science-stop card appears, digits change).
  useLayoutEffect(() => {
    const body = bodyRef.current;
    const pl = pillRef.current;
    if (!body || !pl) return;
    const read = () => {
      const n = { fw: body.offsetWidth, fh: body.offsetHeight, pw: pl.offsetWidth, ph: pl.offsetHeight };
      setBox((b) => (Math.abs(b.fw - n.fw) < 0.5 && Math.abs(b.fh - n.fh) < 0.5 && Math.abs(b.pw - n.pw) < 0.5 && Math.abs(b.ph - n.ph) < 0.5 ? b : n));
    };
    read();
    const ro = new ResizeObserver(read);
    ro.observe(body);
    ro.observe(pl);
    return () => ro.disconnect();
  }, []);

  // Grow or close in a fixed time; interrupted halfway, it turns around from where it got to.
  useEffect(() => {
    const target = open ? 1 : 0;
    if (reduced || qRef.current === target) return;
    const q0 = qRef.current;
    const start = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / GROW_MS);
      const v = open ? q0 + (1 - q0) * growCurve(u) : q0 * (1 - closeCurve(u));
      qRef.current = v;
      setQ(v);
      if (u < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [open, reduced]);

  const q = reduced ? (open ? 1 : 0) : qAnim;
  const { fw, fh, pw, ph } = box;
  const measured = fw > 0 && fh > 0 && pw > 0 && ph > 0;
  const vw = measured ? pw + (fw - pw) * q : fw;
  const vh = measured ? ph + (fh - ph) * q : fh;
  const lx = (fw - vw) / 2;
  const r = ph / 2 + (CARD_R - ph / 2) * q;
  const k = fw > 0 ? vw / fw : 1;
  const bodyO = closing ? 1 - ease(0.1, 0.85, 1 - q) : ease(0.1, 0.7, q);
  const pillO = closing ? ease(0.55, 1, 1 - q) : 1 - ease(0, 0.3, q);
  const cardLive = q > 0.5;

  return (
    <div className="relative" style={{ height: measured ? vh : undefined }}>
      {/* the one glass shape: the pill's box at q = 0, the card's at q = 1 */}
      <div
        aria-hidden
        className="sim-shape"
        style={measured ? { left: lx, top: 0, width: vw, height: vh, borderRadius: r } : { inset: 0, borderRadius: open ? CARD_R : 9999 }}
      />
      {/* the card's content: full size, clipped to the shape, scaled with it from the top edge */}
      <div
        className="absolute inset-x-0 top-0"
        style={{
          clipPath: measured && q < 0.999 ? `inset(0px ${lx.toFixed(2)}px ${(fh - vh).toFixed(2)}px ${lx.toFixed(2)}px round ${r.toFixed(2)}px)` : undefined,
          visibility: q <= 0.001 ? 'hidden' : undefined,
          pointerEvents: cardLive ? undefined : 'none',
        }}
        aria-hidden={!cardLive}
        inert={!cardLive}
      >
        <div ref={bodyRef} style={{ transform: k < 0.999 ? `scale(${k.toFixed(4)})` : undefined, transformOrigin: '50% 0', opacity: bodyO }}>
          {children}
        </div>
      </div>
      {/* the pill's own content, centred on the top edge */}
      <div
        ref={pillRef}
        className="absolute left-1/2 top-0 -translate-x-1/2"
        style={{ opacity: pillO, visibility: pillO < 0.01 ? 'hidden' : undefined, pointerEvents: cardLive ? 'none' : undefined }}
        aria-hidden={cardLive}
        inert={cardLive}
      >
        {pill}
      </div>
    </div>
  );
}
