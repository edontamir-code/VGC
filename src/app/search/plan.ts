// ===========================================================================
// Maximin search: "is there a line they cannot beat?"
//
// SOUNDNESS CONTRACT - read this before trusting any output.
//
// 1. I commit to a move, THEN they pick the best reply knowing it. Real doubles
//    is simultaneous, so anything that survives this survives the real game.
//    The search under-claims; it never over-claims.
// 2. My attacks use the MINIMUM damage roll, theirs the MAXIMUM.
// 3. Exact speed ties are resolved against me.
// 4. A repeat Protect is treated as failing.
// 5. Their moveset is whatever the current (possibly assumed) set says. Until
//    you confirm a set, a "pin" is conditional on that set - reported as such.
//
// The result is a LOWER BOUND on how well a line does. A pin means: within the
// searched depth, under every reply they had, I came out ahead. It is never a
// claim about the whole game - the horizon is always reported alongside it.
// ===========================================================================
import type { BattleState, SideId } from "../model/types.ts";
import { actionProfiles, actionLabel } from "../sim/actions.ts";
import type { Plan } from "../sim/actions.ts";
import { simulateTurn } from "../sim/turn.ts";
import type { SimEvent } from "../sim/turn.ts";
import { evaluate, material, outcome, DEFAULT_WEIGHTS } from "./evaluate.ts";
import { answerDuties } from "../battle/resources.ts";
import type { DutyMap } from "../battle/resources.ts";
import type { Outcome } from "./evaluate.ts";
import { activeMons } from "../battle/resolver.ts";
import { arsenalFor, scout } from "../battle/scouting.ts";
import type { ArsenalMode } from "../battle/scouting.ts";
import { activeProfile } from "../battle/stats.ts";

export interface SearchOpts {
  /** Turns to look ahead. 1 = this turn only. */
  depth: number;
  /** How many of my profiles survive to the next ply. */
  myBeam: number;
  /** How many of their replies are examined at deeper plies. */
  theirBeam: number;
  /**
   * "assumed"  - plan against the four moves currently in their set.
   * "possible" - plan against every move they could still be holding.
   */
  arsenal: ArsenalMode;
}

export const DEFAULT_SEARCH: SearchOpts = {
  depth: 2,
  myBeam: 8,
  theirBeam: 8,
  arsenal: "possible",
};

/** Their arsenals, keyed by uid, for a given mode. */
function oppArsenals(
  state: BattleState,
  mode: ArsenalMode,
  extra?: { uid: string; moveName: string }
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const m of activeMons(state, "opp")) {
    const base = arsenalFor(m, mode);
    out[m.uid] =
      extra && extra.uid === m.uid && !base.includes(extra.moveName)
        ? [...base, extra.moveName]
        : base;
  }
  return out;
}

export interface WorstCase {
  /** Their reply that hurt me most. */
  reply: Plan;
  replyLabel: string;
  score: number;
  material: { me: number; opp: number };
  outcome: Outcome;
  events: SimEvent[];
  /**
   * True when EVERY reply they had was checked, at every ply.
   * Depth 1 is always exhaustive. Deeper searches beam their replies, so a
   * depth-2 result is a strong indication, not a proof - and the difference is
   * reported rather than hidden.
   */
  exhaustive: boolean;
}

export interface PlanLine {
  plan: Plan;
  label: string;
  /** Worst case over every reply they had, at the search horizon. */
  worst: WorstCase;
  /** Best case, for context - never the basis of a claim. */
  bestScore: number;
  /**
   * True when the worst case still leaves me ahead on material.
   * A pin is only a PROOF when `worst.exhaustive` is also true; otherwise it is
   * the best line the search could find without checking every branch.
   */
  isPin: boolean;
  /** Holds against the four moves they are assumed to be running. */
  pinVsAssumed: boolean;
  /** Holds against every move they could still be holding - the strong claim. */
  pinVsPossible: boolean;
  /** The specific unknown moves that turn this from a pin into a gamble. */
  breakers: PinBreaker[];
  /** Pool moves whose effect the simulator cannot model. */
  unsimulated: PinBreaker[];
  /** True when this line was verified against every reply, at every ply. */
  proven: boolean;
  /** How many turns deep the guarantee was verified. */
  horizon: number;
  /** True when every opposing set involved is confirmed. */
  deterministic: boolean;
}

function labelPlan(plan: Plan, state: BattleState): string {
  return Object.entries(plan)
    .map(([uid, a]) => {
      const m = state.mons[uid];
      return `${m ? activeProfile(m).displayName : "?"}: ${actionLabel(a, state)}`;
    })
    .join(" + ");
}

