// ===========================================================================
// Turning a MonState into the numbers the engine wants.
// All arithmetic here is *assembly* of engine inputs - the damage and speed
// math itself stays in src/engine.js and src/speed.js.
// ===========================================================================
import { computeStats } from "../../engine.js";
import { stageMult } from "../../speed.js";
import type { Stats } from "../../engine.js";
import type { BattleState, MonState, Stages } from "../model/types.ts";
import { preMegaProfile } from "../model/megaforms.ts";
import { abilityStatMults, applyStatMults } from "./abilities.ts";

/** The species profile that is actually on the field right now. */
export interface ActiveProfile {
  displayName: string;
  base: Stats;
  types: string[];
  ability: string;
  immuneTypes: string[];
  /** True when the pre-Mega ability/typing is inferred, not documented. */
  inferred: boolean;
}

/**
 * The base form's display name. Derived from the Mega name ("Mega Raichu Y" ->
 * "Raichu") because the species id is a lowercase database key for opponents
 * and would otherwise be shown to the user verbatim.
 */
function preMegaName(megaName: string, speciesId: string): string {
  const m = /^Mega\s+(.+?)(?:\s+[XY])?$/i.exec(megaName);
  if (m) return m[1];
  if (/^[a-z0-9-]+$/.test(speciesId)) {
    return speciesId
      .split("-")
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join("-");
  }
  return speciesId;
}

export function activeProfile(mon: MonState): ActiveProfile {
  const s = mon.set;
  if (!mon.hasMega && s.baseForm) {
    const pre = preMegaProfile(s.speciesId);
    return {
      displayName: preMegaName(s.name, s.speciesId),
      base: s.baseForm,
      types: pre?.types ?? s.types,
      ability: pre?.ability ?? s.ability,
      immuneTypes: pre?.immuneTypes ?? [],
      inferred: pre ? Boolean(pre.assumed) : true,
    };
  }
  return {
    displayName: s.name,
    base: s.base,
    types: s.types,
    ability: s.ability,
    immuneTypes: s.immuneTypes ?? [],
    inferred: false,
  };
}

/** Stats with no stat stages applied. Speed for `effectiveSpeed` comes from here. */
export function rawStats(mon: MonState): Stats {
  const p = activeProfile(mon);
  return computeStats(p.base, mon.set.sp, mon.set.nature);
}

/**
 * Stat stages applied to the four combat stats and Spe.
 * NOTE: pass the RAW Spe to `effectiveSpeed` - it applies the Spe stage itself
 * (speed.js:16). Using the staged Spe there would double-count the stage.
 */
export function stagedStats(mon: MonState): Stats {
  const raw = rawStats(mon);
  const st: Stages = mon.stages;
  return {
    hp: raw.hp,
    atk: Math.floor(raw.atk * stageMult(st.atk)),
    def: Math.floor(raw.def * stageMult(st.def)),
    spa: Math.floor(raw.spa * stageMult(st.spa)),
    spd: Math.floor(raw.spd * stageMult(st.spd)),
    spe: Math.floor(raw.spe * stageMult(st.spe)),
  };
}

/**
 * Stat stages AND the mon's ability applied - this is what the damage layer
 * should use. Huge Power lives here, which is why Mega Mawile finally reads at
 * its real Attack instead of half of it.
 */
export function battleStats(mon: MonState, state: BattleState): Stats {
  return applyStatMults(stagedStats(mon), abilityStatMults(mon, state));
}

/** Type immunities granted by an ability, on top of the type chart. */
const ABILITY_IMMUNITIES: Record<string, string> = {
  Levitate: "Ground",
  "Flash Fire": "Fire",
  "Volt Absorb": "Electric",
  "Lightning Rod": "Electric",
  "Motor Drive": "Electric",
  "Water Absorb": "Water",
  "Storm Drain": "Water",
  "Dry Skin": "Water",
  "Sap Sipper": "Grass",
};

/** Everything this mon is immune to right now (set data + current ability). */
export function immuneTypesOf(mon: MonState): string[] {
  const p = activeProfile(mon);
  const out = new Set(p.immuneTypes);
  const fromAbility = ABILITY_IMMUNITIES[p.ability];
  if (fromAbility) out.add(fromAbility);
  return [...out];
}

/** HP as a percentage of max, for display. */
export function hpPct(mon: MonState): number {
  if (mon.maxHP <= 0) return 0;
  return Math.max(0, Math.min(100, (100 * mon.curHP) / mon.maxHP));
}

/** Total SP spent, for the 66-point budget display. */
export function spTotal(sp: Record<string, number | undefined>): number {
  return (["hp", "atk", "def", "spa", "spd", "spe"] as const).reduce(
    (n, k) => n + (sp[k] ?? 0),
    0
  );
}

export const SP_BUDGET = 66;
export const SP_MAX_PER_STAT = 32;
