// ===========================================================================
// Learning their spread from how hard they actually hit.
//
// "Heat Wave did 82% to Raichu" is not just a number to write on the HP bar -
// it is a measurement of Charizard's Special Attack. Run the damage formula
// backwards over every SpA stat the species could legally have, keep the ones
// that could have produced that percentage, and you have a bound on their
// investment that holds for the rest of the game.
//
// The budget is what makes this powerful. SP is 0-32 per stat and 66 TOTAL, so
// proving they spent 32 in SpA proves they have at most 34 left for everything
// else. "He hit that hard, so he is not also bulky" is a real deduction, not a
// vibe, and it is exactly what a good player is doing in their head.
//
// Both directions:
//   their damage to me   -> their ATTACKING stat (my defence is known exactly)
//   my damage to them    -> their DEFENDING stat and HP (my attack is known)
//
// Soundness rules, same as everywhere else in this tool:
//   - damage rolls are a RANGE (85-100%), so one observation admits a band of
//     stats, never a single value
//   - an observation is only used when the modifiers are unambiguous; if we
//     cannot tell whether a screen or an Intimidate was up, we do not guess
//   - narrowing only ever REMOVES candidates that could not have produced what
//     was seen, so a candidate set can never exclude the truth
// ===========================================================================
import { statHP, statOther } from "../../engine.js";
import type { BattleState, MonState, SPSpread } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import { SP_MAX_PER_STAT, activeProfile } from "./stats.ts";

/** SP is 0-32 per stat and 66 across all six. */
export const SP_TOTAL = 66;

export type OffStat = "atk" | "spa";
export type DefStat = "def" | "spd";
export type InferredStat = OffStat | DefStat | "hp";

/** A stat value together with the SP that would produce it. */
export interface StatOption {
  stat: number;
  sp: number;
  /** Nature multiplier that produced it: 0.9, 1.0 or 1.1. */
  nature: number;
}

/** Every value of one stat this species could legally have. */
export function possibleStats(mon: MonState, key: InferredStat): StatOption[] {
  const base = activeProfile(mon).base[key];
  const out: StatOption[] = [];
  const seen = new Set<string>();

  if (key === "hp") {
    for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
      out.push({ stat: statHP(base, sp), sp, nature: 1 });
    }
    return out;
  }
  for (const nature of [0.9, 1.0, 1.1]) {
    for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
      const stat = statOther(base, sp, nature);
      const k = `${stat}:${sp}`;
      if (seen.has(k)) continue;
      seen.add(k);
      out.push({ stat, sp, nature });
    }
  }
  return out.sort((a, b) => a.stat - b.stat);
}

/** A hypothetical version of a Pokemon with one stat forced to a given SP. */
function withStat(mon: MonState, key: InferredStat, opt: StatOption): MonState {
  const sp: SPSpread = { ...mon.set.sp, [key]: opt.sp };
  const nature = { ...mon.set.nature };
  if (key !== "hp") {
    // Reproduce the nature that produced this option, so the stat we test is
    // the stat the engine will compute.
    if (opt.nature > 1) {
      nature.plus = key;
      if (nature.minus === key) nature.minus = undefined;
    } else if (opt.nature < 1) {
      nature.minus = key;
      if (nature.plus === key) nature.plus = undefined;
    } else {
      if (nature.plus === key) nature.plus = undefined;
      if (nature.minus === key) nature.minus = undefined;
    }
  }
  return { ...mon, set: { ...mon.set, sp, nature } };
}

export interface DamageObservation {
  attackerUid: string;
  defenderUid: string;
  moveName: string;
  /** Damage actually dealt, in HP. */
  damage: number;
  /** The defender's max HP at the time - needed to read a percentage. */
  defenderMaxHP: number;
}

export interface StatNarrowing {
  uid: string;
  key: InferredStat;
  /** SP values still possible for that stat. */
  sp: number[];
  /** Stat values still possible. */
  stats: number[];
  before: { min: number; max: number };
  after: { min: number; max: number };
  text: string;
}

const nameOf = (m: MonState) => activeProfile(m).displayName;

/**
 * Which values of `key` on `subject` could have produced the observed damage?
 *
 * The other side of the calc is taken as known: my own Pokemon are exact, and
 * anything already confirmed about theirs is used as-is.
 */
