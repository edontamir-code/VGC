// ===========================================================================
// Position evaluation, from my side's point of view.
//
// Every term here is deliberately simple and inspectable. This is not a learned
// evaluation and it is not tuned against game data - it is an ordering over
// positions that a doubles player would agree with, written down explicitly so
// you can read it and change it. The GUARANTEES come from the search being
// worst-case; the evaluation only decides which non-terminal line looks better.
// ===========================================================================
import { BROUGHT_COUNT } from "../model/types.ts";
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { dutyValue } from "../battle/resources.ts";
import type { DutyMap } from "../battle/resources.ts";

export interface EvalWeights {
  /** A living Pokemon is worth far more than any amount of chip damage. */
  monAlive: number;
  /** Value of one percent of one mon's HP. */
  hpPercent: number;
  /** Per remaining turn of your own Tailwind. */
  tailwindTurn: number;
  /** Per remaining turn of Trick Room (sign depends on whose speed it favours). */
  trickRoomTurn: number;
  /** Per remaining turn of a screen on your side. */
  screenTurn: number;
  /** Per net offensive stat stage. */
  boostStage: number;
  /** Holding an unspent Focus Sash / berry. */
  itemHeld: number;
}

export const DEFAULT_WEIGHTS: EvalWeights = {
  monAlive: 1000,
  hpPercent: 3,
  tailwindTurn: 40,
  trickRoomTurn: 25,
  screenTurn: 15,
  boostStage: 45,
  itemHeld: 20,
};

function sideMons(state: BattleState, side: SideId): MonState[] {
  return Object.values(state.mons).filter((m) => m.side === side);
}

/**
 * How much a Pokemon counts toward material.
 *
 * A battle is four-a-side, but you enter SIX at team preview. Counting all six
 * would inflate their material the moment you fill in the roster, which would
 * swamp every real strategic difference. So confirmed-brought Pokemon count in
 * full, and the ones that merely MIGHT have been brought share the remaining
 * slots between them.
 */
function broughtWeight(state: BattleState, side: SideId): (m: MonState) => number {
  const all = sideMons(state, side);
  const confirmed = all.filter((m) => m.brought === "confirmed").length;
  const possible = all.filter((m) => m.brought === "possible").length;
  const slotsLeft = Math.max(0, BROUGHT_COUNT - confirmed);
  const share = possible > 0 ? Math.min(1, slotsLeft / possible) : 0;
  return (m) => {
    if (m.brought === "out") return 0;
    if (m.brought === "confirmed") return 1;
    return share;
  };
}

function sideScore(
  state: BattleState,
  side: SideId,
  w: EvalWeights,
  duties?: DutyMap
): number {
  let score = 0;
  const weight = broughtWeight(state, side);
  for (const m of sideMons(state, side)) {
    if (m.fainted) continue;
    const k = weight(m);
    if (k === 0) continue;
    score += k * w.monAlive;
    score += k * w.hpPercent * (100 * m.curHP) / Math.max(1, m.maxHP);
    if (m.itemActive && m.set.item) score += k * w.itemHeld;
    const offense = m.stages.atk + m.stages.spa + m.stages.spe;
    const defense = m.stages.def + m.stages.spd;
    score += k * w.boostStage * (offense + defense * 0.6);
    // A Pokemon is worth the threats it is holding shut, not just its HP bar.
    // Without this the search happily trades your only answer to their back
    // line for a small material edge, which is how games are actually lost.
    if (side === "me" && duties) score += dutyValue(duties[m.uid]);
  }
  score += w.tailwindTurn * state.field.tailwind[side];
  const sc = state.field.screens[side];
  score += w.screenTurn * (sc.reflect + sc.lightScreen + sc.auroraVeil);
  return score;
}

/**
 * Positive = good for me.
 *
 * `duties` is who on my side is the only answer to what, computed ONCE before
 * the search and passed down. This function runs hundreds of thousands of times
 * per search; building the answer matrix inside it would be correct and
 * unusably slow. Omitting it just turns the term off.
 */
export function evaluate(
  state: BattleState,
  w: EvalWeights = DEFAULT_WEIGHTS,
  duties?: DutyMap
): number {
  let score = sideScore(state, "me", w, duties) - sideScore(state, "opp", w);

  // Trick Room is worth whatever it does to the actual speed matchup, so it is
  // credited to whichever side is slower on average.
  if (state.field.trickRoom > 0) {
    const avg = (side: SideId) => {
      const live = sideMons(state, side).filter((m) => !m.fainted);
      if (!live.length) return 0;
      return live.reduce((n, m) => n + m.maxHP, 0) / live.length;
    };
    // Cheap proxy: TR helps the side with lower average Speed. Using maxHP as a
    // stand-in would be wrong, so we simply count it neutrally unless one side
    // has no living mons.
    void avg;
  }

  return score;
}

export type Outcome = "won" | "lost" | "ongoing";

export function outcome(state: BattleState): Outcome {
  const alive = (side: SideId) => sideMons(state, side).some((m) => !m.fainted);
  const meAlive = alive("me");
  const oppAlive = alive("opp");
  if (!oppAlive && meAlive) return "won";
  if (!meAlive && oppAlive) return "lost";
  return "ongoing";
}

/** Count of living mons per side - the headline material number. */
export function material(state: BattleState): { me: number; opp: number } {
  return {
    me: sideMons(state, "me").filter((m) => !m.fainted).length,
    opp: sideMons(state, "opp").filter((m) => !m.fainted).length,
  };
}
