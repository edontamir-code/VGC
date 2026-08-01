// ===========================================================================
// What could this Pokemon actually be holding?
//
// A mon carries four moves out of a larger pool. Until you have seen four, the
// honest answer to "what can it do" is a SET, not a list. This module computes
// that set and shrinks it as you scout:
//
//   confirmed 0/4 -> everything in the pool is possible
//   confirmed 4/4 -> the arsenal is exactly those four, and every guarantee
//                    against this mon becomes deterministic
//
// Ruling a move OUT is just as valuable as confirming one, and often easier:
// you watch them decline an obvious Protect and you know it is not there.
// ===========================================================================
import { MOVE_SLOTS } from "../model/types.ts";
import type { MonState } from "../model/types.ts";
import { getMoveData } from "./moves.ts";
import { STATUS_MOVES } from "./statusMoves.ts";

export interface Scouting {
  /** Moves you have actually seen. */
  confirmed: string[];
  /** Pool moves still possible: not seen, not ruled out. */
  possible: string[];
  /** Moves you have decided they are not running. */
  ruledOut: string[];
  /** Move slots still unaccounted for. */
  slotsLeft: number;
  /** True once all four slots are confirmed - no uncertainty left. */
  fullyScouted: boolean;
  /**
   * Everything they could use this turn. Exactly `confirmed` when fully
   * scouted, otherwise confirmed + everything still possible.
   */
  arsenal: string[];
  /**
   * Possible moves whose mechanics the simulator does NOT model. These cannot
   * be planned around and are reported rather than quietly ignored.
   */
  unsimulated: string[];
}

/** Moves the simulator can actually carry out. */
export function isSimulated(moveName: string): boolean {
  if (getMoveData(moveName)) return true;
  const s = STATUS_MOVES[moveName];
  // A status move is simulated if it protects, sets a field effect, or is one
  // of the specific effects the simulator implements.
  return Boolean(s && (s.protects || s.sets || s.simulated));
}

export function scout(mon: MonState): Scouting {
  const pool = mon.set.movePool?.length ? mon.set.movePool : mon.set.moves;
  const uniquePool = [...new Set(pool.filter(Boolean))];

  // My own mons are fully known; nothing to scout.
  if (mon.side === "me") {
    const arsenal = mon.set.moves.filter(Boolean);
    return {
      confirmed: arsenal,
      possible: [],
      ruledOut: [],
      slotsLeft: 0,
      fullyScouted: true,
      arsenal,
      unsimulated: arsenal.filter((m) => !isSimulated(m)),
    };
  }

  const confirmed = mon.revealed.moves.filter(Boolean);
  const ruledOut = mon.revealed.ruledOut ?? [];
  const slotsLeft = Math.max(0, MOVE_SLOTS - confirmed.length);
  const fullyScouted = slotsLeft === 0;

  const possible = fullyScouted
    ? []
    : uniquePool.filter((m) => !confirmed.includes(m) && !ruledOut.includes(m));

  // With nothing confirmed yet, fall back to the assumed set so a brand-new
  // opponent is never treated as having no moves at all.
  const base = confirmed.length > 0 ? confirmed : [];
  const arsenal = fullyScouted
    ? confirmed
    : [...new Set([...base, ...possible])];

  return {
    confirmed,
    possible,
    ruledOut,
    slotsLeft,
    fullyScouted,
    arsenal: arsenal.length ? arsenal : mon.set.moves.filter(Boolean),
    unsimulated: possible.filter((m) => !isSimulated(m)),
  };
}

/**
 * The arsenal to plan against.
 *  - "assumed": just the four moves currently in the set (fast, optimistic)
 *  - "possible": everything they could still be holding (slow, honest)
 */
export type ArsenalMode = "assumed" | "possible";

export function arsenalFor(mon: MonState, mode: ArsenalMode): string[] {
  if (mode === "assumed") {
    const s = scout(mon);
    // Confirmed moves always count, even in "assumed" mode.
    return [...new Set([...s.confirmed, ...mon.set.moves.filter(Boolean)])];
  }
  return scout(mon).arsenal;
}

/** How much is still unknown across a side - drives the UI's confidence badge. */
export function scoutingProgress(mons: MonState[]): {
  confirmed: number;
  slots: number;
  pct: number;
} {
  let confirmed = 0;
  let slots = 0;
  for (const m of mons) {
    const s = scout(m);
    confirmed += s.confirmed.length;
    slots += MOVE_SLOTS;
  }
  return { confirmed, slots, pct: slots ? (100 * confirmed) / slots : 0 };
}