export function consistentStats(
  obs: DamageObservation,
  subject: "attacker" | "defender",
  key: InferredStat,
  state: BattleState
): StatOption[] {
  const attacker = state.mons[obs.attackerUid];
  const defender = state.mons[obs.defenderUid];
  if (!attacker || !defender) return [];

  const target = subject === "attacker" ? attacker : defender;
  const options = possibleStats(target, key);
  const kept: StatOption[] = [];

  for (const opt of options) {
    const a = subject === "attacker" ? withStat(attacker, key, opt) : attacker;
    const d = subject === "defender" ? withStat(defender, key, opt) : defender;
    const r = resolveMatchup(a, d, obs.moveName, state);
    if (!r || r.max <= 0) continue;
    // The damage roll is a band. An observation is consistent with this stat if
    // the number actually seen sits inside it. One HP of slack absorbs the
    // rounding you get from reading a percentage off the screen.
    if (obs.damage >= r.min - 1 && obs.damage <= r.max + 1) kept.push(opt);
  }
  return kept;
}

function range(values: number[]): { min: number; max: number } {
  if (!values.length) return { min: 0, max: 0 };
  return { min: Math.min(...values), max: Math.max(...values) };
}

/**
 * Turn one observed hit into everything it teaches about their spread.
 *
 * Only the OPPONENT's stats are inferred - mine are known, and "learning" them
 * from a calc would just be re-deriving what the team file already says.
 */
export function narrowFromDamage(
  obs: DamageObservation,
  state: BattleState
): StatNarrowing[] {
  const attacker = state.mons[obs.attackerUid];
  const defender = state.mons[obs.defenderUid];
  if (!attacker || !defender) return [];

  const out: StatNarrowing[] = [];
  const r = resolveMatchup(attacker, defender, obs.moveName, state);
  if (!r) return out;

  const offKey: OffStat = r.category === "phys" ? "atk" : "spa";
  const defKey: DefStat = r.category === "phys" ? "def" : "spd";

  // Their attacking stat, measured by what they did to me.
  if (attacker.side === "opp" && !attacker.revealed.sp) {
    const kept = consistentStats(obs, "attacker", offKey, state);
    if (kept.length && kept.length < possibleStats(attacker, offKey).length) {
      const before = range(possibleStats(attacker, offKey).map((o) => o.stat));
      const after = range(kept.map((o) => o.stat));
      const spRange = range(kept.map((o) => o.sp));
      out.push({
        uid: attacker.uid,
        key: offKey,
        sp: [...new Set(kept.map((o) => o.sp))].sort((a, b) => a - b),
        stats: [...new Set(kept.map((o) => o.stat))].sort((a, b) => a - b),
        before,
        after,
        text:
          `${nameOf(attacker)} ${obs.moveName} did ${Math.round((100 * obs.damage) / obs.defenderMaxHP)}% ` +
          `to ${nameOf(defender)}, so its ${offKey.toUpperCase()} is ${after.min}-${after.max} ` +
          `(was ${before.min}-${before.max})` +
          // Only claim SP when the stat cannot be reached even with a boosting
          // nature. Nature is free here, so "0-32 SP" is true and useless.
          (spRange.min > 0
            ? ` - at least ${spRange.min} SP, whatever nature it runs.`
            : `. A boosting nature explains this without any SP, so no investment is proved yet.`),
      });
    }
  }

  // Their bulk, measured by what I did to them.
  if (defender.side === "opp" && !defender.revealed.sp) {
    for (const key of [defKey, "hp"] as InferredStat[]) {
      const kept = consistentStats(obs, "defender", key, state);
      if (!kept.length || kept.length >= possibleStats(defender, key).length) continue;
      const before = range(possibleStats(defender, key).map((o) => o.stat));
      const after = range(kept.map((o) => o.stat));
      const spRange = range(kept.map((o) => o.sp));
      out.push({
        uid: defender.uid,
        key,
        sp: [...new Set(kept.map((o) => o.sp))].sort((a, b) => a - b),
        stats: [...new Set(kept.map((o) => o.stat))].sort((a, b) => a - b),
        before,
        after,
        text:
          `${nameOf(attacker)} ${obs.moveName} did ${obs.damage} to ${nameOf(defender)}, ` +
          `so its ${key.toUpperCase()} is ${after.min}-${after.max} ` +
          `(was ${before.min}-${before.max})` +
          (spRange.min > 0 ? ` - at least ${spRange.min} SP.` : `, with no SP proved yet.`),
      });
    }
  }

  return out;
}

