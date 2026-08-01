// React hook wrapping the planner worker, with a synchronous fallback.
import { useEffect, useRef, useState } from "react";
import { searchPlans } from "./plan.ts";
import type { PlanLine, SearchOpts } from "./plan.ts";
import type { PlanRequest, PlanResponse } from "./planWorker.ts";
import type { BattleState } from "../model/types.ts";

export interface PlannerState {
  lines: PlanLine[];
  ms: number;
  searching: boolean;
  error: string | null;
  /** True when the shown result predates the current board. */
  stale: boolean;
}

function makeWorker(): Worker | null {
  try {
    return new Worker(new URL("./planWorker.ts", import.meta.url), { type: "module" });
  } catch {
    return null;
  }
}

/**
 * Runs a search whenever the board or options change. Results always come back
 * for the LATEST request - a slow earlier search can never overwrite a newer one.
 */
export function usePlanner(
  state: BattleState,
  opts: SearchOpts,
  enabled: boolean
): PlannerState {
  const [result, setResult] = useState<PlannerState>({
    lines: [],
    ms: 0,
    searching: false,
    error: null,
    stale: false,
  });
  const workerRef = useRef<Worker | null>(null);
  const reqId = useRef(0);

  useEffect(() => {
    workerRef.current = makeWorker();
    return () => {
      workerRef.current?.terminate();
      workerRef.current = null;
    };
  }, []);

  const key = `${opts.depth}|${opts.arsenal}|${opts.myBeam}|${opts.theirBeam}|${state.turn}|${
    // Only the parts of the board that can change an answer.
    Object.values(state.mons)
      .map((m) =>
        [
          m.uid, m.curHP, m.fainted, m.hasMega, m.itemActive, m.status,
          m.encoreTurnsLeft, m.protectStreak, m.turnsOnField,
          m.stages.atk, m.stages.def, m.stages.spa, m.stages.spd, m.stages.spe,
          m.revealed.moves.join(","), m.revealed.ruledOut.join(","), m.revealed.sp,
          m.set.moves.join(","), m.set.item, m.set.ability,
        ].join(":")
      )
      .join("|")
  }|${JSON.stringify(state.field)}|${state.sides.me.active.join(",")}|${state.sides.opp.active.join(",")}`;

  useEffect(() => {
    if (!enabled) {
      setResult((r) => ({ ...r, lines: [], searching: false, stale: false }));
      return;
    }

    const id = ++reqId.current;
    setResult((r) => ({ ...r, searching: true, stale: r.lines.length > 0, error: null }));

    const worker = workerRef.current;
    if (worker) {
      const onMessage = (e: MessageEvent<PlanResponse>) => {
        if (e.data.id !== reqId.current) return; // a newer search superseded this
        worker.removeEventListener("message", onMessage);
        setResult({
          lines: e.data.lines,
          ms: e.data.ms,
          searching: false,
          error: e.data.error ?? null,
          stale: false,
        });
      };
      worker.addEventListener("message", onMessage);
      const req: PlanRequest = { id, state, opts };
      worker.postMessage(req);
      return () => worker.removeEventListener("message", onMessage);
    }

    // No worker available - fall back to running inline on the next frame.
    const handle = requestAnimationFrame(() => {
      const t0 = performance.now();
      try {
        const lines = searchPlans(state, opts);
        setResult({
          lines,
          ms: Math.round(performance.now() - t0),
          searching: false,
          error: null,
          stale: false,
        });
      } catch (err) {
        setResult({
          lines: [],
          ms: 0,
          searching: false,
          error: err instanceof Error ? err.message : String(err),
          stale: false,
        });
      }
    });
    return () => cancelAnimationFrame(handle);
    // `key` captures everything about `state`/`opts` that can change the answer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);

  return result;
}
