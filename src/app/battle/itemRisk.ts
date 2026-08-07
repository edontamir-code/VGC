// ===========================================================================
// "Does it kill if it has Life Orb?"
//
// The single most common real question at the table. A Garchomp that 2HKOs you
// bare OHKOs you with a Life Orb, and a large share of Garchomps carry one. A
// tool that silently picks ONE item and reports one number is lying by omission
// in both directions: assume the boosting item and everything looks lethal;
// assume the bare item and you get swept by the thing you were told survives.
//
// So: compute the matchup once per LIVE item candidate, and report the swing.
// The headline verdict still uses the most likely item - that keeps the tool
// usable - but any item at or above the usage cutoff that CHANGES the verdict is
// named, with the probability attached.
//
// Scope note: this varies the ATTACKER's item. Defensive items are handled
// where they belong (Focus Sash in damage.ts, resist berries via set.berry),
// because a berry is a typed resist, not a flat multiplier we can swap in here.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup, Verdict } from "./damage.ts";
import { itemCandidates } from "./candidates.ts";

export interface ItemOutcome {
  item: string;
  /** Usage share of this item, 0-100. 100 when the item is confirmed. */
  pct: number;
  minPct: number;
  maxPct: number;
  /** Hits needed at the attacker's WORST roll, from the defender's current HP. */
  hitsToKO: number;
  verdict: Verdict;
  koChance: string;
}

export interface ItemSensitivity {
  moveName: string;
  /** True when we have actually seen the item - nothing to be uncertain about. */
  known: boolean;
  /** One entry per live item candidate, hardest hit first. */
  outcomes: ItemOutcome[];
  /** The outcome under the most likely item - what the headline uses. */
  likelyOutcome: ItemOutcome | null;
  /** The hardest-hitting live item. */
  worstOutcome: ItemOutcome | null;
  /** True when the KO verdict is not the same across every live item. */
  swings: boolean;
  /** Total usage share of items that score the KO from current HP, 0-100. */
  koProbability: number;
  /** Player-facing sentence, or null when there is nothing worth saying. */
  text: string | null;
}

// Variant Pokemon are cached by identity so repeated renders reuse the same
// objects and stay inside the damage-layer memo.
const variantCache = new WeakMap<MonState, Map<string, MonState>>();

/** The same Pokemon holding a different item. */
export function withItem(mon: MonState, item: string): MonState {
  if (mon.set.item === item && mon.itemActive) return mon;
  let byItem = variantCache.get(mon);
  if (!byItem) {
    byItem = new Map();
    variantCache.set(mon, byItem);
  }
  const hit = byItem.get(item);
  if (hit) return hit;

  const made: MonState = {
    ...mon,
    itemActive: true,
    set: { ...mon.set, item },
  };
  byItem.set(item, made);
  return made;
}

function outcomeOf(r: ResolvedMatchup, item: string, pct: number): ItemOutcome {
  return {
    item,
    pct,
    minPct: r.minPct,
    maxPct: r.maxPct,
    hitsToKO: r.hitsToKOworst,
    verdict: r.verdict,
    koChance: r.koChance,
  };
}

const KILLS = (v: Verdict) => v === "DEAD";

/**
 * How much does this move's outcome depend on an item we have not seen?
 *
 * Returns null when the move cannot be resolved at all. Returns a result with
 * `known: true` and a single outcome when the item is confirmed or the mon is
 * mine (I know exactly what my own Pokemon hold).
 */
