// ===========================================================================
// Terrain, grounding, and the rules that quietly invalidate whole game plans.
//
// The two that matter most for a planner:
//   - Psychic Terrain blocks EVERY priority move against a grounded target.
//     Fake Out, Sucker Punch, Aqua Jet, Bullet Punch and any Prankster-boosted
//     status move simply fail. A pin built on "they Fake Out here" is void.
//   - Prankster status moves fail against Dark types entirely, terrain or not.
//     Whimsicott cannot Encore or Taunt a Kingambit.
//
// Terrain only affects GROUNDED Pokemon. A Flying type or a Levitate mon is
// untouched by all of it, which is why Fake Out still works on a Charizard.
// ===========================================================================
import type { BattleState, MonState, SideId, TerrainKind } from "../model/types.ts";
import { activeProfile } from "./stats.ts";
import { grantsSidePriorityImmunity } from "./abilities.ts";

/**
 * Grounded = affected by terrain (and by Ground moves).
 * Not modelled: Air Balloon, Magnet Rise, Roost's temporary grounding, Gravity
 * forcing everything down.
 */
export function isGrounded(mon: MonState, state?: BattleState): boolean {
  // Gravity grounds everything.
  if (state && state.field.gravity > 0) return true;
  const p = activeProfile(mon);
  if (p.types.includes("Flying")) return false;
  if (p.ability === "Levitate") return false;
  return true;
}

export function terrainOf(state: BattleState): TerrainKind | null {
  return state.field.terrain?.kind ?? null;
}

/**
 * Does Psychic Terrain stop this move?
 * Only priority moves, only against a grounded target on the other side.
 */
export function blockedByPsychicTerrain(
  state: BattleState,
  target: MonState,
  priority: number
): boolean {
  if (terrainOf(state) !== "psychic") return false;
  if (priority <= 0) return false;
  return isGrounded(target, state);
}

/**
 * Armor Tail / Dazzling / Queenly Majesty block opposing priority moves against
 * the ENTIRE side, not just the holder. While Farigiraf is out you cannot be
 * Fake Out flinched, Sucker Punched or Prankster-Encored - on either of your
 * mons. That is one of the strongest defensive abilities in the format and it
 * reshapes what leads are safe.
 *
 * Returns the ability name that is doing the blocking, or null.
 *
 * IMPORTANT: this only blocks moves coming FROM the other side. A side's own
 * self-targeting priority (Protect at +4, Extreme Speed from an ally) is
 * unaffected.
 */
export function sidePriorityGuard(
  state: BattleState,
  defendingSide: SideId
): { ability: string; holder: MonState } | null {
  for (const uid of state.sides[defendingSide].active) {
    if (!uid) continue;
    const mon = state.mons[uid];
    if (!mon || mon.fainted) continue;
    const ability = grantsSidePriorityImmunity(mon);
    if (ability) return { ability, holder: mon };
  }
  return null;
}

/** Is this specific attack stopped by the defending side's priority guard? */
export function blockedBySidePriorityGuard(
  state: BattleState,
  attackerSide: SideId,
  defendingSide: SideId,
  priority: number
): { ability: string; holder: MonState } | null {
  if (priority <= 0) return null;
  if (attackerSide === defendingSide) return null;
  return sidePriorityGuard(state, defendingSide);
}

/**
 * Prankster's status moves do not affect Dark types (Gen 7+).
 * This is separate from terrain and applies always.
 */
export function blockedByPranksterDark(
  attacker: MonState,
  target: MonState,
  isStatusMove: boolean
): boolean {
  if (!isStatusMove) return false;
  if (activeProfile(attacker).ability !== "Prankster") return false;
  return activeProfile(target).types.includes("Dark");
}

/**
 * Terrain's damage modifier, expressed as a plain multiplier so it can ride on
 * the engine's existing `otherMult` input. Nothing here touches the engine.
 */
export function terrainDamageMult(
  state: BattleState,
  attacker: MonState,
  target: MonState,
  moveType: string,
  moveName: string
): { mult: number; label: string | null } {
  const kind = terrainOf(state);
  if (!kind) return { mult: 1, label: null };

  const attackerGrounded = isGrounded(attacker, state);
  const targetGrounded = isGrounded(target, state);

  // Boosts require the ATTACKER to be grounded.
  if (attackerGrounded) {
    if (kind === "electric" && moveType === "Electric") {
      return { mult: 1.3, label: "Electric Terrain x1.3" };
    }
    if (kind === "grassy" && moveType === "Grass") {
      return { mult: 1.3, label: "Grassy Terrain x1.3" };
    }
    if (kind === "psychic" && moveType === "Psychic") {
      return { mult: 1.3, label: "Psychic Terrain x1.3" };
    }
  }

  // Reductions apply to grounded TARGETS.
  if (targetGrounded) {
    if (kind === "grassy" && ["Earthquake", "Bulldoze", "Magnitude"].includes(moveName)) {
      return { mult: 0.5, label: "Grassy Terrain halves Earthquake" };
    }
    if (kind === "misty" && moveType === "Dragon") {
      return { mult: 0.5, label: "Misty Terrain halves Dragon" };
    }
  }

  return { mult: 1, label: null };
}

export const TERRAIN_LABEL: Record<TerrainKind, string> = {
  electric: "Electric",
  grassy: "Grassy",
  misty: "Misty",
  psychic: "Psychic",
};
