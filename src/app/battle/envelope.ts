// ===========================================================================
// Uncertainty. When the opponent's spread is still an ASSUMPTION, a single
// number is a lie. This module sweeps the plausible spreads and reports the
// BOUNDARY - the point at which the answer flips.
//
// BATTLE_MODEL.md: "Never present an assumed-set result as a certainty."
// ===========================================================================
import { computeStats } from "../../engine.js";
import type { SPSpread } from "../../engine.js";
import type { BattleState, MonState } from "../model/types.ts";
import { SP_BUDGET, SP_MAX_PER_STAT, spTotal } from "./stats.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup } from "./damage.ts";
import type { BuildMoveOpts } from "./moves.ts";

/** Rebuild a MonState with a different SP spread, preserving its HP fraction. */
export function withSP(mon: MonState, sp: SPSpread): MonState {
  const stats = computeStats(mon.set.base, sp, mon.set.nature);
  const frac = mon.maxHP > 0 ? mon.curHP / mon.maxHP : 1;
  return {
    ...mon,
    set: { ...mon.set, sp },
    maxHP: stats.hp,
    curHP: Math.max(1, Math.round(stats.hp * frac)),
  };
}

/**
 * Shift SP into bulk, paying for it out of the offensive stats of the assumed
 * spread so the result is still a legal 66-point build. Returns null if the
 * spread cannot fund the investment.
 */
export function bulkierVariant(
  sp: SPSpread,
  extraHP: number,
  extraDef: number,
  defKey: "def" | "spd"
): SPSpread | null {
  const out: SPSpread = { ...sp };
  out.hp = (out.hp ?? 0) + extraHP;
  out[defKey] = (out[defKey] ?? 0) + extraDef;
  if ((out.hp ?? 0) > SP_MAX_PER_STAT || (out[defKey] ?? 0) > SP_MAX_PER_STAT) return null;

  // Drain the cost from the stats this set is not using defensively.
  let owed = extraHP + extraDef;
  const donors = (["spa", "atk", "spe", defKey === "def" ? "spd" : "def"] as const).filter(
    (k) => k !== defKey
  );
  for (const k of donors) {
    if (owed <= 0) break;
    const have = out[k] ?? 0;
    const take = Math.min(have, owed);
    out[k] = have - take;
    owed -= take;
  }
  if (owed > 0) return null;
  if (spTotal(out as Record<string, number | undefined>) > SP_BUDGET) return null;
  return out;
}

export type BoundaryKind = "certain" | "conditional" | "never";

export interface KOBoundary {
  kind: BoundaryKind;
  /** Smallest extra HP SP (over the assumed spread) that breaks a guaranteed KO. */
  breaksAtExtraHP?: number;
  /** Same, expressed as investment in the relevant defence. */
  breaksAtExtraDef?: number;
  defKey: "def" | "spd";
  text: string;
}

/**
 * How robust is a guaranteed KO to the opponent actually being bulkier than
 * the common set assumes?
 */
