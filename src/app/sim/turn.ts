// ===========================================================================
// The deterministic turn simulator.
//
// Given a board, both sides' actions, a roll choice and a speed-tie policy,
// this produces exactly one successor state. Determinism is the whole point:
// it is what lets the planner say "for EVERY reply they have, I still win".
//
// Damage still comes from the verified engine via resolveMatchup - this only
// decides ordering, targeting, blocking and bookkeeping.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { ZERO_STAGES } from "../model/types.ts";
import { resolveMatchup } from "../battle/damage.ts";
import { getMoveData } from "../battle/moves.ts";
import { STATUS_MOVES } from "../battle/statusMoves.ts";
import { speedMonOf, speedFieldOf } from "../battle/speed.ts";
import { effectiveSpeed } from "../../speed.js";
import { activeMons } from "../battle/resolver.ts";
import { isProtect } from "./actions.ts";
import type { Action, Plan } from "./actions.ts";
import { effectivePriority, resolveMoveType } from "../battle/moves.ts";
import { activeProfile } from "../battle/stats.ts";
import { blockedByPsychicTerrain, blockedByPranksterDark } from "../battle/terrain.ts";

/** How long an Encore locks the target in. */
export const ENCORE_TURNS = 3;

/**
 * Which damage roll to use.
 *  - "worstForMe": my attacks roll minimum, theirs roll maximum. This is the
 *    only setting under which a claimed guarantee is actually a guarantee.
 *  - "bestForMe": the mirror, for "what is the best case".
 */
/**
 * "average" exists only for RECORDING a turn that already happened, where the
 * real roll is unknown but the user can correct HP afterwards. It must never be
 * used for a guarantee.
 */
export type RollMode = "worstForMe" | "bestForMe" | "average";

/** Who wins an exact speed tie. Guarantees must assume "them". */
export type TiePolicy = "them" | "me";

export interface SimOpts {
  roll: RollMode;
  tie: TiePolicy;
  /** Perspective side. Defaults to "me". */
  perspective?: SideId;
}

export interface SimEvent {
  text: string;
  actorUid: string;
}

export interface SimResult {
  state: BattleState;
  events: SimEvent[];
}

const nameOf = (m: MonState) =>
  m.hasMega || !m.set.baseForm ? m.set.name : m.set.speciesId;

function put(state: BattleState, mon: MonState): BattleState {
  return { ...state, mons: { ...state.mons, [mon.uid]: mon } };
}

function damage(mon: MonState, amount: number): MonState {
  const curHP = Math.max(0, mon.curHP - amount);
  return { ...mon, curHP, fainted: curHP <= 0 };
}

/**
 * Focus Sash: from full HP, a hit that would KO leaves the holder on 1.
 * Returns the damage actually taken and whether the Sash was spent.
 */
/** Abilities that pull a whole move type onto their holder. */
const ABILITY_REDIRECT: Record<string, string> = {
  "Lightning Rod": "Electric",
  "Storm Drain": "Water",
};

/**
 * Who actually gets hit by a single-target attack aimed at `original`.
 *
 * Ability redirection (Lightning Rod, Storm Drain) beats move redirection, and
 * neither applies if the puller is already the intended target or has fainted.
 */
function redirectTargetFor(
  state: BattleState,
  targetSide: SideId,
  original: MonState,
  moveType: string,
  redirectors: Partial<Record<SideId, string>>
): MonState | null {
  for (const mon of activeMons(state, targetSide)) {
    if (mon.uid === original.uid || mon.fainted) continue;
    if (ABILITY_REDIRECT[activeProfile(mon).ability] === moveType) return mon;
  }
  const uid = redirectors[targetSide];
  if (!uid) return null;
  const puller = state.mons[uid];
  if (!puller || puller.fainted || puller.uid === original.uid) return null;
  return puller;
}

function applySash(mon: MonState, raw: number): { dealt: number; sashUsed: boolean } {
  const sashLive =
    mon.set.item === "Focus Sash" && mon.itemActive && mon.curHP === mon.maxHP;
  if (sashLive && raw >= mon.curHP) return { dealt: mon.curHP - 1, sashUsed: true };
  return { dealt: raw, sashUsed: false };
}

function slotOf(state: BattleState, uid: string): { side: SideId; slot: number } | null {
  for (const side of ["me", "opp"] as SideId[]) {
    const i = state.sides[side].active.indexOf(uid);
    if (i >= 0) return { side, slot: i };
  }
  return null;
}