/** Are all opposing actives fully confirmed - spread AND all four moves? */
function oppConfirmed(state: BattleState): boolean {
  return activeMons(state, "opp").every((m) => m.revealed.sp && scout(m).fullyScouted);
}

/** A specific unknown move that turns a pin into a non-pin. */
export interface PinBreaker {
  monUid: string;
  monName: string;
  moveName: string;
  /** True when the simulator cannot model it, so the risk is flagged not computed. */
  unsimulated: boolean;
  text: string;
}

/**
 * Worst-case value of committing to `plan`, searching `depth` turns.
 * Returns the score from my perspective under their best reply.
 */
function worstCaseValue(
  state: BattleState,
  plan: Plan,
  depth: number,
  opts: SearchOpts,
  /**
   * Who on my side is the only answer to what, computed once on the ROOT
   * board. Deliberately not recomputed as the search descends: it values the
   * resource as it is identified now, and a Pokemon that faints deeper in a
   * line simply stops being scored at all.
   */
  duties: DutyMap,
  arsenals?: Record<string, string[]>,
  /**
   * Alpha-beta cut-off. When a parent max-node already has a line worth
   * `alpha`, any plan whose running worst case drops to or below that can be
   * abandoned - it cannot become the best. Exact: the parent's maximum is
   * unchanged. Only used inside the recursion, never for reported top-level
   * numbers, which are always computed in full.
   */
  alpha = -Infinity
): WorstCase {
  const replies = actionProfiles(state, "opp", {
    allowSwitch: true,
    arsenals: arsenals ?? oppArsenals(state, opts.arsenal),
  });
  let worst: WorstCase | null = null;

  const scored = replies.map((reply) => {
    const sim = simulateTurn(state, { ...plan, ...reply }, {
      roll: "worstForMe",
      tie: "them",
    });
    return { reply, sim, immediate: evaluate(sim.state, DEFAULT_WEIGHTS, duties) };
  });

  // At deeper plies only the most dangerous replies are expanded. Whenever that
  // truncation happens the result stops being a proof, and we say so.
  scored.sort((a, b) => a.immediate - b.immediate);
  const theirBeam = Math.max(2, opts.theirBeam - 2 * (opts.depth - depth));
  const toExpand = depth > 1 ? scored.slice(0, theirBeam) : scored;
  let exhaustive = toExpand.length === scored.length;

  for (const cand of toExpand) {
    let score = cand.immediate;
    const out = outcome(cand.sim.state);

    if (depth > 1 && out === "ongoing") {
      // My best follow-up, which itself faces their best follow-up.
      const next = bestLineValue(cand.sim.state, depth - 1, opts, duties);
      score = next.value;
      if (!next.exhaustive) exhaustive = false;
    }

    if (!worst || score < worst.score) {
      worst = {
        reply: cand.reply,
        replyLabel: labelPlan(cand.reply, state),
        score,
        material: material(cand.sim.state),
        outcome: out,
        events: cand.sim.events,
        exhaustive: true, // overwritten below once every branch is known
      };
    }

    // This plan can no longer win the parent's max - stop paying for it.
    if (worst.score <= alpha) {
      exhaustive = false;
      break;
    }
  }

  if (worst) return { ...worst, exhaustive };

  return {
    reply: {},
    replyLabel: "(no legal reply)",
    score: evaluate(state, DEFAULT_WEIGHTS, duties),
    material: material(state),
    outcome: outcome(state),
    events: [],
    exhaustive: true,
  };
}

/**
 * The value I can force from this position.
 * Beaming MY options can only ever understate what I can achieve, so it is
 * conservative and does not threaten soundness.
 */
function bestLineValue(
  state: BattleState,
  depth: number,
  opts: SearchOpts,
  duties: DutyMap
): { value: number; exhaustive: boolean } {
  const mine = actionProfiles(state, "me", { allowSwitch: true });
  if (mine.length === 0) return { value: evaluate(state, DEFAULT_WEIGHTS, duties), exhaustive: true };

  const quick = mine.map((plan) => {
    const sim = simulateTurn(state, plan, { roll: "worstForMe", tie: "them" });
    return { plan, immediate: evaluate(sim.state, DEFAULT_WEIGHTS, duties) };
  });
  quick.sort((a, b) => b.immediate - a.immediate);

  let best = -Infinity;
  let exhaustive = true;
  // Progressive narrowing: the deeper we are, the tighter the beam. Deep plies
  // move the top-level answer least and cost the most, so they shrink fastest.
  const beam = Math.max(2, opts.myBeam - 2 * (opts.depth - depth));
  for (const cand of quick.slice(0, beam)) {
    const w = worstCaseValue(state, cand.plan, depth, opts, duties, undefined, best);
    if (!w.exhaustive) exhaustive = false;
    if (w.score > best) best = w.score;
  }
  return {
    value: best === -Infinity ? evaluate(state, DEFAULT_WEIGHTS, duties) : best,
    exhaustive,
  };
}

