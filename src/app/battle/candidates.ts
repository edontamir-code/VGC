// ===========================================================================
// What could this Pokemon be holding, and what could its ability be?
//
// Before a game starts you know their SPECIES and nothing else. Everything
// after that is deduction, and every turn hands you more of it. This module
// holds the candidate sets - item, ability, moves - and narrows them as you
// observe.
//
// The Venusaur case: some run Focus Sash, some are Mega. Those are different
// Pokemon with different stats and different answers, and you do not know
// which until it Megas or you see the Sash proc. Until then, both are live.
//
// Cutoff: options below INCLUSION_CUTOFF (5%) are not planned around. The
// ladder data has a long tail of off-meta builds, and treating a 3% item as a
// live threat would make every plan collapse for no reason. Anything you have
// actually SEEN is always included, however rare it is.
// ===========================================================================
import { likely, usageFor, INCLUSION_CUTOFF } from "../../data/usage.js";
import type { LikelyOption } from "../../data/usage.js";
import type { MonState } from "../model/types.ts";

export { INCLUSION_CUTOFF };

export interface CandidateSet {
  /** What we have actually seen. Empty until observed. */
  confirmed: string | null;
  /** Everything still possible, most-used first. */
  options: LikelyOption[];
  /** Ruled out by observation. */
  ruledOut: string[];
  /** True when only one option remains - it is effectively known. */
  known: boolean;
  /** The single best guess right now. */
  best: string | null;
}

function build(
  distribution: Record<string, number> | undefined,
  fallback: string,
  confirmed: string | null,
  ruledOut: string[]
): CandidateSet {
  if (confirmed) {
    return { confirmed, options: [{ name: confirmed, pct: 100 }], ruledOut, known: true, best: confirmed };
  }
  let options = likely(distribution).filter((o) => !ruledOut.includes(o.name));
  // A species with no usage data still has the set we assume for it.
  if (options.length === 0 && fallback && !ruledOut.includes(fallback)) {
    options = [{ name: fallback, pct: 100 }];
  }
  return {
    confirmed: null,
    options,
    ruledOut,
    known: options.length <= 1,
    best: options[0]?.name ?? fallback ?? null,
  };
}

/** Items this Pokemon could be holding. */
export function itemCandidates(mon: MonState): CandidateSet {
  if (mon.side === "me") {
    return { confirmed: mon.set.item, options: [{ name: mon.set.item, pct: 100 }], ruledOut: [], known: true, best: mon.set.item };
  }
  const u = usageFor(mon.set.speciesId);
  return build(
    u?.items,
    mon.set.item,
    mon.revealed.item ? mon.set.item : null,
    mon.revealed.itemRuledOut ?? []
  );
}

/** Abilities this Pokemon could have. */
export function abilityCandidates(mon: MonState): CandidateSet {
  if (mon.side === "me") {
    return { confirmed: mon.set.ability, options: [{ name: mon.set.ability, pct: 100 }], ruledOut: [], known: true, best: mon.set.ability };
  }
  const u = usageFor(mon.set.speciesId);
  return build(
    u?.abilities,
    mon.set.ability,
    mon.revealed.ability ? mon.set.ability : null,
    mon.revealed.abilityRuledOut ?? []
  );
}

/**
 * The move pool weighted by usage: everything at or above the cutoff, plus
 * anything already seen (however rare), minus anything ruled out.
 */
export function weightedMovePool(mon: MonState): LikelyOption[] {
  const u = usageFor(mon.set.speciesId);
  const seen = mon.revealed.moves ?? [];
  const out = mon.revealed.ruledOut ?? [];

  if (!u?.moves) {
    // No usage data - fall back to the declared pool at unknown weight.
    const pool = mon.set.movePool?.length ? mon.set.movePool : mon.set.moves;
    return pool
      .filter((m) => m && !out.includes(m))
      .map((name) => ({ name, pct: seen.includes(name) ? 100 : 50 }));
  }

  const above = likely(u.moves);
  // A move you have SEEN is certain, whatever its usage rate.
  for (const m of seen) {
    if (!above.some((o) => o.name === m)) above.push({ name: m, pct: 100 });
  }
  return above
    .filter((o) => !out.includes(o.name))
    .map((o) => (seen.includes(o.name) ? { ...o, pct: 100 } : o))
    .sort((a, b) => b.pct - a.pct);
}

/** How much is still unknown about this Pokemon, 0-100. */
export function uncertainty(mon: MonState): number {
  if (mon.side === "me") return 0;
  const item = itemCandidates(mon);
  const ability = abilityCandidates(mon);
  const moves = weightedMovePool(mon);
  const seen = (mon.revealed.moves ?? []).length;

  let score = 0;
  if (!item.known) score += 25;
  if (!ability.known) score += 15;
  if (!mon.revealed.sp) score += 25;
  score += 35 * Math.max(0, (Math.min(4, moves.length) - seen)) / 4;
  return Math.round(Math.min(100, score));
}
