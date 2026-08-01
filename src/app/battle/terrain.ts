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
import type { BattleState, MonState, TerrainKind } from "../model/types.ts";
import { activeProfile } from "./stats.ts";

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
