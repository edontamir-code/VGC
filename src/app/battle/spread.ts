// ===========================================================================
// Spread damage and what it sets up.
//
// The 1v1 matrix asks "can this Pokemon kill that Pokemon", which is a singles
// question. The doubles question is different: a Hyper Voice that leaves BOTH
// of them at 32% has not killed anything, but it has handed two kills to
// whoever comes in next. That is usually a better turn than removing one
// Pokemon with a move that then makes you stand still.
//
// So this module scores a spread move by what the BOARD looks like afterwards:
//   - total HP removed across both targets
//   - which of them are now inside someone else's KO range, including Pokemon
//     still on the bench, because "Raichu is in the back" is the whole plan
//
// Cleanup is checked at the target's WORST-CASE remaining HP (my minimum roll
// on the spread move) against the cleaner's minimum roll, so a range the tool
// reports is a range you actually have.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import { getMoveData } from "./moves.ts";
import { scout } from "./scouting.ts";
import { activeProfile } from "./stats.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

export interface SpreadTarget {
  mon: MonState;
  minPct: number;
  maxPct: number;
  /** HP left if the move rolls its MINIMUM - the honest worst case. */
  hpLeftWorst: number;
  hpLeftWorstPct: number;
  /** True when even the minimum roll KOs it outright. */
  koed: boolean;
}

export interface CleanUp {
  /** The target that is now in range. */
  target: MonState;
  /** Who finishes it. */
  by: MonState;
  moveName: string;
  /** True when that Pokemon is not on the field yet. */
  fromBench: boolean;
  minPct: number;
}

export interface SpreadPlay {
  attacker: MonState;
  moveName: string;
  targets: SpreadTarget[];
  /** Percent of a full HP bar removed, summed across both targets, worst case. */
  totalChipPct: number;
  /** Targets brought into someone else's KO range that were not before. */
  setsUp: CleanUp[];
  /** Targets this move kills outright. */
  kills: MonState[];
  text: string | null;
}

/** The same Pokemon at a given current HP, for range checks. */
function atHP(mon: MonState, hp: number): MonState {
  return { ...mon, curHP: Math.max(0, hp) };
}

/**
 * Who on my side KOs this target from the HP it would be left on?
 *
 * Bench Pokemon count. The point of chip damage is that it converts into a kill
 * later, and "later" usually means after a switch.
 */
function cleanersFor(
  target: MonState,
  hpLeft: number,
  state: BattleState,
  exclude: string
): CleanUp[] {
  const activeUids = new Set(state.sides.me.active.filter(Boolean) as string[]);
  const out: CleanUp[] = [];
  const wounded = atHP(target, hpLeft);

  for (const mon of Object.values(state.mons)) {
    if (mon.side !== "me" || mon.fainted || mon.uid === exclude) continue;

    for (const moveName of scout(mon).arsenal) {
      if (!getMoveData(moveName)) continue;
      const r = resolveMatchup(mon, wounded, moveName, state);
      if (!r || r.typeMult === 0) continue;
      // Must kill from the wounded HP but NOT from full - otherwise it was
      // already in range and the spread move gets no credit for it.
      if (r.min < hpLeft) continue;
      const fromFull = resolveMatchup(mon, target, moveName, state);
      if (fromFull && fromFull.min >= target.maxHP) continue;

      out.push({
        target,
        by: mon,
        moveName,
        fromBench: !activeUids.has(mon.uid),
        minPct: r.minPct,
      });
      break; // one named answer per Pokemon is enough
    }
  }
  return out;
}

/** What this move actually does to the board. */
export function spreadPlay(
  attacker: MonState,
  moveName: string,
  state: BattleState
): SpreadPlay | null {
  const foes = (state.sides.opp.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);
  if (foes.length === 0) return null;

  const data = getMoveData(moveName);
  if (!data) return null;

  const targets: SpreadTarget[] = [];
  let probe: ReturnType<typeof resolveMatchup> = null;
  for (const foe of foes) {
    const r = resolveMatchup(attacker, foe, moveName, state);
    if (!r) continue;
    probe = probe ?? r;
    if (r.typeMult === 0) continue;
    const hpLeftWorst = Math.max(0, foe.curHP - r.min);
    targets.push({
      mon: foe,
      minPct: r.minPct,
      maxPct: r.maxPct,
      hpLeftWorst,
      hpLeftWorstPct: foe.maxHP > 0 ? +((100 * hpLeftWorst) / foe.maxHP).toFixed(1) : 0,
      koed: r.min >= foe.curHP,
    });
  }
  if (targets.length === 0) return null;

  // A single-target move only ever touches one of them, however it is aimed.
  const isSpread = Boolean(probe?.spread);
  const hit = isSpread ? targets : targets.slice(0, 1);

  const setsUp: CleanUp[] = [];
  const kills: MonState[] = [];
  let totalChipPct = 0;

  for (const t of hit) {
    totalChipPct += Math.min(100, t.minPct);
    if (t.koed) {
      kills.push(t.mon);
      continue;
    }
    setsUp.push(...cleanersFor(t.mon, t.hpLeftWorst, state, attacker.uid));
  }

  // Grouped BY TARGET. A flat list reads as though everything is in range of
  // everything, which is exactly the kind of thing that gets someone killed.
  let text: string | null = null;
  if (isSpread && hit.length > 1) {
    const parts: string[] = [
      `${moveName} hits both at your worst rolls: ` +
        hit
          .map((t) => (t.koed ? `${nameOf(t.mon)} DEAD` : `${nameOf(t.mon)} to ${t.hpLeftWorstPct}%`))
          .join(", "),
    ];
    for (const t of hit) {
      const forTarget = setsUp.filter((c) => c.target.uid === t.mon.uid);
      if (forTarget.length === 0) continue;
      const named = forTarget
        .slice(0, 3)
        .map((c) => `${nameOf(c.by)} ${c.moveName}${c.fromBench ? " (in the back)" : ""}`);
      parts.push(`${nameOf(t.mon)} at ${t.hpLeftWorstPct}% is now in range of ${named.join(", ")}`);
    }
    text = parts.join(". ") + ".";
  }

  return { attacker, moveName, targets, totalChipPct, setsUp, kills, text };
}

/**
 * The best thing this Pokemon can do to the board right now, judged on total
 * damage and follow-up rather than on the biggest single number.
 *
 * A kill counts for a lot, but two targets chipped into range counts for a lot
 * too - and a recharge move that kills one and then does nothing counts for
 * less than either.
 */
export function bestBoardPlay(attacker: MonState, state: BattleState): SpreadPlay | null {
  let best: SpreadPlay | null = null;
  let bestScore = -Infinity;

  for (const moveName of scout(attacker).arsenal) {
    const data = getMoveData(moveName);
    if (!data) continue;
    const play = spreadPlay(attacker, moveName, state);
    if (!play) continue;

    const score =
      play.kills.length * 100 +
      play.setsUp.length * 45 +
      play.totalChipPct -
      (data.recharge ? 60 : 0);
    if (score > bestScore) {
      bestScore = score;
      best = play;
    }
  }
  return best;
}
