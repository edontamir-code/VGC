// ===========================================================================
// Your own team, saved separately from the battle.
//
// Kept out of BattleState on purpose: resetting a battle must not throw away
// the team you spent time entering, and the team should survive between games.
// ===========================================================================
import type { MonSet } from "../model/types.ts";
import { builtInTeam } from "../model/species.ts";

const KEY = "champions-my-team-v1";

/**
 * A cheap identity for a set of six: species and the stats that define them.
 *
 * Used to notice when team.js has changed underneath a saved copy. Without it,
 * a team saved from an older deployment wins over the file forever - which is
 * exactly what happened: the app kept loading a Glimmora that had not been on
 * the team for weeks, because localStorage outlived the source.
 */
export function teamFingerprint(sets: MonSet[]): string {
  return sets
    .map((s) => `${s.speciesId}:${s.name}`)
    .sort()
    .join("|");
}

interface StoredTeam {
  /** The team as saved. */
  sets: MonSet[];
  /**
   * Fingerprint of the BUILT-IN team at the time this was saved. When the file
   * changes, this no longer matches and the saved copy is known to be stale.
   */
  builtIn: string;
}

function readStored(): StoredTeam | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // The original shape was a bare array with no provenance. Anything in that
    // shape predates the fingerprint and cannot be checked, so it is treated as
    // stale - the file is the better source.
    if (Array.isArray(parsed)) return null;
    const stored = parsed as StoredTeam;
    if (!Array.isArray(stored?.sets) || stored.sets.length === 0) return null;
    if (!stored.sets.every((s) => s && s.base && s.sp && Array.isArray(s.moves))) return null;
    return stored;
  } catch {
    return null;
  }
}

export function loadMyTeam(): MonSet[] | null {
  const stored = readStored();
  if (!stored) return null;
  // team.js has changed since this was saved: the file wins.
  if (stored.builtIn !== teamFingerprint(builtInTeam())) return null;
  return stored.sets;
}

/** True when a saved team was discarded because team.js moved on. */
export function savedTeamWasStale(): boolean {
  try {
    if (!localStorage.getItem(KEY)) return false;
  } catch {
    return false;
  }
  const stored = readStored();
  // Either the old shape, or a fingerprint that no longer matches.
  return !stored || stored.builtIn !== teamFingerprint(builtInTeam());
}

export function saveMyTeam(sets: MonSet[]): void {
  try {
    const payload: StoredTeam = { sets, builtIn: teamFingerprint(builtInTeam()) };
    localStorage.setItem(KEY, JSON.stringify(payload));
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
