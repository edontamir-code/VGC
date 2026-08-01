// ===========================================================================
// The action model. One of these per active mon per turn.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { getMoveData } from "../battle/moves.ts";
import { STATUS_MOVES } from "../battle/statusMoves.ts";
import { activeMons } from "../battle/resolver.ts";
import { possibleSwitchIns } from "../battle/roster.ts";

export interface MoveAction {
  kind: "move";
  moveName: string;
  /** undefined for spread moves and self-targeting status moves. */
  targetUid?: string;
}
export interface SwitchAction {
  kind: "switch";
  toUid: string;
}
export type Action = MoveAction | SwitchAction;

export type Plan = Record<string, Action>;

export function actionLabel(a: Action, state: BattleState): string {
  if (a.kind === "switch") return `switch to ${state.mons[a.toUid]?.set.name ?? "?"}`;
  const t = a.targetUid ? state.mons[a.targetUid] : null;
  return t ? `${a.moveName} -> ${t.set.name}` : a.moveName;
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
    if (isProtect(moveName) && mon.protectStreak > 0) continue;

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
