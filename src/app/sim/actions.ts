// ===========================================================================
// The action model. One of these per active mon per turn.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { getMoveData } from "../battle/moves.ts";
import { STATUS_MOVES } from "../battle/statusMoves.ts";
import { activeMons } from "../battle/resolver.ts";
import { possibleSwitchIns } from "../battle/roster.ts";
import { activeProfile } from "../battle/stats.ts";

export interface MoveAction {
  kind: "move";
  moveName: string;
  /** undefined for spread moves and self-targeting status moves. */
  targetUid?: string;
  /**
   * Mega Evolve first, then use this move.
   *
   * Mega Evolution is a choice you make ON a turn, not a state you start in.
   * It resolves after switches and before any move, so the Mega form's stats
   * and ability apply to the move made the same turn - but NOT to anything
   * that happened before it, and not at all if you never take it.
   */
  mega?: boolean;
}
export interface SwitchAction {
  kind: "switch";
  toUid: string;
}
export type Action = MoveAction | SwitchAction;

export type Plan = Record<string, Action>;

/**
 * A Pokemon's name as it is ON THE FIELD.
 *
 * `set.name` is the Mega form for anything carrying a stone, so using it
 * directly labels a Pokemon that never Mega Evolved as its Mega - which is both
 * wrong and, in a plan you are about to execute, actively misleading about what
 * stats it has.
 */
const nameOf = (m: MonState) => activeProfile(m).displayName;

export function actionLabel(a: Action, state: BattleState): string {
  if (a.kind === "switch") {
    const to = state.mons[a.toUid];
    return `switch to ${to ? nameOf(to) : "?"}`;
  }
  const t = a.targetUid ? state.mons[a.targetUid] : null;
  const body = t ? `${a.moveName} -> ${nameOf(t)}` : a.moveName;
  return a.mega ? `MEGA, then ${body}` : body;
}

/** Does this move hit both foes? */
export function isSpread(moveName: string): boolean {
  return Boolean(getMoveData(moveName)?.spread);
}

/** Does this move protect the user this turn? */
export function isProtect(moveName: string): boolean {
  return Boolean(STATUS_MOVES[moveName]?.protects);
}

/** A move that targets nobody (setup, screens, recovery, Protect). */
export function isSelfTargeting(moveName: string): boolean {
  return !getMoveData(moveName) || isSpread(moveName);
}

export interface LegalOpts {
  allowSwitch?: boolean;
  /**
   * Override which moves this mon is treated as having. Used to plan against
   * everything they COULD be holding rather than just the assumed set.
   */
  arsenal?: string[];
}

/**
 * Every action this mon could legally take right now.
 * Deliberately excludes moves that cannot work: Fake Out off a switch-in turn,
 * a repeat Protect (which the planner treats as failing), and anything other
 * than the Encored move while an Encore is active.
 */
export function legalActions(
  mon: MonState,
  state: BattleState,
  opts: LegalOpts = {}
): Action[] {
  const out: Action[] = [];
  const foes = activeMons(state, mon.side === "me" ? "opp" : "me");

  // Recharging removes the turn entirely - you do not even get to switch. One
  // no-op action is returned so the search still has something to play; the
  // simulator recognises it and does nothing. Leaving the list empty would let
  // the planner quietly skip the cost of the move that caused it.
  if (mon.mustRecharge) {
    return [{ kind: "move", moveName: mon.lastMoveName ?? "Recharge" }];
  }

  // Encore removes the choice entirely.
  const source =
    mon.encoreTurnsLeft > 0 && mon.lastMoveName
      ? [mon.lastMoveName]
      : (opts.arsenal ?? mon.set.moves);

  for (const moveName of source) {
    if (!moveName) continue;
    const data = getMoveData(moveName);
    const status = STATUS_MOVES[moveName];

    if (data?.firstTurnOnly && mon.turnsOnField > 0) continue;
    // A repeat Protect is UNRELIABLE (1/3, then 1/9), not illegal. Deleting it
    // here meant the planner could never weigh a 33% Protect against a certain
    // loss - and sometimes 33% is the whole game. The simulator still fails it
    // under worst-case rolls, so no GUARANTEE can rest on it.

    if (!data) {
      if (!status) continue;
      // A foe-targeting status move (Encore, Taunt) needs a target.
      if (status.targetsFoe) {
        for (const foe of foes) out.push({ kind: "move", moveName, targetUid: foe.uid });
      } else {
        out.push({ kind: "move", moveName });
      }
      continue;
    }
    if (data.spread) {
      out.push({ kind: "move", moveName });
      continue;
    }
    for (const foe of foes) out.push({ kind: "move", moveName, targetUid: foe.uid });
  }

  // Mega Evolution doubles this Pokemon's options: every move can be made
  // either as the base form or as the Mega. That is a real decision - Raichu
  // keeps Lightning Rod (and its Electric redirection) until it commits - so
  // the planner has to be able to weigh both, not be handed one.
  //
  // Only ever offered to a Pokemon that can Mega on a side that has not used
  // its Mega, so at most one Pokemon's action list grows.
  if (canMegaNow(mon, state)) {
    for (const a of [...out]) {
      if (a.kind === "move") out.push({ ...a, mega: true });
    }
  }

  // Switching is always available, even under an Encore. For the opponent this
  // includes every bench mon that could still be part of their brought four -
  // being blind to their back line is what makes a "pin" a lie.
  if (opts.allowSwitch !== false) {
    for (const b of possibleSwitchIns(state, mon.side)) {
      out.push({ kind: "switch", toUid: b.uid });
    }
  }

  return out;
}

/** Can this Pokemon Mega Evolve right now - form available, side's Mega unspent? */
export function canMegaNow(mon: MonState, state: BattleState): boolean {
  if (mon.hasMega) return false;
  if (!mon.set.megaName && !mon.set.baseForm) return false;
  return !Object.values(state.mons).some(
    (m) => m.side === mon.side && m.hasMega && (m.set.megaName || m.set.baseForm)
  );
}

export interface ProfileOpts {
  allowSwitch?: boolean;
  cap?: number;
  /** Which moves each mon is treated as having, keyed by uid. */
  arsenals?: Record<string, string[]>;
}

/** Cartesian product of both actives' options, capped to keep search bounded. */
export function actionProfiles(
  state: BattleState,
  side: SideId,
  opts: ProfileOpts = {}
): Plan[] {
  const actives = activeMons(state, side);
  if (actives.length === 0) return [{}];

  const perMon = actives.map((m) => ({
    uid: m.uid,
    actions: legalActions(m, state, {
      allowSwitch: opts.allowSwitch,
      arsenal: opts.arsenals?.[m.uid],
    }),
  }));

  let profiles: Plan[] = [{}];
  for (const { uid, actions } of perMon) {
    const next: Plan[] = [];
    for (const p of profiles) {
      for (const a of actions) next.push({ ...p, [uid]: a });
    }
    profiles = next;
  }

  const cap = opts.cap ?? 4000;
  return profiles.length > cap ? profiles.slice(0, cap) : profiles;
}
