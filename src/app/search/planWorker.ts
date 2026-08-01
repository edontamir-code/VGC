// ===========================================================================
// The planner runs in a Web Worker.
//
// A 3-turn search takes seconds. Doing that on the main thread would freeze the
// app mid-battle, which for a companion you use against a clock is worse than
// not having the feature. The board is plain data, so it structured-clones into
// the worker and the ranked plans clone back out.
// ===========================================================================
import { searchPlans } from "./plan.ts";
import type { PlanLine, SearchOpts } from "./plan.ts";
import type { BattleState } from "../model/types.ts";
import { clearMatchupCache } from "../battle/damage.ts";

export interface PlanRequest {
  id: number;
  state: BattleState;
  opts: SearchOpts;
}

export interface PlanResponse {
  id: number;
  lines: PlanLine[];
  ms: number;
  error?: string;
}

self.onmessage = (e: MessageEvent<PlanRequest>) => {
  const { id, state, opts } = e.data;
  const t0 = performance.now();
  try {
    // The cache keys on object identity, and every request brings freshly
    // cloned objects, so last request's entries can never be hit again.
    clearMatchupCache();
    const lines = searchPlans(state, opts);
    const res: PlanResponse = { id, lines, ms: Math.round(performance.now() - t0) };
    (self as unknown as Worker).postMessage(res);
  } catch (err) {
    const res: PlanResponse = {
      id,
      lines: [],
      ms: Math.round(performance.now() - t0),
      error: err instanceof Error ? err.message : String(err),
    };
    (self as unknown as Worker).postMessage(res);
  }
};
