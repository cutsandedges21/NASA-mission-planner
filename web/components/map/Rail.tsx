'use client';

// Cards that start small and grow, the way the rover view's mission card grows out of its pill
// (Justin, Sun 15 Nov): hover a card to open it, or press its arrow. The right-hand column (Safe route,
// Fast route, Mission simulator) opens one card at a time: the open card takes the column's free height,
// so the others shrink back to their small size. The left EVA Planner panel uses the same hook (useGrow).
//
// Rules, shared by every card:
// - hover opens it (after a short pause, so passing over a card doesn't open it);
// - leaving closes it again, unless it was kept open: pressing its arrow, or clicking the card, keeps it open;
// - pressing the arrow of an open card folds it, and hover won't reopen it until the pointer has left.
import { createContext, useCallback, useContext, useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from 'react';
import { IChevDown } from './icons';

const OPEN_DELAY_MS = 140;
const CLOSE_DELAY_MS = 260;

/** Open / keep-open / fold logic for a set of cards where at most one is open (ids are the cards' names). */
export function useGrow(initial: string | null = null) {
  const [kept, setKept] = useState<string | null>(initial);
  const [hover, setHover] = useState<string | null>(null);
  const lock = useRef<string | null>(null); // folded by its arrow while the pointer was on it
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  };
  useEffect(() => () => clearTimeout(timer.current), []);
  const openId = hover ?? kept;

  const enter = (id: string) => {
    if (lock.current === id) {
      clearTimeout(timer.current);
      return;
    }
    lock.current = null;
    later(() => setHover(id), openId === id ? 0 : OPEN_DELAY_MS);
  };
  /** The pointer left (the column, or the panel). `stay` keeps it open, e.g. while typing in it. */
  const leave = (stay = false) => {
    lock.current = null;
    if (stay) return clearTimeout(timer.current);
    later(() => setHover(null), CLOSE_DELAY_MS);
  };
  const keep = (id: string) => {
    clearTimeout(timer.current);
    setKept(id);
    setHover(null);
  };
  const toggle = (id: string) => {
    clearTimeout(timer.current);
    if (openId === id) {
      setKept(null);
      setHover(null);
      lock.current = id;
    } else {
      setKept(id);
      setHover(null);
    }
  };
  return { openId, enter, leave, keep, toggle };
}

type Grow = ReturnType<typeof useGrow>;
const RailCtx = createContext<Grow | null>(null);

/** The right-hand column. Children are RailCards. */
export function Rail({ children }: { children: ReactNode }) {
  const grow = useGrow();
  return (
    <RailCtx.Provider value={grow}>
      <aside className="rc-col" onMouseLeave={() => grow.leave()} data-testid="rail">
        {children}
      </aside>
    </RailCtx.Provider>
  );
}

/** Round arrow button: points down when the card is small, up when it's open. */
export function GrowArrow({ open, onClick, label, className = 'rc-btn' }: { open: boolean; onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      className={`${className} grow-arrow`}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      aria-expanded={open}
      aria-label={open ? `Shrink ${label}` : `Open ${label}`}
      title={open ? 'Shrink' : 'Open'}
      data-open={open}
    >
      <IChevDown size={15} />
    </button>
  );
}

/**
 * One card in the right-hand column. Small: the title, a one-line summary and `side` (e.g. the verdict chip).
 * Open: the title, `sub`, and the children.
 */
export function RailCard({
  id,
  title,
  sub,
  summary,
  side,
  onSelect,
  pressed,
  className = '',
  style,
  children,
  testId,
}: {
  id: string;
  title: ReactNode;
  /** Line under the title when the card is open. */
  sub?: ReactNode;
  /** Line under the title when the card is small (defaults to `sub`). */
  summary?: ReactNode;
  /** Shown next to the arrow when the card is small. */
  side?: ReactNode;
  /** Clicking the card (anywhere but the arrow) calls this and keeps the card open. */
  onSelect?: () => void;
  pressed?: boolean;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
  testId?: string;
}) {
  const grow = useContext(RailCtx);
  if (!grow) throw new Error('RailCard must be inside a Rail');
  const open = grow.openId === id;
  const select = useCallback(() => {
    onSelect?.();
    grow.keep(id);
  }, [onSelect, grow, id]);
  const onKey = (e: KeyboardEvent) => {
    if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    select();
  };
  return (
    <div
      role="button"
      tabIndex={0}
      aria-pressed={pressed}
      aria-expanded={open}
      className={`rc ${open ? 'rc-open' : ''} ${className}`}
      style={style}
      onMouseEnter={() => grow.enter(id)}
      onClick={select}
      onKeyDown={onKey}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold">{title}</div>
          <div className="mt-0.5 truncate text-[11.5px] text-white/65">{open ? sub : summary ?? sub}</div>
        </div>
        {!open && side}
        <GrowArrow open={open} onClick={() => grow.toggle(id)} label={typeof title === 'string' ? title : 'card'} />
      </div>
      <div className="rc-main" inert={!open} aria-hidden={!open}>
        {children}
      </div>
    </div>
  );
}