function isPinResult(
  worst: WorstCase,
  baseline: { me: number; opp: number },
  baseScore: number
): boolean {
  return (
    worst.outcome !== "lost" &&
    worst.material.me >= baseline.me &&
    worst.material.opp <= baseline.opp &&
    (worst.material.opp < baseline.opp || worst.score >= baseScore)
  );
}

/**
 * Rank my candidate plans by what they GUARANTEE, not by what they might get.
 */
export function searchPlans(
  state: BattleState,
  opts: SearchOpts = DEFAULT_SEARCH
): PlanLine[] {
  const baseline = material(state);
  const duties = answerDuties(state);
  const baseScore = evaluate(state, DEFAULT_WEIGHTS, duties);
  const deterministic = oppConfirmed(state);
  const mine = actionProfiles(state, "me", { allowSwitch: true });

  const assumedArsenals = oppArsenals(state, "assumed");
  const possibleArsenals = oppArsenals(state, "possible");

  // Cheap pre-pass so the expensive search only runs on plausible plans.
  const quick = mine.map((plan) => {
    const sim = simulateTurn(state, plan, { roll: "worstForMe", tie: "them" });
    return { plan, immediate: evaluate(sim.state, DEFAULT_WEIGHTS, duties) };
  });
  quick.sort((a, b) => b.immediate - a.immediate);
  const shortlist = quick.slice(0, Math.max(opts.myBeam * 3, 24));

  const lines: PlanLine[] = shortlist.map(({ plan }) => {
    const worst = worstCaseValue(state, plan, opts.depth, opts, duties);
    const best = simulateTurn(state, plan, { roll: "bestForMe", tie: "me" });

    const isPin = isPinResult(worst, baseline, baseScore);

    // Three tiers, which is what makes the answer actionable:
    //   holds against the assumed common set?
    //   holds against everything they could still be holding?
    //   if not - exactly which unknown move breaks it?
    const pinVsAssumed = isPinResult(
      worstCaseValue(state, plan, 1, opts, duties, assumedArsenals),
      baseline,
      baseScore
    );
    const pinVsPossible = isPinResult(
      worstCaseValue(state, plan, 1, opts, duties, possibleArsenals),
      baseline,
      baseScore
    );

    const breakers: PinBreaker[] = [];
    if (pinVsAssumed && !pinVsPossible) {
      for (const foe of activeMons(state, "opp")) {
        const s = scout(foe);
        for (const moveName of s.possible) {
          if (assumedArsenals[foe.uid]?.includes(moveName)) continue;
          const augmented = oppArsenals(state, "assumed", { uid: foe.uid, moveName });
          const w = worstCaseValue(state, plan, 1, opts, duties, augmented);
          if (!isPinResult(w, baseline, baseScore)) {
            breakers.push({
              monUid: foe.uid,
              monName: activeProfile(foe).displayName,
              moveName,
              unsimulated: false,
              text: `${activeProfile(foe).displayName} ${moveName} breaks this line`,
            });
          }
        }
      }
    }

    // Pool moves we cannot simulate are risks we must declare, not compute.
    const unsimulated: PinBreaker[] = [];
    for (const foe of activeMons(state, "opp")) {
      for (const moveName of scout(foe).unsimulated) {
        unsimulated.push({
          monUid: foe.uid,
          monName: activeProfile(foe).displayName,
          moveName,
          unsimulated: true,
          text: `${activeProfile(foe).displayName} could be running ${moveName}, whose effect is not simulated`,
        });
      }
    }

    return {
      plan,
      label: labelPlan(plan, state),
      worst,
      bestScore: evaluate(best.state, DEFAULT_WEIGHTS, duties),
      isPin,
      pinVsAssumed,
      pinVsPossible,
      breakers,
      unsimulated,
      proven: isPin && worst.exhaustive && deterministic,
      horizon: opts.depth,
      deterministic,
    };
  });

  return lines.sort((a, b) => b.worst.score - a.worst.score);
}

/** The single safest plan - highest guaranteed floor. */
export function safestPlan(
  state: BattleState,
  opts: SearchOpts = DEFAULT_SEARCH
): PlanLine | null {
  const lines = searchPlans(state, opts);
  return lines.length ? lines[0] : null;
}

export type { Plan, SideId };