/**
 * Damage that NO legal spread could have produced.
 *
 * If every candidate is ruled out, the problem is not their spread - it is one
 * of the assumptions the calc was built on. Silently discarding the observation
 * (which is what an empty candidate set does if you do not check for it) throws
 * away the single most informative thing that happened: something on the board
 * is not what the tool thinks it is.
 *
 * The tool cannot know WHICH assumption is wrong, so it lists them rather than
 * picking one and being confidently wrong about it.
 */
export function damageContradiction(
  obs: DamageObservation,
  state: BattleState
): string | null {
  const attacker = state.mons[obs.attackerUid];
  const defender = state.mons[obs.defenderUid];
  if (!attacker || !defender) return null;

  const r = resolveMatchup(attacker, defender, obs.moveName, state);
  if (!r) return null;

  const offKey: OffStat = r.category === "phys" ? "atk" : "spa";
  // Only meaningful when the attacker's spread is the unknown.
  if (attacker.side !== "opp" || attacker.revealed.sp) return null;
  if (consistentStats(obs, "attacker", offKey, state).length > 0) return null;

  const all = possibleStats(attacker, offKey);
  const extremes = [all[0], all[all.length - 1]];
  const bounds = extremes
    .map((o) => {
      const test = resolveMatchup(
        // Rebuild the attacker at this extreme to get the achievable band.
        { ...attacker, set: { ...attacker.set, sp: { ...attacker.set.sp, [offKey]: o.sp } } },
        defender,
        obs.moveName,
        state
      );
      return test ? { min: test.min, max: test.max } : null;
    })
    .filter(Boolean) as { min: number; max: number }[];

  const lo = Math.min(...bounds.map((b) => b.min));
  const hi = Math.max(...bounds.map((b) => b.max));
  const pct = Math.round((100 * obs.damage) / obs.defenderMaxHP);

  return (
    `${obs.damage} damage (${pct}%) from ${nameOf(attacker)} ${obs.moveName} is IMPOSSIBLE - ` +
    `even the ${obs.damage < lo ? "least" : "most"} invested spread does ${lo}-${hi}. ` +
    `Something else is going on: a screen, an Intimidate, a resist berry, the weather not being ` +
    `what the board says, or ${nameOf(defender)}'s own spread being different from your team file. ` +
    `Nothing has been deduced from this hit.`
  );
}

// ---------------------------------------------------------------------------
// The budget deduction
// ---------------------------------------------------------------------------

export interface BudgetRead {
  uid: string;
  /** Minimum SP we have proved is committed to the stats we have measured. */
  committed: number;
  /** What is left for everything else. */
  remaining: number;
  /** Per-stat minimum SP, for the stats we have bounds on. */
  floors: { key: InferredStat; minSP: number }[];
  text: string | null;
}

/**
 * What proving investment in one stat says about all the others.
 *
 * This is the deduction that actually changes decisions: a Charizard that hit
 * hard enough to need 28 SP in Special Attack has at most 38 left, so it cannot
 * ALSO be the bulky spread that lives through your answer. The tool can only
 * make this claim about stats it has measured, so it states the floor and the
 * remainder rather than pretending to know the whole spread.
 */
export function budgetRead(mon: MonState, floors: Record<string, number>): BudgetRead {
  const entries = Object.entries(floors).filter(([, v]) => v > 0);
  const committed = entries.reduce((s, [, v]) => s + v, 0);
  const remaining = Math.max(0, SP_TOTAL - committed);

  const text =
    committed > 0
      ? `${nameOf(mon)} has at least ${committed} of its 66 SP proved committed ` +
        `(${entries.map(([k, v]) => `${v} in ${k.toUpperCase()}`).join(", ")}), leaving at most ` +
        `${remaining} for everything else` +
        (remaining < 34
          ? `. It cannot be both this offensive and bulky - stop planning around the defensive spread.`
          : `.`)
      : null;

  return {
    uid: mon.uid,
    committed,
    remaining,
    floors: entries.map(([key, minSP]) => ({ key: key as InferredStat, minSP })),
    text,
  };
}
