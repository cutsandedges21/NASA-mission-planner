'use client';

import dynamic from 'next/dynamic';
import Loading from './Loading';

// MapLibre needs the browser, so the planner is client-only.
const MissionPlanner = dynamic(() => import('./MissionPlanner'), {
  ssr: false,
  loading: () => <Loading />,
});

export default function PlannerShell() {
  return <MissionPlanner />;
}
