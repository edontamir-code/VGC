// ===========================================================================
// The back line.
//
// Switching is most of doubles. The question that decides games is rarely "does
// this KO" - it is "if I commit to this, what can they bring in?"
//
// You see six at team preview and they bring four. Two are on the field. The
// other two are SOMEWHERE in the remaining four, and until you have seen them
// the planner has to assume the worst one for you. That is the same
// adversarial treatment move pools get, applied to the bench.
// ===========================================================================
import { BROUGHT_COUNT } from "../model/types.ts";
import type { BattleState, MonState, SideId } from "../model/types.ts";

/** Everyone on this side, active and benched, that has not fainted. */
export function livingRoster(state: BattleState, side: SideId): MonState[] {
  return Object.values(state.mons).filter((m) => m.side === side && !m.fainted);
}

/** Pokemon that could legally come in for this side right now. */
export function possibleSwitchIns(state: BattleState, side: SideId): MonState[] {
  const activeUids = new Set(state.sides[side].active.filter(Boolean) as string[]);
  return state.sides[side].bench
    .map((uid) => state.mons[uid])
    .filter(
      (m): m is MonState =>
        Boolean(m) && !m.fainted && !activeUids.has(m.uid) && m.brought !== "out"
    );
}

/** How many of their four are accounted for. */
export function broughtCounts(state: BattleState, side: SideId) {
  const all = Object.values(state.mons).filter((m) => m.side === side);
  return {
    confirmed: all.filter((m) => m.brought === "confirmed").length,
    possible: all.filter((m) => m.brought === "possible").length,
    out: all.filter((m) => m.brought === "out").length,
    total: all.length,
  };
}

/**
 * Keep the brought-four consistent:
 *  - anything that has been on the field was definitely brought
 *  - once four are confirmed, nothing else can have been
 *
 * Returns the mons whose status should change, so the reducer can log it.
 */
export function reconcileBrought(
  state: BattleState,
  side: SideId
): { uid: string; brought: MonState["brought"] }[] {
  const changes: { uid: string; brought: MonState["brought"] }[] = [];
  const all = Object.values(state.mons).filter((m) => m.side === side);
  const activeUids = new Set(state.sides[side].active.filter(Boolean) as string[]);

  // Anything that has been out, or has taken damage, or has a revealed move,
  // was certainly brought.
  for (const m of all) {
    const seen =
      activeUids.has(m.uid) ||
      m.turnsOnField > 0 ||
      m.fainted ||
      m.curHP < m.maxHP ||
      m.revealed.moves.length > 0;
    if (seen && m.brought !== "confirmed") {
      changes.push({ uid: m.uid, brought: "confirmed" });
    }
  }

  const confirmed =
    all.filter((m) => m.brought === "confirmed").length +
    changes.filter((c) => c.brought === "confirmed").length;

  if (confirmed >= BROUGHT_COUNT) {
    for (const m of all) {
      const pending = changes.find((c) => c.uid === m.uid);
      const status = pending?.brought ?? m.brought;
      if (status === "possible") changes.push({ uid: m.uid, brought: "out" });
    }
  }

  return changes;
}

/** Plain-English summary for the UI. */
export function rosterSummary(state: BattleState, side: SideId): string {
  const c = broughtCounts(state, side);
  if (c.total === 0) return "no roster entered";
  if (c.possible === 0) return `all ${c.confirmed} brought Pokemon known`;
  return `${c.confirmed} of ${BROUGHT_COUNT} confirmed, ${c.possible} still possible`;
}
