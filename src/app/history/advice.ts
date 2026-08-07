// ===========================================================================
// What the tool recommended, captured so the log can say whether you took it.
//
// The recommendation is computed in two places and neither is reachable from
// the reducer:
//
//   PLANNER  - the multi-turn maximin search, which runs in a Web Worker and
//              answers asynchronously. Better advice, arrives late.
//   LINES    - the synchronous single-turn ranking on the Battle tab. Always
//              available, shallower.
//
// Both publish here. The log reads it at the moment a turn is applied.
//
// Keyed by the BattleState OBJECT, not by a hash or a timestamp. Every state
// transition produces a new object and never mutates an old one, so identity is
// an exact answer to "was this advice computed for the board the turn was
// played on". A timestamp would happily attribute last turn's advice to this
// turn; a hash would have to enumerate everything that can change a plan and
// would go stale the first time something was added. A WeakMap also means the
// entries disappear with the boards they describe.
// ===========================================================================
import type { BattleState } from "../model/types.ts";
import type { Plan } from "../sim/actions.ts";

export type AdviceSource = "planner" | "lines";

export interface AdviceSnapshot {
  /** Human-readable, e.g. "Raichu: Zap Cannon on Garchomp + Sylveon: Protect". */
  label: string;
  /** My side's advised actions, keyed by uid, for comparing against play. */
  plan: Plan;
  source: AdviceSource;
  /** Search depth for planner advice; null for the single-turn ranking. */
  depth: number | null;
  /** True when the planner proved the line against every reply. */
  proven: boolean;
}

const byState = new WeakMap<BattleState, AdviceSnapshot>();

/** Planner advice replaces line advice for the same board, never the reverse. */
function outranks(next: AdviceSnapshot, existing: AdviceSnapshot | undefined): boolean {
  if (!existing) return true;
  if (next.source === existing.source) return true;
  return next.source === "planner";
}

export function publishAdvice(state: BattleState, advice: AdviceSnapshot): void {
  if (outranks(advice, byState.get(state))) byState.set(state, advice);
}

export function adviceFor(state: BattleState): AdviceSnapshot | null {
  return byState.get(state) ?? null;
}

// ---------------------------------------------------------------------------
// Did I take it?
// ---------------------------------------------------------------------------

export interface AdviceComparison {
  /** 0-1: the share of my advised Pokemon that did the advised thing. */
  match: number;
  /** True when most of them did. */
  followed: boolean;
  /** Advised actions that were not played, in plain words. */
  diverged: string[];
}

function sameAction(a: Plan[string] | undefined, b: Plan[string] | undefined): boolean {
  if (!a || !b) return false;
  if (a.kind !== b.kind) return false;
  if (a.kind === "move" && b.kind === "move") {
    // The move is the decision. Which of two targets you picked is a smaller
    // call and is not worth recording as "ignored the advice".
    return a.moveName === b.moveName;
  }
  if (a.kind === "switch" && b.kind === "switch") return a.toUid === b.toUid;
  return true;
}

/**
 * Compare what was advised against what was played, over MY side only.
 *
 * Their actions are observations, not decisions - scoring myself against what
 * the opponent happened to do would be meaningless.
 */
export function compareToAdvice(
  state: BattleState,
  advice: AdviceSnapshot,
  played: Record<string, Plan[string]>
): AdviceComparison | null {
  const mineAdvised = Object.entries(advice.plan).filter(
    ([uid]) => state.mons[uid]?.side === "me"
  );
  if (mineAdvised.length === 0) return null;

  let hits = 0;
  const diverged: string[] = [];
  for (const [uid, advised] of mineAdvised) {
    if (sameAction(advised, played[uid])) {
      hits++;
      continue;
    }
    const who = state.mons[uid]?.set.name ?? "?";
    const want = advised.kind === "move" ? advised.moveName : "switch";
    const got = played[uid]
      ? played[uid].kind === "move"
        ? (played[uid] as { moveName: string }).moveName
        : "switch"
      : "nothing";
    diverged.push(`${who}: advised ${want}, played ${got}`);
  }

  // Half or better counts as following it. Doubles turns are two decisions and
  // getting one of two right is genuinely different from ignoring the line.
  const match = hits / mineAdvised.length;
  return { match, followed: match >= 0.5, diverged };
}
