// Runs the planner off the main thread so the map never freezes.
// The planner lives in /planner (Teammate's module, pure ES), shared with its Node tests.
// Messages: { id, args } → plan routes (kept as `last`); { id, kind: 'simulate', opts } → Mission
// Simulator (T-35) + step-by-step legs for the last planned routes (the grid isn't sent twice).
import { planMission } from '../../planner/src/plan.js';
import { simulateMission, describeRun, describeRecommendation } from '../../planner/src/simulate.js';
import { describeSteps } from '../../planner/src/steps.js';

type Any = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
let last: { args: Any; routes: Any[] } | null = null;

self.onmessage = (e: MessageEvent) => {
  const { id, args, kind, opts } = e.data;
  const post = (m: Any) => (self as unknown as Worker).postMessage({ id, ...m });
  try {
    if (kind === 'simulate') {
      if (!last) throw new Error('plan a route before simulating');
      const names: Record<string, string> = opts?.names || {};
      // Only the routes the page shows (the UI may hide SCIENCE): opts.strategies = ['SAFE', 'FAST'].
      const shown = opts?.strategies ? last.routes.filter((r) => opts.strategies.includes(r.strategy)) : last.routes;
      const sim = simulateMission(shown, last.args, opts || {});
      for (const r of sim.routes) {
        if (!r.summary) continue;
        const typical = r.runs[r.summary.typical];
        r.runs.forEach((run: Any) => { run.text = describeRun(run, typical, names); });
      }
      const steps = Object.fromEntries(shown.map((r) => [r.strategy, describeSteps(r, last!.args, names)]));
      post({ result: { ...sim, text: describeRecommendation(sim), steps } });
      return;
    }
    const routes = planMission(args);
    last = { args, routes };
    post({ routes });
  } catch (err) {
    post({ error: String((err as Error)?.message ?? err) });
  }
};
