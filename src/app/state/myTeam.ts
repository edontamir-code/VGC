// ===========================================================================
// Your own team, saved separately from the battle.
//
// Kept out of BattleState on purpose: resetting a battle must not throw away
// the team you spent time entering, and the team should survive between games.
// ===========================================================================
import type { MonSet } from "../model/types.ts";
import { builtInTeam } from "../model/species.ts";

const KEY = "champions-my-team-v1";

export function loadMyTeam(): MonSet[] | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as MonSet[];
    if (!Array.isArray(parsed) || parsed.length === 0) return null;
    // Guard against a half-written or older shape.
    if (!parsed.every((s) => s && s.base && s.sp && Array.isArray(s.moves))) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveMyTeam(sets: MonSet[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(sets));
  } catch {
    /* storage unavailable - the app still works, it just will not persist */
  }
}

export function clearMyTeam(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

/** The team to build a battle from: yours if saved, otherwise the built-in six. */
export function effectiveTeam(): MonSet[] {
  return loadMyTeam() ?? builtInTeam();
}

export function isCustomTeam(): boolean {
  return loadMyTeam() !== null;
}
