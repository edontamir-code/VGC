// ===========================================================================
// Slot-competition inference: what does seeing one move tell you about the rest?
//
// THE KEY PROPERTY. Usage percentages for a species sum to about 400% -
// Kingambit's are 399.5%. That is not a coincidence: every set has exactly four
// moves, so the marginal inclusion rates must sum to four slots. The usage data
// is therefore a real probability distribution over a 4-subset, and we can
// condition on what we observe instead of guessing.
//
// WHY IT MATTERS. Slots are scarce. Every move you confirm uses one up, which
// pushes every other candidate DOWN. And the size of that push depends on how
// surprising the confirmation was:
//
//   Confirm Dragon Claw (89% - expected)  -> others barely move
//   Confirm Rock Tomb   (8%  - surprising) -> everything else drops hard,
//                                             because a slot went somewhere
//                                             nobody expected
//
// That is exactly the read: "if they have a coverage move that is NOT the one
// that threatens my back-line mon, they probably do not have the one that is."
// It is not a heuristic - it falls out of the arithmetic.
//
// Ruling a move OUT works in reverse: the freed probability mass redistributes
// and everything else goes UP.
// ===========================================================================
import { usageFor } from "../../data/usage.js";
import { MOVE_SLOTS } from "../model/types.ts";
import type { MonState } from "../model/types.ts";
import { getMoveData } from "./moves.ts";
import { resolveMatchup } from "./damage.ts";
import type { BattleState } from "../model/types.ts";

export interface MoveProbability {
  move: string;
  /** 0-1, conditioned on everything observed so far. */
  p: number;
  /** The unconditioned usage rate, for comparison. */
  prior: number;
  status: "confirmed" | "ruled-out" | "possible";
}

export interface MoveBelief {
  moves: MoveProbability[];
  slotsLeft: number;
  /**
   * Probability mass sitting in moves rare enough that they are not listed.
   * Until all four slots are confirmed, "something we have never seen" is
   * always live - this is how much.
   */
  unlistedMass: number;
  fullyKnown: boolean;
}

/**
 * Conditional probability of each move, given confirmations and rule-outs.
 *
 * conditional(i) = prior(i) x slotsLeft / remainingMass
 *
 * where remainingMass is the prior mass of everything still unresolved, plus
 * the unlisted tail. Renormalising the survivors onto the remaining slots is
 * what produces the competition effect.
 */
export function moveBelief(mon: MonState): MoveBelief {
  const u = usageFor(mon.set.speciesId);
  const confirmed = mon.revealed?.moves ?? [];
  const ruledOut = mon.revealed?.ruledOut ?? [];

  // My own mons, and fully-scouted opponents, are simply known.
  if (mon.side === "me") {
    return {
      moves: mon.set.moves.filter(Boolean).map((move) => ({
        move, p: 1, prior: 1, status: "confirmed" as const,
      })),
      slotsLeft: 0,
      unlistedMass: 0,
      fullyKnown: true,
    };
  }

  const priors: Record<string, number> = {};
  if (u?.moves) {
    for (const [m, pct] of Object.entries(u.moves)) priors[m] = pct / 100;
  } else {
    // No usage data: spread the four slots evenly over the declared pool.
    const pool = mon.set.movePool?.length ? mon.set.movePool : mon.set.moves;
    const each = pool.length ? MOVE_SLOTS / pool.length : 0;
    for (const m of pool.filter(Boolean)) priors[m] = Math.min(1, each);
  }
  // Anything seen but not listed still needs an entry.
  for (const m of confirmed) if (!(m in priors)) priors[m] = 0;

  const listedMass = Object.values(priors).reduce((a, b) => a + b, 0);
  const unlistedPrior = Math.max(0, MOVE_SLOTS - listedMass);

  const slotsLeft = Math.max(0, MOVE_SLOTS - confirmed.length);
  const fullyKnown = slotsLeft === 0;

  // Mass still in play: unresolved candidates plus the unlisted tail.
  let remainingMass = unlistedPrior;
  for (const [m, p] of Object.entries(priors)) {
    if (confirmed.includes(m) || ruledOut.includes(m)) continue;
    remainingMass += p;
  }

  const scale = remainingMass > 0 ? slotsLeft / remainingMass : 0;

  const moves: MoveProbability[] = Object.entries(priors).map(([move, prior]) => {
    if (confirmed.includes(move)) return { move, p: 1, prior, status: "confirmed" as const };
    if (ruledOut.includes(move)) return { move, p: 0, prior, status: "ruled-out" as const };
    return {
      move,
      p: fullyKnown ? 0 : Math.max(0, Math.min(1, prior * scale)),
      prior,
      status: "possible" as const,
    };
  });

  moves.sort((a, b) => b.p - a.p || b.prior - a.prior);

  return {
    moves,
    slotsLeft,
    unlistedMass: fullyKnown ? 0 : Math.min(1, unlistedPrior * scale),
    fullyKnown,
  };
}

export function moveProbability(mon: MonState, move: string): number {
  return moveBelief(mon).moves.find((m) => m.move === move)?.p ?? 0;
}

/**
 * Probability they hold AT LEAST ONE of these moves.
 *
 * Slot competition makes these negatively correlated, so the independent
 * formula would overstate it. The sum is a strict upper bound, which errs
 * toward treating you as threatened - the safe direction.
 */
export function probabilityOfAny(mon: MonState, moves: string[]): number {
  const belief = moveBelief(mon);
  let total = 0;
  for (const m of moves) {
    total += belief.moves.find((x) => x.move === m)?.p ?? 0;
  }
  return Math.min(1, total);
}

export interface KOThreat {
  /** Moves in their pool that would KO this target. */
  killers: MoveProbability[];
  /** Upper bound on the chance they hold at least one. */
  probability: number;
  /** True when one of the killers is already confirmed. */
  confirmed: boolean;
}

/**
 * How likely is it that this opponent holds something that KOs my mon?
 *
 * This is the number that decides whether a Pokemon needs to be preserved:
 * a threat they PROBABLY cannot execute is not worth spending a switch on.
 */
export function koThreat(
  foe: MonState,
  target: MonState,
  state: BattleState
): KOThreat {
  const belief = moveBelief(foe);
  const killers: MoveProbability[] = [];

  for (const mp of belief.moves) {
    if (mp.status === "ruled-out" || mp.p <= 0) continue;
    if (!getMoveData(mp.move)) continue;
    const r = resolveMatchup(foe, target, mp.move, state);
    // A KO at their WORST roll - a move that only KOs on a high roll is not
    // counted as a killer.
    if (r && r.verdict === "DEAD") killers.push(mp);
  }

  return {
    killers,
    probability: Math.min(1, killers.reduce((a, b) => a + b.p, 0)),
    confirmed: killers.some((k) => k.status === "confirmed"),
  };
}

export interface Deduction {
  move: string;
  before: number;
  after: number;
  delta: number;
}

/**
 * What a change in knowledge did to the rest of the pool - the sentence the UI
 * should show after you record a turn.
 */
export function deductionsBetween(
  before: MonState,
  after: MonState,
  minDelta = 0.02
): Deduction[] {
  const b = moveBelief(before);
  const a = moveBelief(after);
  const out: Deduction[] = [];

  for (const m of a.moves) {
    const prev = b.moves.find((x) => x.move === m.move);
    if (!prev) continue;
    const delta = m.p - prev.p;
    if (Math.abs(delta) >= minDelta) {
      out.push({ move: m.move, before: prev.p, after: m.p, delta });
    }
  }
  return out.sort((x, y) => Math.abs(y.delta) - Math.abs(x.delta));
}
