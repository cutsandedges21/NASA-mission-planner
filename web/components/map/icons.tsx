// Minimal line icons (24×24, stroke = currentColor), drawn to match the references' thin icon style.
type P = { className?: string; size?: number };
const S = ({ size = 16, className, children }: P & { children: React.ReactNode }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    {children}
  </svg>
);

export const IArrowUR = (p: P) => (
  <S {...p}>
    <path d="M7 17 17 7M8 7h9v9" />
  </S>
);
export const IChevDown = (p: P) => (
  <S {...p}>
    <path d="m6 9 6 6 6-6" />
  </S>
);
export const IChevUp = (p: P) => (
  <S {...p}>
    <path d="m6 15 6-6 6 6" />
  </S>
);
export const IPlay = (p: P) => (
  <S {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </S>
);
export const ISun = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </S>
);
export const IPin = (p: P) => (
  <S {...p}>
    <path d="M12 21s-7-6.2-7-11.5a7 7 0 1 1 14 0C19 14.8 12 21 12 21z" />
    <circle cx="12" cy="9.5" r="2.5" />
  </S>
);
export const ICrosshair = (p: P) => (
  <S {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-4-4" />
  </S>
);
export const ILayers = (p: P) => (
  <S {...p}>
    <path d="m12 3 9 5-9 5-9-5 9-5z" />
    <path d="m3 13 9 5 9-5" />
  </S>
);
export const ICube = (p: P) => (
  <S {...p}>
    <path d="m12 2 9 5v10l-9 5-9-5V7z" />
    <path d="m3 7 9 5 9-5M12 12v10" />
  </S>
);
export const IBell = (p: P) => (
  <S {...p}>
    <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.9 1.9 0 0 0 3.4 0" />
  </S>
);
export const IRadio = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="2" />
    <path d="M16.2 7.8a6 6 0 0 1 0 8.4M7.8 16.2a6 6 0 0 1 0-8.4M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" />
  </S>
);
export const IShield = (p: P) => (
  <S {...p}>
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
  </S>
);
export const IBolt = (p: P) => (
  <S {...p}>
    <path d="M13 2 3 14h9l-1 8 10-12h-9z" />
  </S>
);
export const IFlask = (p: P) => (
  <S {...p}>
    <path d="M9 3h6M10 3v6L4.5 19a1.5 1.5 0 0 0 1.3 2h12.4a1.5 1.5 0 0 0 1.3-2L14 9V3" />
    <path d="M7 15h10" />
  </S>
);
export const IGrid = (p: P) => (
  <S {...p}>
    <rect x="4" y="4" width="6" height="6" rx="1.5" />
    <rect x="14" y="4" width="6" height="6" rx="1.5" />
    <rect x="4" y="14" width="6" height="6" rx="1.5" />
    <rect x="14" y="14" width="6" height="6" rx="1.5" />
  </S>
);
export const IGlobe = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" />
  </S>
);
export const IInfo = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </S>
);
export const IClock = (p: P) => (
  <S {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </S>
);
export const ISwap = (p: P) => (
  <S {...p}>
    <path d="M4 8h14l-3-3M20 16H6l3 3" />
  </S>
);

export const STRATEGY_ICON = { SAFE: IShield, FAST: IBolt, SCIENCE: IFlask } as const;
