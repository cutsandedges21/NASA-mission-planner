// Runs the planner off the main thread so the map never freezes.
// The planner lives in /planner (Teammate's module, pure ES), shared with its Node tests.
import { planMission } from '../../planner/src/plan.js';

self.onmessage = (e: MessageEvent) => {
  const { id, args } = e.data;
  try {
    const routes = planMission(args);
    (self as unknown as Worker).postMessage({ id, routes });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: String((err as Error)?.message ?? err) });
  }
};