export function koBoundary(
  attacker: MonState,
  defender: MonState,
  moveName: string,
  state: BattleState,
  opts: BuildMoveOpts = {}
): KOBoundary | null {
  const baseline = resolveMatchup(attacker, defender, moveName, state, opts);
  if (!baseline) return null;
  const defKey: "def" | "spd" = baseline.category === "phys" ? "def" : "spd";

  // Only meaningful for an unconfirmed opposing spread.
  if (defender.revealed.sp || defender.side === "me") return null;
  if (baseline.verdict === "IMMUNE") return null;

  const assumed = defender.set.sp;

  const stillKOs = (extraHP: number, extraDef: number): boolean | null => {
    const sp = bulkierVariant(assumed, extraHP, extraDef, defKey);
    if (!sp) return null;
    const variant = withSP(defender, sp);
    const r = resolveMatchup(attacker, variant, moveName, state, opts);
    return r ? r.verdict === "DEAD" : null;
  };

  if (baseline.verdict !== "DEAD") {
    // Not a guaranteed KO even against the assumed (usually frailer) spread.
    return {
      kind: "never",
      defKey,
      text: "not a guaranteed KO even on the assumed spread",
    };
  }

  // Walk HP investment up until the KO fails.
  let breakHP: number | undefined;
  for (let extra = 1; extra <= SP_MAX_PER_STAT; extra++) {
    const ko = stillKOs(extra, 0);
    if (ko === null) break; // spread can no longer fund it
    if (!ko) { breakHP = extra; break; }
  }

  let breakDef: number | undefined;
  for (let extra = 1; extra <= SP_MAX_PER_STAT; extra++) {
    const ko = stillKOs(0, extra);
    if (ko === null) break;
    if (!ko) { breakDef = extra; break; }
  }

  if (breakHP === undefined && breakDef === undefined) {
    return {
      kind: "certain",
      defKey,
      text: "guaranteed KO on any spread they could legally be running",
    };
  }

  const parts: string[] = [];
  if (breakHP !== undefined) parts.push(`+${breakHP} SP in HP`);
  if (breakDef !== undefined) parts.push(`+${breakDef} SP in ${defKey === "def" ? "Def" : "SpD"}`);

  return {
    kind: "conditional",
    breaksAtExtraHP: breakHP,
    breaksAtExtraDef: breakDef,
    defKey,
    text: `guaranteed KO unless they run ${parts.join(" or ")} more than the common set`,
  };
}

// ---------------------------------------------------------------------------
// Reverse SP survival optimizer (BUILD_BRIEF feature 3).
// ---------------------------------------------------------------------------
export type SurviveGoal = "guaranteed" | "ninety";

export interface SPSolution {
  sp: SPSpread;
  hpSP: number;
  defSP: number;
  spentOnBulk: number;
  spLeft: number;
  maxPct: number;
  koChance: string;
  verdict: string;
}

/**
 * Minimum HP + Def/SpD investment that survives a given incoming hit.
 * Brute force over the (hp, def) grid - 33x33 is trivial.
 */
export function minimumSPToSurvive(
  defender: MonState,
  attacker: MonState,
  moveName: string,
  state: BattleState,
  goal: SurviveGoal = "guaranteed",
  opts: BuildMoveOpts = {}
): SPSolution | null {
  const probe = resolveMatchup(attacker, defender, moveName, state, opts);
  if (!probe) return null;
  const defKey: "def" | "spd" = probe.category === "phys" ? "def" : "spd";

  const survives = (r: ResolvedMatchup): boolean => {
    if (goal === "guaranteed") return r.maxPct < 100;
    // "survive 90%": at most 10% of the 16 rolls may KO.
    if (r.koChance === "guaranteed survive") return true;
    if (r.koChance === "guaranteed KO") return false;
    const m = /^(\d+)% to KO$/.exec(r.koChance);
    return m ? Number(m[1]) <= 10 : false;
  };

  for (let total = 0; total <= SP_MAX_PER_STAT * 2; total++) {
    for (let hp = 0; hp <= Math.min(total, SP_MAX_PER_STAT); hp++) {
      const dv = total - hp;
      if (dv > SP_MAX_PER_STAT) continue;
      const sp = { hp, [defKey]: dv } as SPSpread;
      if (spTotal(sp as Record<string, number | undefined>) > SP_BUDGET) continue;

      const variant = withSP(defender, sp);
      // Evaluate from FULL HP - this is a team-building question.
      const full = { ...variant, curHP: variant.maxHP };
      const r = resolveMatchup(attacker, full, moveName, state, opts);
      if (!r) continue;
      if (survives(r)) {
        return {
          sp,
          hpSP: hp,
          defSP: dv,
          spentOnBulk: total,
          spLeft: SP_BUDGET - total,
          maxPct: r.maxPct,
          koChance: r.koChance,
          verdict: r.verdictFull,
        };
      }
    }
  }
  return null;
}
