// ===========================================================================
// Ability effects on stats and damage.
//
// Without this, Mega Mawile reads at HALF its real damage, because Huge Power
// doubles its Attack and nothing was applying it. An ability that doubles a
// stat is not a rounding detail - it is the difference between a KO and a
// two-turn trade.
//
// Everything here is expressed as multipliers fed through inputs the engine
// already accepts (pre-computed stats, otherMult). src/engine.js is untouched.
// ===========================================================================
import type { BattleState, MonState, Stats } from "../model/types.ts";
import { activeProfile } from "./stats.ts";

export interface StatMults {
  atk: number;
  def: number;
  spa: number;
  spd: number;
  spe: number;
}

const NEUTRAL: StatMults = { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 };

/**
 * Stat multipliers from the mon's own ability.
 * Speed-related abilities (Swift Swim, Chlorophyll, Unburden) are deliberately
 * NOT here - src/speed.js already owns those, and applying them twice would
 * double-count.
 */
export function abilityStatMults(mon: MonState, state: BattleState): StatMults {
  const ability = activeProfile(mon).ability;
  const m: StatMults = { ...NEUTRAL };
  const weather = state.field.weather?.kind ?? null;

  switch (ability) {
    case "Huge Power":
    case "Pure Power":
      m.atk *= 2;
      break;
    case "Hustle":
      m.atk *= 1.5;
      break;
    case "Guts":
      // Guts also ignores the burn Attack drop; damage.ts checks for it.
      if (mon.status && mon.status !== "slp") m.atk *= 1.5;
      break;
    case "Fur Coat":
      m.def *= 2;
      break;
    case "Ice Scales":
      m.spd *= 2;
      break;
    case "Marvel Scale":
      if (mon.status) m.def *= 1.5;
      break;
    case "Solar Power":
      if (weather === "sun") m.spa *= 1.5;
      break;
    case "Defeatist":
      if (mon.curHP * 2 <= mon.maxHP) {
        m.atk *= 0.5;
        m.spa *= 0.5;
      }
      break;
    default:
      break;
  }
  return m;
}

/** Apply the multipliers to a computed stat line. */
export function applyStatMults(stats: Stats, m: StatMults): Stats {
  return {
    hp: stats.hp,
    atk: Math.floor(stats.atk * m.atk),
    def: Math.floor(stats.def * m.def),
    spa: Math.floor(stats.spa * m.spa),
    spd: Math.floor(stats.spd * m.spd),
    spe: Math.floor(stats.spe * m.spe),
  };
}

/** True when the attacker's ability ignores its own burn. */
export function ignoresBurn(mon: MonState): boolean {
  return activeProfile(mon).ability === "Guts";
}

export interface DamageMod {
  mult: number;
  label: string;
}

/**
 * Damage multipliers from the ATTACKER's ability that depend on the move.
 */
export function attackerAbilityMods(
  attacker: MonState,
  moveName: string,
  moveType: string,
  power: number,
  contact: boolean
): DamageMod[] {
  const ability = activeProfile(attacker).ability;
  const out: DamageMod[] = [];
  switch (ability) {
    case "Technician":
      if (power <= 60) out.push({ mult: 1.5, label: "Technician x1.5" });
      break;
    case "Iron Fist":
      if (/Punch/i.test(moveName)) out.push({ mult: 1.2, label: "Iron Fist x1.2" });
      break;
    case "Strong Jaw":
      if (/Fang|Bite|Crunch/i.test(moveName)) out.push({ mult: 1.5, label: "Strong Jaw x1.5" });
      break;
    case "Reckless":
      if (/Brave Bird|Flare Blitz|Wave Crash|Double-Edge|Head Smash/i.test(moveName)) {
        out.push({ mult: 1.2, label: "Reckless x1.2" });
      }
      break;
    case "Sheer Force":
      out.push({ mult: 1.3, label: "Sheer Force x1.3 (only on moves with a secondary effect)" });
      break;
    case "Sand Force":
      if (["Rock", "Ground", "Steel"].includes(moveType)) {
        out.push({ mult: 1.3, label: "Sand Force x1.3" });
      }
      break;
    default:
      break;
  }
  void contact;
  return out;
}

/**
 * Damage multipliers from the DEFENDER's ability.
 * `typeMult` is the type effectiveness, needed by Filter / Solid Rock.
 */
export function defenderAbilityMods(
  defender: MonState,
  moveType: string,
  contact: boolean,
  typeMult: number
): DamageMod[] {
  const ability = activeProfile(defender).ability;
  const out: DamageMod[] = [];
  switch (ability) {
    case "Thick Fat":
      if (moveType === "Fire" || moveType === "Ice") {
        out.push({ mult: 0.5, label: "Thick Fat x0.5" });
      }
      break;
    case "Heatproof":
      if (moveType === "Fire") out.push({ mult: 0.5, label: "Heatproof x0.5" });
      break;
    case "Multiscale":
    case "Shadow Shield":
      if (defender.curHP === defender.maxHP) {
        out.push({ mult: 0.5, label: `${ability} x0.5 (at full HP)` });
      }
      break;
    case "Fluffy":
      if (contact) out.push({ mult: 0.5, label: "Fluffy x0.5 (contact)" });
      if (moveType === "Fire") out.push({ mult: 2, label: "Fluffy x2 (Fire)" });
      break;
    case "Filter":
    case "Solid Rock":
    case "Prism Armor":
      if (typeMult > 1) out.push({ mult: 0.75, label: `${ability} x0.75` });
      break;
    case "Purifying Salt":
      if (moveType === "Ghost") out.push({ mult: 0.5, label: "Purifying Salt x0.5" });
      break;
    default:
      break;
  }
  return out;
}

/**
 * Abilities whose effect the simulator cannot represent. Surfaced in the UI so
 * a plan is never quietly built on top of one.
 */
export const UNSIMULATED_ABILITIES: Record<string, string> = {
  "Rough Skin": "Chips the attacker on contact.",
  "Iron Barbs": "Chips the attacker on contact.",
  "Rocky Payload": "Boosts Rock moves.",
  "Good as Gold": "Blocks status moves entirely.",
  "Armor Tail": "Blocks ALL priority moves against its side.",
  "Dazzling": "Blocks priority moves against its side.",
  "Queenly Majesty": "Blocks priority moves against its side.",
  "Magic Bounce": "Reflects status moves back at the user.",
  "Hospitality": "Heals its ally on entry.",
  "Intimidate": "Drops both foes' Attack on entry - record it as a stat stage.",
  "Defiant": "Raises Attack when a stat is lowered.",
  "Competitive": "Raises SpA when a stat is lowered.",
  "Supreme Overlord": "Scales with fainted allies - modelled only if set as the ability.",
  "Friend Guard": "Reduces damage to its ally.",
  "Sturdy": "Survives a lethal hit from full HP.",
  "Contrary": "Inverts stat changes - Close Combat RAISES its defences.",
};

export function unsimulatedAbility(mon: MonState): string | null {
  const a = activeProfile(mon).ability;
  return UNSIMULATED_ABILITIES[a] ?? null;
}