/** Perform a switch immediately (switches resolve before any move). */
function doSwitch(state: BattleState, outUid: string, inUid: string): BattleState {
  const pos = slotOf(state, outUid);
  if (!pos) return state;
  const side = state.sides[pos.side];
  const active = [...side.active];
  active[pos.slot] = inUid;
  const bench = side.bench.filter((u) => u !== inUid);
  if (!state.mons[outUid].fainted) bench.push(outUid);

  let next: BattleState = {
    ...state,
    sides: { ...state.sides, [pos.side]: { active, bench } },
  };
  // Stat stages reset on the way out, and an Encore does not follow you to the
  // bench; the incoming mon arrives on its switch-in turn.
  next = put(next, {
    ...next.mons[outUid],
    stages: { ...ZERO_STAGES },
    encoreTurnsLeft: 0,
    lastMoveName: null,
    protectStreak: 0,
  });
  next = put(next, {
    ...next.mons[inUid],
    turnsOnField: 0,
    protectStreak: 0,
    encoreTurnsLeft: 0,
    lastMoveName: null,
    stages: { ...ZERO_STAGES },
  });
  // A weather setter coming in resets the weather.
  const incoming = next.mons[inUid];
  if (incoming.set.setsWeather && next.field.weather?.kind !== incoming.set.setsWeather) {
    next = {
      ...next,
      field: {
        ...next.field,
        weather: { kind: incoming.set.setsWeather, turnsLeft: next.durations.weather },
      },
    };
  }
  return next;
}

/** Apply a field-setting status move (Tailwind, screens, Trick Room). */
function applyFieldMove(state: BattleState, actor: MonState, moveName: string): BattleState {
  const info = STATUS_MOVES[moveName];
  if (!info?.sets) return state;
  const d = state.durations;
  switch (info.sets) {
    case "tailwind":
      return {
        ...state,
        field: { ...state.field, tailwind: { ...state.field.tailwind, [actor.side]: d.tailwind } },
      };
    case "trickRoom":
      // Trick Room toggles.
      return {
        ...state,
        field: { ...state.field, trickRoom: state.field.trickRoom > 0 ? 0 : d.trickRoom },
      };
    case "reflect":
    case "lightScreen":
    case "auroraVeil":
      return {
        ...state,
        field: {
          ...state.field,
          screens: {
            ...state.field.screens,
            [actor.side]: { ...state.field.screens[actor.side], [info.sets]: d.screens },
          },
        },
      };
    default:
      return state;
  }
}

/**
 * Simulate one full turn.
 *
 * Order of operations:
 *   1. every switch resolves
 *   2. moves in priority-then-speed order (Trick Room reverses speed)
 *   3. end-of-turn field timers tick
 */
