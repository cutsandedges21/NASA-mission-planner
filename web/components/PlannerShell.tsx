'use client';

import dynamic from 'next/dynamic';

// MapLibre needs the browser, so the planner is client-only.
const MissionPlanner = dynamic(() => import('./MissionPlanner'), {
  ssr: false,
  loading: () => (
    <div className="flex h-dvh items-center justify-center bg-[#07080a] text-sm tracking-widest text-orange-300/70">
      LOADING MARS…
    </div>
  ),
});

export default function PlannerShell() {
  return <MissionPlanner />;
}
