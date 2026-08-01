// ===========================================================================
// Mega Evolution rules.
//
// Two separate things, and they must not be confused:
//
//  HARD  - only one Pokemon per side Mega Evolves in a battle. Once theirs has,
//          nothing else on their side can, and that is a real constraint the
//          planner may lean on.
//  SOFT  - teams commonly carry two Mega stones and bring one. Seeing a stone
//          in the lead makes the other stone-holder LESS LIKELY to have been
//          brought, but it does not rule it out. This never changes a
//          guarantee; it is shown as a read, not applied as a fact.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";

/**
 * Items that Mega Evolve their holder.
 * Note the trailing form letter: "Charizardite Y" does not end in "ite".
 */
export function isMegaStone(item: string): boolean {
  return /ite(\s+[XY])?$/i.test(item ?? "");
}

export function holdsMegaStone(mon: MonState): boolean {
  return Boolean(mon.set.item) && isMegaStone(mon.set.item);
}

/** Can this Pokemon Mega Evolve given the state of its side? */
export function canMega(state: BattleState, mon: MonState): { ok: boolean; reason: string | null } {
  if (!mon.set.baseForm && !mon.set.megaName && !holdsMegaStone(mon)) {
    return { ok: false, reason: "does not Mega Evolve" };
  }
  const already = Object.values(state.mons).find(
    (m) => m.side === mon.side && m.uid !== mon.uid && m.hasMega && (m.set.baseForm || m.set.megaName)
  );
  if (already) {
    return {
      ok: false,
      reason: `${already.set.name} has already Mega Evolved - only one per side`,
    };
  }
  return { ok: true, reason: null };
}

/**
 * The Pokemon on this side that has actually used the side's Mega.
 *
 * A benched Pokemon has NOT Mega Evolved, whatever its default form flag says -
 * only something that has been on the field can have used it. Without this
 * check, entering a roster containing a Mega stone immediately (and wrongly)
 * claims their Mega is spent.
 */
export function megaUsedBy(state: BattleState, side: SideId): MonState | null {
  const activeUids = new Set(state.sides[side].active.filter(Boolean) as string[]);
  return (
    Object.values(state.mons).find(
      (m) =>
        m.side === side &&
        m.hasMega &&
        (m.set.baseForm || m.set.megaName) &&
        (activeUids.has(m.uid) || m.turnsOnField > 0)
    ) ?? null
  );
}

export interface MegaRead {
  /** Every Pokemon on that side holding a stone. */
  holders: MonState[];
  /** The one that has actually Mega Evolved, if any. */
  used: MonState | null;
  text: string | null;
}

/**
 * The team-selection read: two stones on a roster usually means one of them was
 * left at home. Advisory only.
 */
export function megaRead(state: BattleState, side: SideId): MegaRead {
  const holders = Object.values(state.mons).filter(
    (m) => m.side === side && holdsMegaStone(m)
  );
  const used = megaUsedBy(state, side);

  if (holders.length === 0) return { holders, used, text: null };

  const parts: string[] = [];

  // The soft team-selection read always applies when they carry two stones,
  // whether or not one has already been used.
  if (holders.length >= 2) {
    parts.push(
      `${holders.map((m) => m.set.name).join(" and ")} all hold Mega stones. Teams ` +
        `usually bring only one, so seeing one of them makes the other a weaker bet - ` +
        `but it is a read, not a fact, and the planner still assumes either could appear.`
    );
  }

  // The hard rule, once one of them has actually Mega Evolved.
  if (used) {
    const others = holders.filter((m) => m.uid !== used.uid && m.brought !== "out");
    parts.push(
      others.length
        ? `${used.set.name} has Mega Evolved, so ${others
            .map((m) => m.set.name)
            .join(" and ")} cannot Mega this battle - treat ${
            others.length === 1 ? "it" : "them"
          } as the base form.`
        : `${used.set.name} has used their Mega.`
    );
  }

  return { holders, used, text: parts.length ? parts.join(" ") : null };
}