export function simulateTurn(state: BattleState, plan: Plan, opts: SimOpts): SimResult {
  const me: SideId = opts.perspective ?? "me";
  const events: SimEvent[] = [];
  let s = state;

  // --- 1. switches ---------------------------------------------------------
  for (const [uid, action] of Object.entries(plan)) {
    if (action.kind !== "switch") continue;
    if (!s.mons[uid] || s.mons[uid].fainted) continue;
    events.push({ actorUid: uid, text: `${nameOf(s.mons[uid])} switches to ${nameOf(s.mons[action.toUid])}` });
    s = doSwitch(s, uid, action.toUid);
  }

  // Movers are whoever is now active with a move queued. A mon that switched
  // out does not act; the mon that replaced it does not act either.
  const movers: { uid: string; action: Action }[] = [];
  for (const side of ["me", "opp"] as SideId[]) {
    for (const uid of s.sides[side].active) {
      if (!uid) continue;
      const action = plan[uid];
      if (!action || action.kind !== "move") continue;
      if (s.mons[uid]?.fainted) continue;
      movers.push({ uid, action });
    }
  }

  // --- 2. ordering ---------------------------------------------------------
  const field = speedFieldOf(s);
  const speedOf = (uid: string) => effectiveSpeed(speedMonOf(s.mons[uid]), field);
  // Prankster is applied here via effectivePriority - a Prankster Tailwind or
  // Encore moves in the +1 bracket, ahead of essentially every attack.
  const priorityOf = (uid: string, a: Action) =>
    a.kind === "move" ? effectivePriority(a.moveName, s.mons[uid]) : 6;

  const ordered = [...movers].sort((x, y) => {
    const px = priorityOf(x.uid, x.action);
    const py = priorityOf(y.uid, y.action);
    if (px !== py) return py - px;
    const sx = speedOf(x.uid);
    const sy = speedOf(y.uid);
    if (sx === sy) {
      // Exact tie: the perspective side loses it unless told otherwise.
      const xIsMine = s.mons[x.uid].side === me;
      if (opts.tie === "them") return xIsMine ? 1 : -1;
      return xIsMine ? -1 : 1;
    }
    return s.field.trickRoom > 0 ? sx - sy : sy - sx;
  });

  // --- 3. execute ----------------------------------------------------------
  const protectedUids = new Set<string>();
  const flinched = new Set<string>();
  /** Side -> the mon currently pulling single-target attacks onto itself. */
  const redirectors: Partial<Record<SideId, string>> = {};
  /** Everyone the turn order has already passed - they cannot be Encored out of an action. */
  const acted = new Set<string>();

  for (const { uid, action } of ordered) {
    acted.add(uid);
    const actor = s.mons[uid];
    if (!actor || actor.fainted) continue;
    if (flinched.has(uid)) {
      events.push({ actorUid: uid, text: `${nameOf(actor)} flinched and did nothing` });
      continue;
    }
    if (action.kind !== "move") continue;
    const { moveName } = action;

    // Protect.
    if (isProtect(moveName)) {
      // A repeat Protect is treated as failing - a guarantee may not rest on it.
      if (actor.protectStreak > 0) {
        events.push({ actorUid: uid, text: `${nameOf(actor)}'s ${moveName} failed (used consecutively)` });
        s = put(s, { ...actor, protectStreak: 0 });
        continue;
      }
      protectedUids.add(uid);
      // Recorded here too: a successful Protect is exactly what an Encore wants
      // to lock you into, and it is the most commonly punished one.
      s = put(s, {
        ...actor,
        protectStreak: actor.protectStreak + 1,
        lastMoveName: moveName,
      });
      events.push({ actorUid: uid, text: `${nameOf(actor)} protected` });
      continue;
    }

    // Any non-Protect action breaks the streak, and every action is remembered
    // so an Encore has something to lock onto.
    s = put(s, { ...s.mons[uid], protectStreak: 0, lastMoveName: moveName });

    const data = getMoveData(moveName);
    if (!data) {
      const info = STATUS_MOVES[moveName];

      // Encore: lock the target into whatever it last used. If the target has
      // not moved yet this turn, its queued action is overwritten - which is
      // precisely why walking into an Encore is so punishing.
      if (info?.encores) {
        const target = action.targetUid ? s.mons[action.targetUid] : null;
        if (!target || target.fainted || !target.lastMoveName) {
          events.push({ actorUid: uid, text: `${moveName} failed - no move to lock onto` });
          continue;
        }
        // Prankster status moves do not touch Dark types at all.
        if (blockedByPranksterDark(s.mons[uid], target, true)) {
          events.push({
            actorUid: uid,
            text: `${moveName} failed - Prankster status moves do not affect Dark types (${nameOf(target)})`,
          });
          continue;
        }
        // Psychic Terrain blocks the Prankster-boosted priority bracket.
        if (blockedByPsychicTerrain(s, target, effectivePriority(moveName, s.mons[uid]))) {
          events.push({
            actorUid: uid,
            text: `${moveName} was blocked by Psychic Terrain (priority move into a grounded target)`,
          });
          continue;
        }
        if (protectedUids.has(target.uid)) {
          events.push({ actorUid: uid, text: `${nameOf(target)} blocked ${moveName}` });
          continue;
        }

        s = put(s, { ...target, encoreTurnsLeft: ENCORE_TURNS });
        const locked = target.lastMoveName;

        // If they have not moved yet this turn, the Encore overwrites what they
        // were about to do. That is the whole threat of it.
        const idx = ordered.findIndex((o) => o.uid === target.uid);
        if (!acted.has(target.uid) && idx >= 0 && ordered[idx].action.kind === "move") {
          ordered[idx] = { uid: target.uid, action: { kind: "move", moveName: locked } };
          events.push({
            actorUid: uid,
            text: `${nameOf(actor)} Encored ${nameOf(target)} into ${locked} - its action this turn is overwritten`,
          });
        } else {
          events.push({
            actorUid: uid,
            text: `${nameOf(actor)} Encored ${nameOf(target)} into ${locked} for ${ENCORE_TURNS} turns`,
          });
        }
        continue;
      }

      // Rage Powder / Follow Me: from now on this turn, single-target attacks
      // aimed at this mon's side come to it instead.
      if (info?.redirects) {
        redirectors[actor.side] = uid;
        events.push({
          actorUid: uid,
          text: `${nameOf(actor)} used ${moveName} - single-target attacks are drawn to it`,
        });
        continue;
      }

      s = applyFieldMove(s, s.mons[uid], moveName);
      events.push({
        actorUid: uid,
        text: `${nameOf(actor)} used ${moveName}` + (info?.simulated ? "" : " (effect not simulated)"),
      });
      continue;
    }

    // Targets: spread hits every living foe, otherwise the chosen one.
    const foeSide: SideId = actor.side === "me" ? "opp" : "me";
    const foes = activeMons(s, foeSide);
    let targets = data.spread
      ? foes
      : action.targetUid && s.mons[action.targetUid] && !s.mons[action.targetUid].fainted
        ? [s.mons[action.targetUid]]
        : foes.slice(0, 1);

    // --- Redirection ------------------------------------------------------
    // Spread moves are never redirected; single-target attacks are. This is the
    // line-killer: a Close Combat pulled onto a Ghost does nothing at all, and
    // its secondary effect (a Contrary user's defence boost) never happens
    // either, because the move did not connect.
    if (!data.spread && targets.length === 1) {
      const original = targets[0];
      const landsAs = resolveMoveType(
        data,
        activeProfile(s.mons[uid]).ability,
        s.field.weather?.kind ?? null
      );
      const pull = redirectTargetFor(s, foeSide, original, landsAs, redirectors);
      if (pull && pull.uid !== original.uid) {
        targets = [pull];
        events.push({
          actorUid: uid,
          text: `${moveName} was redirected from ${nameOf(original)} to ${nameOf(pull)}`,
        });
      }
    }

    const movePriority = effectivePriority(moveName, s.mons[uid]);

    for (const target of targets) {
      // Psychic Terrain: no priority move lands on a grounded target. This is
      // what voids a Fake Out / Sucker Punch / Aqua Jet plan outright.
      if (blockedByPsychicTerrain(s, target, movePriority)) {
        events.push({
          actorUid: uid,
          text: `${moveName} (+${movePriority}) was blocked by Psychic Terrain - ${nameOf(target)} is grounded`,
        });
        continue;
      }
      if (protectedUids.has(target.uid)) {
        events.push({ actorUid: uid, text: `${nameOf(target)} blocked ${moveName}` });
        continue;
      }
      const r = resolveMatchup(s.mons[uid], s.mons[target.uid], moveName, s);
      if (!r || r.typeMult === 0) {
        events.push({ actorUid: uid, text: `${moveName} had no effect on ${nameOf(target)}` });
        continue;
      }

      // Adversarial rolls: my hits roll low, theirs roll high.
      const mine = actor.side === me;
      const raw =
        opts.roll === "average"
          ? Math.round((r.min + r.max) / 2)
          : opts.roll === "worstForMe"
            ? mine ? r.min : r.max
            : mine ? r.max : r.min;

      const cur = s.mons[target.uid];
      const { dealt, sashUsed } = applySash(cur, raw);
      let hit = damage(cur, dealt);
      if (sashUsed) {
        hit = { ...hit, itemActive: false };
        if (hit.set.ability === "Unburden") hit = { ...hit, unburdened: true };
      }
      s = put(s, hit);

      events.push({
        actorUid: uid,
        text:
          `${nameOf(actor)} ${moveName} -> ${nameOf(target)} for ${dealt}` +
          (sashUsed ? " (Focus Sash held on 1 HP)" : "") +
          (hit.fainted ? " - KO" : ` (${hit.curHP}/${hit.maxHP} left)`),
      });

      if (data.flinch && !hit.fainted) flinched.add(target.uid);
      if (data.lowersSpe && !hit.fainted) {
        s = put(s, {
          ...s.mons[target.uid],
          stages: {
            ...s.mons[target.uid].stages,
            spe: Math.max(-6, s.mons[target.uid].stages.spe - data.lowersSpe),
          },
        });
      }
    }
  }

  // --- 4. end of turn ------------------------------------------------------
  const dec = (n: number) => Math.max(0, n - 1);
  const f = s.field;
  const mons = { ...s.mons };
  for (const side of ["me", "opp"] as SideId[]) {
    for (const uid of s.sides[side].active) {
      if (!uid || !mons[uid]) continue;
      mons[uid] = {
        ...mons[uid],
        turnsOnField: mons[uid].turnsOnField + 1,
        encoreTurnsLeft: Math.max(0, mons[uid].encoreTurnsLeft - 1),
      };
    }
  }

  s = {
    ...s,
    mons,
    turn: s.turn + 1,
    field: {
      weather: f.weather && f.weather.turnsLeft > 1
        ? { ...f.weather, turnsLeft: dec(f.weather.turnsLeft) }
        : null,
      terrain: f.terrain && f.terrain.turnsLeft > 1
        ? { ...f.terrain, turnsLeft: dec(f.terrain.turnsLeft) }
        : null,
      trickRoom: dec(f.trickRoom),
      gravity: dec(f.gravity),
      tailwind: { me: dec(f.tailwind.me), opp: dec(f.tailwind.opp) },
      screens: {
        me: {
          reflect: dec(f.screens.me.reflect),
          lightScreen: dec(f.screens.me.lightScreen),
          auroraVeil: dec(f.screens.me.auroraVeil),
        },
        opp: {
          reflect: dec(f.screens.opp.reflect),
          lightScreen: dec(f.screens.opp.lightScreen),
          auroraVeil: dec(f.screens.opp.auroraVeil),
        },
      },
    },
  };

  return { state: s, events };
}
