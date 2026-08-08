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
import { speedMonOf, speedFieldOf } from "../battle/speed.ts";
import { effectiveSpeed } from "../../speed.js";
import type { DutyMap } from "../battle/resources.ts";

export interface EvalWeights {
  /** A living Pokemon is worth far more than any amount of chip damage. */
  monAlive: number;
  /** Value of one percent of one mon's HP. */
  hpPercent: number;
  /**
   * Per active matchup I move first in, minus the ones I do not.
   *
   * This is where speed control gets its value: Trick Room, Tailwind, an Icy
   * Wind drop and a Choice Scarf are all priced by the same thing, which is
   * who actually moves first on the board in front of you.
   */
  speedEdge: number;
  /** Per remaining turn of your own Tailwind, on top of the edge it buys. */
  tailwindTurn: number;
  /** Per remaining turn of Trick Room, on top of the edge it buys. */
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
  // Four active matchups, so the edge runs -4..+4 and a full flip is 8 units.
  // At 60 that is 480, roughly a third of a Pokemon (1000 alive + 300 for a
  // full HP bar). Deliberately less than a Pokemon: Trick Room can be worth
  // more than a KO, but a tool that valued it at more than one would spend the
  // whole game setting it.
  speedEdge: 60,
  // Persistence, on top of the edge. Reduced from 40 because the edge itself is
  // now counted - these only say "and it lasts", not "and it works".
  tailwindTurn: 12,
  trickRoomTurn: 10,
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
 * How many of the four active matchups I move first in.
 *
 * This is what speed control is actually FOR, and it is the only honest way to
 * price it. The old code had a flat 25-per-turn for Trick Room plus a block of
 * dead code that computed an average and then threw it away (`void avg`), so
 * the single most important turn-by-turn decision in the format - do I set
 * Trick Room, do I Tailwind, do I let theirs expire - was worth a constant
 * regardless of whether it flipped anything.
 *
 * Counted on the CURRENT field, so the same function prices Trick Room,
 * Tailwind, a Speed drop from Icy Wind and a Choice Scarf identically: by what
 * they do to who moves first.
 */
// The search calls evaluate hundreds of thousands of times, so everything on
// this path is memoised by object identity - sound because state transitions
// always produce new objects and never mutate old ones.
const fieldCache = new WeakMap<object, ReturnType<typeof speedFieldOf>>();

function cachedField(state: BattleState): ReturnType<typeof speedFieldOf> {
  const hit = fieldCache.get(state.field);
  if (hit) return hit;
  const built = speedFieldOf(state);
  fieldCache.set(state.field, built);
  return built;
}

function speedEdge(state: BattleState): number {
  const meActive = state.sides.me.active;
  const oppActive = state.sides.opp.active;

  const field = cachedField(state);
  // Both sides' speeds computed ONCE, not once per pairing.
  const theirSpeeds: number[] = [];
  for (const u of oppActive) {
    if (!u) continue;
    const m = state.mons[u];
    if (!m || m.fainted) continue;
    theirSpeeds.push(effectiveSpeed(speedMonOf(m), field));
  }
  if (theirSpeeds.length === 0) return 0;

  let edge = 0;
  let anyMine = false;
  for (const u of meActive) {
    if (!u) continue;
    const m = state.mons[u];
    if (!m || m.fainted) continue;
    anyMine = true;
    const a = effectiveSpeed(speedMonOf(m), field);
    for (const b of theirSpeeds) {
      if (a === b) continue; // a tie is not an edge - guarantees lose them
      const iFirst = field.trickRoom ? a < b : a > b;
      edge += iFirst ? 1 : -1;
    }
  }
  return anyMine ? edge : 0;
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

  // Speed control, priced by what it actually does to this board rather than by
  // a flat per-turn constant. Setting Trick Room that flips nothing is worth
  // nothing; setting one that flips all four matchups is worth a great deal,
  // and the same Trick Room can be either depending on who is out.
  const edge = speedEdge(state);
  score += w.speedEdge * edge;

  // Trick Room persistence. It is a FIELD effect, not a side one, so it cannot
  // live in sideScore - it belongs to whichever side it currently favours, and
  // that is exactly what the edge already tells us.
  if (state.field.trickRoom > 0 && edge !== 0) {
    score += w.trickRoomTurn * state.field.trickRoom * Math.sign(edge);
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
