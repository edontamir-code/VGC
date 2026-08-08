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
import { computeStats } from "../../engine.js";
import { protectSuccessChance } from "../battle/protect.ts";
import { applyIntimidate, applyStages } from "../battle/stages.ts";
import type { StageDelta } from "../battle/stages.ts";
import { isProtect } from "./actions.ts";
import type { Action, Plan } from "./actions.ts";
import { effectivePriority, resolveMoveType } from "../battle/moves.ts";
import { activeProfile } from "../battle/stats.ts";
import {
  blockedByPsychicTerrain, blockedByPranksterDark, blockedBySidePriorityGuard,
} from "../battle/terrain.ts";

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
  activeProfile(m).displayName;

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
  //
  // Intimidate fires as the Pokemon lands, BEFORE anything moves, so the
  // Attack drop is already in place for every calc this turn. That is most of
  // why an Intimidate lead is good - and why leading it into a Defiant
  // Kingambit hands them +2 Attack instead.
  const intimidateOnEntry = (st: BattleState, uid: string): BattleState => {
    const r = applyIntimidate(st, uid);
    for (const text of r.events) events.push({ actorUid: uid, text });
    return r.state;
  };

  for (const [uid, action] of Object.entries(plan)) {
    // A caller can hand us a hole - a parsed turn line it could not resolve.
    // Better to play the rest of the turn than to throw the whole thing away.
    if (!action || action.kind !== "switch") continue;
    if (!s.mons[uid] || s.mons[uid].fainted) continue;
    events.push({ actorUid: uid, text: `${nameOf(s.mons[uid])} switches to ${nameOf(s.mons[action.toUid])}` });
    s = doSwitch(s, uid, action.toUid);
    s = intimidateOnEntry(s, action.toUid);
  }

  // --- 1b. Mega Evolution --------------------------------------------------
  //
  // Resolves AFTER switches and BEFORE any move, which is what makes the timing
  // matter: the Mega form's stats and ability apply to the move made this turn,
  // and the base form's apply to everything up to that point. Raichu is
  // Lightning Rod - redirecting Electric onto itself - until the instant it
  // becomes No Guard.
  //
  // Only one per side, ever. A plan asking for a second is ignored rather than
  // silently granted.
  for (const [uid, action] of Object.entries(plan)) {
    if (!action || action.kind !== "move" || !action.mega) continue;
    const mon = s.mons[uid];
    if (!mon || mon.fainted || mon.hasMega) continue;
    if (!mon.set.megaName && !mon.set.baseForm) continue;
    const spent = Object.values(s.mons).some(
      (m) => m.side === mon.side && m.hasMega && (m.set.megaName || m.set.baseForm)
    );
    if (spent) continue;

    const stats = computeStats(
      mon.set.base,
      mon.set.sp,
      mon.set.nature
    );
    const frac = mon.maxHP > 0 ? mon.curHP / mon.maxHP : 1;
    s = put(s, {
      ...mon,
      hasMega: true,
      maxHP: stats.hp,
      curHP: Math.max(1, Math.min(stats.hp, Math.round(stats.hp * frac))),
    });
    const now = s.mons[uid];
    events.push({
      actorUid: uid,
      text:
        `${nameOf(now)} Mega Evolved - ability is now ${activeProfile(now).ability}` +
        ` (was ${activeProfile(mon).ability})`,
    });
    // A Mega Evolving Pokemon's ability lands like a switch-in ability would.
    s = intimidateOnEntry(s, uid);
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
  // Partners whose attack is boosted x1.5 by a Helping Hand this turn.
  const helped = new Set<string>();
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

    // Recharging. The turn after a Hyper Beam is spent doing nothing at all,
    // and that turn is most of what makes the move a bad idea in doubles: their
    // partner gets a free hit on a Pokemon that cannot answer.
    if (actor.mustRecharge) {
      events.push({ actorUid: uid, text: `${nameOf(actor)} must recharge and cannot move` });
      s = put(s, { ...actor, mustRecharge: false, protectStreak: 0 });
      continue;
    }

    // Protect.
    if (isProtect(moveName)) {
      // Consecutive Protects succeed 1/3 of the time, then 1/9, then 1/27. The
      // counter is per Pokemon, so both of my actives protecting on the same
      // turn are BOTH guaranteed - they do not share it.
      //
      // Under worst-case rolls a repeat is treated as failing outright, because
      // a guarantee may never rest on a coinflip. Under best-case rolls it
      // lands, so the upside column stays honest. The two are reported apart.
      if (actor.protectStreak > 0 && opts.roll !== "bestForMe") {
        const chance = protectSuccessChance(actor.protectStreak);
        events.push({
          actorUid: uid,
          text:
            `${nameOf(actor)}'s ${moveName} failed - it was ${Math.round(chance * 100)}% ` +
            `after protecting ${actor.protectStreak === 1 ? "last turn" : `${actor.protectStreak} turns running`}`,
        });
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
    const data = getMoveData(moveName);
    s = put(s, {
      ...s.mons[uid],
      protectStreak: 0,
      lastMoveName: moveName,
      // Set on the way IN so it is already true when this mon's next turn comes
      // round. Cleared by the recharge branch above.
      mustRecharge: Boolean(data?.recharge),
    });
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
        // A Prankster Encore sits at +1, so a side priority guard stops it dead.
        const encGuard = blockedBySidePriorityGuard(
          s, actor.side, target.side, effectivePriority(moveName, s.mons[uid])
        );
        if (encGuard) {
          events.push({
            actorUid: uid,
            text: `${moveName} was blocked by ${nameOf(encGuard.holder)}'s ${encGuard.ability} - no priority reaches that side`,
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

      // Setup: Swords Dance, Nasty Plot, Dragon Dance, Bulk Up, Calm Mind.
      //
      // These were invisible, so the search could never recommend one: a free
      // Swords Dance scored exactly zero and any attack beat it. But +2 Attack
      // on a turn they cannot punish is often the whole game - every later
      // attack becomes a KO, and no damage number THIS turn competes with that.
      // The search can now weigh that trade for itself.
      if (info?.selfStages) {
        const out = applyStages(s.mons[uid], info.selfStages, false);
        s = put(s, out.mon);
        events.push({
          actorUid: uid,
          text: out.text
            ? `${nameOf(actor)} ${moveName}: ${out.text.replace(`${nameOf(actor)} `, "")}`
            : `${nameOf(actor)} ${moveName} had no effect - already maxed`,
        });
        continue;
      }

      // Helping Hand: the partner's attack this turn is x1.5.
      //
      // It sits at +5 priority so it essentially always lands first, which is
      // what makes it real: Farigiraf boosting a Sylveon Hyper Voice is often
      // more damage than Farigiraf attacking could ever be. The simulator used
      // to print "effect not simulated" and move on, so no evaluation could
      // ever see it and the tool never recommended it.
      if (moveName === "Helping Hand") {
        const ally = s.sides[actor.side].active.find(
          (u) => u && u !== uid && s.mons[u] && !s.mons[u].fainted
        );
        if (!ally) {
          events.push({ actorUid: uid, text: `${moveName} failed - no partner to help` });
          continue;
        }
        helped.add(ally);
        events.push({
          actorUid: uid,
          text: `${nameOf(actor)} Helping Hand - ${nameOf(s.mons[ally])}'s attack is x1.5 this turn`,
        });
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
    // Self stat changes only happen if the move actually connected. A Close
    // Combat that was Protected, redirected into a Ghost or blocked by Armor
    // Tail does not drop your defences - and, for a Contrary user, does not
    // raise them either.
    let landedOnSomething = false;

    for (const target of targets) {
      // Armor Tail and friends: nothing with priority reaches their side at all.
      const guard = blockedBySidePriorityGuard(s, actor.side, target.side, movePriority);
      if (guard) {
        events.push({
          actorUid: uid,
          text: `${moveName} (+${movePriority}) was blocked by ${nameOf(guard.holder)}'s ${guard.ability} - it protects that whole side from priority`,
        });
        continue;
      }

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
      const r = resolveMatchup(s.mons[uid], s.mons[target.uid], moveName, s, {
        helpingHand: helped.has(uid),
      });
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
      landedOnSomething = true;
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

      // Stat changes the move inflicts on whatever it hit. `true` for
      // fromOpponent, so Clear Body blocks it and Defiant punishes it.
      const onTarget: StageDelta = { ...(data.targetStages ?? {}) };
      if (data.lowersSpe) onTarget.spe = (onTarget.spe ?? 0) - data.lowersSpe;
      if (Object.keys(onTarget).length && !hit.fainted) {
        const out = applyStages(s.mons[target.uid], onTarget, true);
        s = put(s, out.mon);
        if (out.text) events.push({ actorUid: target.uid, text: out.text });
      }
    }

    // Stat changes the move inflicts on the USER, once, after every target is
    // resolved. Close Combat drops Def and SpD - and Contrary inverts that, so
    // a Contrary Staraptor gets BULKIER every time it attacks. `false` for
    // fromOpponent: this is self-inflicted, so drop-immunity and Defiant do not
    // apply to it.
    if (data.selfStages && !s.mons[uid].fainted && landedOnSomething) {
      const out = applyStages(s.mons[uid], data.selfStages, false);
      s = put(s, out.mon);
      if (out.text) events.push({ actorUid: uid, text: out.text });
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
