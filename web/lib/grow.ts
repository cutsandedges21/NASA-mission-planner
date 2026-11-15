// How a card grows out of a pill and goes back into it. Copied from Moss's Island app
// (windows-dynamic-island, src/core/grow.ts), unchanged, so the simulation card moves exactly like
// Island's cards (Moss, Sat 14 Nov: "start as a pill that can expand", like Island's expand card).

/** How long a card takes to grow out of the pill, and to close back into it. */
export const GROW_MS = 340;

/** A grown card's size changes after that (new content, a wider view): critically damped, no overshoot. */
export const GROW_SPRING = { response: 0.4, damping: 1 };

/**
 * The grown card's move, 0 → 1 over u = 0 → 1: a critically damped spring's own curve
 * (GROW_SPRING) cut off at GROW_MS and stretched to land exactly on 1. It springs out fast and
 * eases into place, and stops: no tail creeping the last pixel, no overshoot settling back.
 */
export function growCurve(u: number): number {
  const T = GROW_MS / 1000;
  const omega = (2 * Math.PI) / GROW_SPRING.response;
  const f = (t: number) => 1 - (1 + omega * t) * Math.exp(-omega * t);
  return f(Math.max(0, Math.min(1, u)) * T) / f(T);
}

/**
 * The close is the grow played backwards: it starts gently, speeds up into the pill and lands
 * there. A spring back would ease in too, and creep the last pixels into the pill.
 */
export function closeCurve(u: number): number {
  return 1 - growCurve(1 - u);
}