export function itemSensitivity(
  attacker: MonState,
  defender: MonState,
  moveName: string,
  state: BattleState
): ItemSensitivity | null {
  const cand = itemCandidates(attacker);

  if (cand.known) {
    const r = resolveMatchup(attacker, defender, moveName, state);
    if (!r) return null;
    const only = outcomeOf(r, cand.best ?? attacker.set.item, 100);
    return {
      moveName,
      known: true,
      outcomes: [only],
      likelyOutcome: only,
      worstOutcome: only,
      swings: false,
      koProbability: KILLS(only.verdict) ? 100 : 0,
      text: null,
    };
  }

  const outcomes: ItemOutcome[] = [];
  for (const opt of cand.options) {
    const r = resolveMatchup(withItem(attacker, opt.name), defender, moveName, state);
    if (!r) continue;
    outcomes.push(outcomeOf(r, opt.name, opt.pct));
  }
  if (outcomes.length === 0) return null;

  // Most likely item drives the headline; hardest hit drives the warning.
  const likelyOutcome =
    outcomes.find((o) => o.item === cand.best) ?? outcomes[0];
  const sorted = [...outcomes].sort((a, b) => b.maxPct - a.maxPct);
  const worstOutcome = sorted[0];

  const verdicts = new Set(outcomes.map((o) => o.verdict));
  const swings = verdicts.size > 1;

  const totalMass = outcomes.reduce((s, o) => s + o.pct, 0);
  const koMass = outcomes.filter((o) => KILLS(o.verdict)).reduce((s, o) => s + o.pct, 0);
  // Renormalise: the candidate list is truncated at the usage cutoff, so the
  // shares do not sum to 100 and a raw sum would understate the risk.
  const koProbability = totalMass > 0 ? Math.round((100 * koMass) / totalMass) : 0;

  let text: string | null = null;
  if (swings) {
    const killers = outcomes.filter((o) => KILLS(o.verdict));
    if (killers.length > 0 && !KILLS(likelyOutcome.verdict)) {
      // The dangerous direction: it does not look lethal, but it is if they
      // are holding the boosting item.
      text =
        `KILLS if it has ${killers.map((k) => `${k.item} (${Math.round(k.pct)}%)`).join(" or ")}` +
        ` - ${koProbability}% of sets do. Bare it is ` +
        `${likelyOutcome.hitsToKO} hits (${likelyOutcome.minPct}-${likelyOutcome.maxPct}%).`;
    } else if (killers.length > 0) {
      const survivors = outcomes.filter((o) => !KILLS(o.verdict));
      text =
        `Kills with ${likelyOutcome.item}, but SURVIVES if it has ` +
        `${survivors.map((s) => s.item).join(" or ")} - only ${koProbability}% of sets kill.`;
    } else {
      text =
        `Item swings this: ${worstOutcome.item} gives ${worstOutcome.minPct}-${worstOutcome.maxPct}%, ` +
        `${sorted[sorted.length - 1].item} gives ${sorted[sorted.length - 1].minPct}-${sorted[sorted.length - 1].maxPct}%.`;
    }
  } else if (worstOutcome.item !== likelyOutcome.item && worstOutcome.maxPct > likelyOutcome.maxPct * 1.15) {
    // Same verdict but a materially harder hit - worth a quieter mention.
    text =
      `${worstOutcome.item} (${Math.round(worstOutcome.pct)}%) pushes this to ` +
      `${worstOutcome.minPct}-${worstOutcome.maxPct}% without changing the verdict.`;
  }

  return {
    moveName,
    known: false,
    outcomes: sorted,
    likelyOutcome,
    worstOutcome,
    swings,
    koProbability,
    text,
  };
}

/**
 * The scariest item-conditional outcome across a whole arsenal.
 *
 * Used for "what can this thing do to me if the item goes the wrong way" -
 * scans every move it could have and returns the swings worth showing, biggest
 * threat first.
 */
export function itemSwings(
  attacker: MonState,
  defender: MonState,
  moves: string[],
  state: BattleState
): ItemSensitivity[] {
  const out: ItemSensitivity[] = [];
  for (const m of moves) {
    const s = itemSensitivity(attacker, defender, m, state);
    if (s && s.text) out.push(s);
  }
  return out.sort((a, b) => (b.worstOutcome?.maxPct ?? 0) - (a.worstOutcome?.maxPct ?? 0));
}
