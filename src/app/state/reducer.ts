// ===========================================================================
// BattleState reducer + undo/redo. Pure: every action returns a new state.
// ===========================================================================
import { computeStats } from "../../engine.js";
import type { SPSpread } from "../../engine.js";
import { nextUid, newBattleState, makeMonState } from "../model/factory.ts";
import { ZERO_STAGES } from "../model/types.ts";
import type {
  BattleState, Field, MonSet, MonState, Session, SideId, Stages, StageKey,
  StatusKind, TerrainKind, WeatherKind, LogEntry, Screens,
} from "../model/types.ts";
import { activeProfile } from "../battle/stats.ts";
import { simulateTurn } from "../sim/turn.ts";
import { damageContradiction, narrowFromDamage } from "../battle/damageInference.ts";
import { applyIntimidate } from "../battle/stages.ts";
import { getMoveData } from "../battle/moves.ts";
// Aliased: this file's own `Action` is the reducer action union.
import type { Action as SimAction, Plan } from "../sim/actions.ts";
import { deriveObservations, applyObservations, speedRange } from "../battle/speedInference.ts";
import { reconcileBrought } from "../battle/roster.ts";
import { canMega } from "../battle/mega.ts";

export type Action =
  | { type: "SET_HP"; uid: string; curHP: number }
  | { type: "SET_HP_PCT"; uid: string; pct: number }
  | { type: "APPLY_DAMAGE"; uid: string; amount: number }
  | { type: "HEAL_FULL"; uid: string }
  | { type: "SET_STAGE"; uid: string; key: StageKey; value: number }
  | { type: "RESET_STAGES"; uid: string }
  | { type: "SET_STATUS"; uid: string; status: StatusKind | null }
  | { type: "SET_ITEM_ACTIVE"; uid: string; active: boolean }
  | { type: "TOGGLE_MEGA"; uid: string }
  | { type: "SET_MEGA"; side: SideId; uid: string | null }
  | { type: "SET_FAINTED"; uid: string; fainted: boolean }
  | { type: "SWITCH_IN"; side: SideId; slot: number; uid: string }
  | { type: "ADD_MON"; side: SideId; mon: MonState; slot?: number }
  | { type: "REMOVE_MON"; uid: string }
  | { type: "SET_BROUGHT"; uid: string; brought: MonState["brought"] }
  | { type: "ADD_ROSTER"; side: SideId; mons: MonState[] }
  | { type: "EDIT_SET"; uid: string; patch: Partial<MonSet> }
  | { type: "SET_SP"; uid: string; sp: SPSpread }
  | { type: "REVEAL_MOVE"; uid: string; moveName: string }
  | { type: "UNREVEAL_MOVE"; uid: string; moveName: string }
  | { type: "RULE_OUT_MOVE"; uid: string; moveName: string }
  | { type: "UNRULE_MOVE"; uid: string; moveName: string }
  | { type: "RULE_OUT_ITEM"; uid: string; item: string }
  | { type: "RULE_OUT_ABILITY"; uid: string; ability: string }
  | { type: "UNRULE_ITEM"; uid: string; item: string }
  | { type: "UNRULE_ABILITY"; uid: string; ability: string }
  | { type: "SET_REVEALED"; uid: string; field: "item" | "ability" | "nature" | "sp"; value: boolean }
  | { type: "SET_WEATHER"; kind: WeatherKind | null; rock?: boolean }
  | { type: "SET_TERRAIN"; kind: TerrainKind | null }
  | { type: "SET_TAILWIND"; side: SideId; on: boolean }
  | { type: "SET_TRICK_ROOM"; on: boolean }
  | { type: "SET_SCREEN"; side: SideId; kind: keyof Screens; on: boolean; clay?: boolean }
  | { type: "SET_GRAVITY"; on: boolean }
  | { type: "SET_TIMER"; path: string; value: number }
  | { type: "SET_DURATION"; key: keyof BattleState["durations"]; value: number }
  | {
      type: "APPLY_TURN_SCRIPT";
      /**
       * Ordered exactly as observed - the order is the speed evidence.
       * `actorUid` and `action` are nullable because the parser reports what it
       * could NOT resolve rather than dropping it; those entries are skipped
       * with a log line instead of taking the whole turn down.
       */
      entries: {
        actorUid: string | null;
        moveName: string | null;
        action: SimAction | null;
        raw?: string;
        problem?: string | null;
      }[];
      /** HP readings and faints you observed - applied after the simulation. */
      effects?: (
        | { kind: "hp"; uid: string; pct?: number; exact?: number }
        | { kind: "faint"; uid: string }
      )[];
      /** Raw text, for the log. */
      script: string;
    }
  | { type: "NEXT_TURN" }
  | { type: "LOG"; text: string; kind?: LogEntry["kind"] }
  | { type: "RESET"; team?: MonSet[] };

function log(state: BattleState, text: string, kind: LogEntry["kind"] = "system"): BattleState {
  return {
    ...state,
    log: [...state.log, { id: nextUid("log"), turn: state.turn, text, kind }],
  };
}

function patchMon(
  state: BattleState,
  uid: string,
  fn: (m: MonState) => MonState
): BattleState {
  const m = state.mons[uid];
  if (!m) return state;
  return { ...state, mons: { ...state.mons, [uid]: fn(m) } };
}

function clampHP(m: MonState, hp: number): MonState {
  const curHP = Math.max(0, Math.min(m.maxHP, Math.round(hp)));
  return { ...m, curHP, fainted: curHP <= 0 };
}

/**
 * A mon with Drought/Drizzle/etc. sets the weather the moment it lands on the
 * field. BATTLE_MODEL.md: "if Char Y is out with Drought, sun is up and Weather
 * Ball is Fire/100 automatically." The user can still override it afterwards.
 */
function applyEntryWeather(state: BattleState, mon: MonState): BattleState {
  const kind = mon.set.setsWeather;
  if (!kind) return state;
  if (state.field.weather?.kind === kind) return state;
  const turns = state.durations.weather;
  return log(
    { ...state, field: { ...state.field, weather: { kind, turnsLeft: turns } } },
    `${mon.set.name} set ${kind} on entry (${turns} turns).`,
    "field"
  );
}

/**
 * Keep the brought-four bookkeeping honest after anything that could reveal a
 * Pokemon: seeing one proves it was brought, and a fourth confirmation rules
 * out everything else on their roster.
 */
function reconcile(state: BattleState, side: SideId): BattleState {
  const changes = reconcileBrought(state, side);
  if (changes.length === 0) return state;
  let next = state;
  for (const c of changes) {
    next = patchMon(next, c.uid, (m) => ({ ...m, brought: c.brought }));
  }
  const ruledOut = changes.filter((c) => c.brought === "out");
  if (ruledOut.length) {
    next = log(
      next,
      `All four of their brought Pokemon are known - ` +
        `${ruledOut.map((c) => next.mons[c.uid].set.name).join(", ")} cannot be in the back.`,
      "scout"
    );
  }
  return next;
}

/** Recompute maxHP after a stat-affecting edit, preserving the HP fraction. */
function recomputeHP(m: MonState): MonState {
  const p = activeProfile(m);
  const stats = computeStats(p.base, m.set.sp, m.set.nature);
  const frac = m.maxHP > 0 ? m.curHP / m.maxHP : 1;
  const maxHP = stats.hp;
  return { ...m, maxHP, curHP: Math.max(0, Math.min(maxHP, Math.round(maxHP * frac))) };
}

export function reduce(state: BattleState, action: Action): BattleState {
  switch (action.type) {
    case "SET_HP":
      return patchMon(state, action.uid, (m) => clampHP(m, action.curHP));

    case "SET_HP_PCT":
      return patchMon(state, action.uid, (m) =>
        clampHP(m, (m.maxHP * Math.max(0, Math.min(100, action.pct))) / 100)
      );

    case "APPLY_DAMAGE":
      return patchMon(state, action.uid, (m) => clampHP(m, m.curHP - action.amount));

    case "HEAL_FULL":
      return patchMon(state, action.uid, (m) => ({ ...m, curHP: m.maxHP, fainted: false }));

    case "SET_STAGE":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        stages: {
          ...m.stages,
          [action.key]: Math.max(-6, Math.min(6, action.value)),
        } as Stages,
      }));

    case "RESET_STAGES":
      return patchMon(state, action.uid, (m) => ({ ...m, stages: { ...ZERO_STAGES } }));

    case "SET_STATUS":
      return patchMon(state, action.uid, (m) => ({ ...m, status: action.status }));

    case "SET_ITEM_ACTIVE":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        itemActive: action.active,
        // Unburden arms the moment the item is gone.
        unburdened: !action.active && activeProfile(m).ability === "Unburden",
      }));

    case "TOGGLE_MEGA": {
      const mon = state.mons[action.uid];
      if (!mon) return state;
      // Only one Mega Evolution per side, per battle.
      if (!mon.hasMega) {
        const check = canMega(state, mon);
        if (!check.ok && check.reason) {
          return log(state, `${mon.set.name} cannot Mega Evolve: ${check.reason}.`, "system");
        }
      }
      return patchMon(state, action.uid, (m) => recomputeHP({ ...m, hasMega: !m.hasMega }));
    }

    /**
     * Designate which of MY Pokemon is the one that Mega Evolves.
     *
     * Distinct from TOGGLE_MEGA, which refuses when the side's Mega is already
     * spent. That refusal is right for the opponent - seeing a second of theirs
     * Mega Evolve is a contradiction worth flagging - but wrong for my own
     * team, where picking a different Mega at preview is just a decision. So
     * this MOVES the Mega instead of rejecting it.
     */
    case "SET_MEGA": {
      let next = state;
      for (const m of Object.values(state.mons)) {
        if (m.side !== action.side) continue;
        if (!m.set.megaName && !m.set.baseForm) continue;
        const want = m.uid === action.uid;
        if (m.hasMega === want) continue;
        next = patchMon(next, m.uid, (x) => recomputeHP({ ...x, hasMega: want }));
      }
      if (next === state) return state;
      const chosen = action.uid ? state.mons[action.uid] : null;
      return log(
        next,
        chosen
          ? `${chosen.set.name} is your Mega this battle - every other stone holder plays as its base form.`
          : "No Mega this battle - every stone holder plays as its base form.",
        "system"
      );
    }

    case "SET_FAINTED":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        fainted: action.fainted,
        curHP: action.fainted ? 0 : m.curHP,
      }));

    case "SWITCH_IN": {
      const side = state.sides[action.side];
      const outgoing = side.active[action.slot];
      const active = [...side.active];
      active[action.slot] = action.uid;
      const bench = side.bench.filter((u) => u !== action.uid);
      if (outgoing && state.mons[outgoing] && !state.mons[outgoing].fainted) {
        bench.push(outgoing);
      }
      let next: BattleState = {
        ...state,
        sides: { ...state.sides, [action.side]: { active, bench } },
      };
      // Switching out resets stat stages and ends any Encore on the mon leaving.
      if (outgoing) {
        next = patchMon(next, outgoing, (m) => ({
          ...m,
          stages: { ...ZERO_STAGES },
          encoreTurnsLeft: 0,
          lastMoveName: null,
          protectStreak: 0,
        }));
      }
      // A mon that just came in is on its switch-in turn: Fake Out is live for
      // it, and any Protect streak it had is gone.
      // Switching out ends an Encore and clears the move history it locked onto.
      next = patchMon(next, action.uid, (m) => ({
        ...m,
        turnsOnField: 0,
        protectStreak: 0,
        encoreTurnsLeft: 0,
        lastMoveName: null,
      }));
      const incoming = next.mons[action.uid];
      next = log(next, `${incoming?.set.name ?? "?"} switched in.`, "action");
      next = incoming ? applyEntryWeather(next, incoming) : next;

      // Intimidate fires the moment a Pokemon lands - including when you set
      // the leads, which is the case that was being missed. You enter their
      // leads first, so their Incineroar arrives to an empty field and
      // intimidates nobody; then your Kingambit arrives and, without resolving
      // the INCOMING direction too, never gets intimidated at all. The tool
      // would silently miss that Kingambit is already at +1 Attack from
      // Defiant before either side has moved.
      {
        const r = applyIntimidate(next, action.uid);
        next = r.state;
        for (const text of r.events) next = log(next, text, "action");
      }

      // Coming in proves it was brought, which may rule out the rest.
      return reconcile(next, action.side);
    }

    case "ADD_MON": {
      const mon = action.mon;
      const side = state.sides[action.side];

      // If this species is already on their bench from team preview, send THAT
      // one out rather than creating a duplicate. Adding a second copy would
      // inflate their material and give the planner a Pokemon that cannot exist.
      const existing = side.bench
        .map((u) => state.mons[u])
        .find((m) => m && m.set.speciesId === mon.set.speciesId && !m.fainted);
      if (existing) {
        const slot =
          action.slot !== undefined && !side.active[action.slot]
            ? action.slot
            : side.active.findIndex((u) => !u);
        if (slot >= 0) {
          return reduce(state, {
            type: "SWITCH_IN",
            side: action.side,
            slot,
            uid: existing.uid,
          });
        }
      }

      const active = [...side.active];
      let bench = [...side.bench];
      let wentActive = false;
      if (action.slot !== undefined && action.slot < active.length && !active[action.slot]) {
        active[action.slot] = mon.uid;
        wentActive = true;
      } else {
        const empty = active.findIndex((u) => !u);
        if (empty >= 0) {
          active[empty] = mon.uid;
          wentActive = true;
        } else {
          bench = [...bench, mon.uid];
        }
      }
      const added = log(
        {
          ...state,
          mons: { ...state.mons, [mon.uid]: mon },
          sides: { ...state.sides, [action.side]: { active, bench } },
        },
        `${mon.set.name} added to ${action.side === "me" ? "your" : "the opponent's"} side.`,
        "scout"
      );
      return reconcile(wentActive ? applyEntryWeather(added, mon) : added, action.side);
    }

    case "REMOVE_MON": {
      const mons = { ...state.mons };
      delete mons[action.uid];
      const sides = { ...state.sides };
      for (const s of ["me", "opp"] as SideId[]) {
        sides[s] = {
          active: sides[s].active.map((u) => (u === action.uid ? null : u)),
          bench: sides[s].bench.filter((u) => u !== action.uid),
        };
      }
      return { ...state, mons, sides };
    }

    case "SET_BROUGHT":
      return reconcile(
        patchMon(state, action.uid, (m) => ({ ...m, brought: action.brought })),
        state.mons[action.uid]?.side ?? "opp"
      );

    case "ADD_ROSTER": {
      const mons = { ...state.mons };
      const bench = [...state.sides[action.side].bench];
      for (const m of action.mons) {
        mons[m.uid] = m;
        bench.push(m.uid);
      }
      const next: BattleState = {
        ...state,
        mons,
        sides: { ...state.sides, [action.side]: { ...state.sides[action.side], bench } },
      };
      return reconcile(
        log(
          next,
          `Team preview: ${action.mons.map((m) => m.set.name).join(", ")}.`,
          "scout"
        ),
        action.side
      );
    }

    case "EDIT_SET":
      return patchMon(state, action.uid, (m) =>
        recomputeHP({ ...m, set: { ...m.set, ...action.patch } })
      );

    case "SET_SP":
      return patchMon(state, action.uid, (m) =>
        recomputeHP({ ...m, set: { ...m.set, sp: action.sp } })
      );

    case "REVEAL_MOVE": {
      const next = patchMon(state, action.uid, (m) =>
        m.revealed.moves.includes(action.moveName)
          ? m
          : {
              ...m,
              revealed: {
                ...m.revealed,
                moves: [...m.revealed.moves, action.moveName],
                // Seeing it settles the question - it can no longer be ruled out.
                ruledOut: m.revealed.ruledOut.filter((x) => x !== action.moveName),
              },
            }
      );
      if (next === state) return state;
      return log(
        next,
        `Confirmed ${state.mons[action.uid]?.set.name ?? "?"} has ${action.moveName}.`,
        "scout"
      );
    }

    case "UNREVEAL_MOVE":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: { ...m.revealed, moves: m.revealed.moves.filter((x) => x !== action.moveName) },
      }));

    case "RULE_OUT_MOVE": {
      const next = patchMon(state, action.uid, (m) =>
        m.revealed.ruledOut.includes(action.moveName)
          ? m
          : {
              ...m,
              revealed: {
                ...m.revealed,
                // Ruling a move out also un-confirms it, so the two lists stay disjoint.
                moves: m.revealed.moves.filter((x) => x !== action.moveName),
                ruledOut: [...m.revealed.ruledOut, action.moveName],
              },
            }
      );
      if (next === state) return state;
      return log(
        next,
        `Ruled out ${action.moveName} on ${state.mons[action.uid]?.set.name ?? "?"}.`,
        "scout"
      );
    }

    case "UNRULE_MOVE":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: {
          ...m.revealed,
          ruledOut: m.revealed.ruledOut.filter((x) => x !== action.moveName),
        },
      }));

    case "RULE_OUT_ITEM": {
      const mon = state.mons[action.uid];
      if (!mon || mon.revealed.itemRuledOut.includes(action.item)) return state;
      const next = patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: { ...m.revealed, itemRuledOut: [...m.revealed.itemRuledOut, action.item] },
      }));
      return log(next, `Ruled out ${action.item} on ${mon.set.name}.`, "scout");
    }

    case "RULE_OUT_ABILITY": {
      const mon = state.mons[action.uid];
      if (!mon || mon.revealed.abilityRuledOut.includes(action.ability)) return state;
      const next = patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: {
          ...m.revealed,
          abilityRuledOut: [...m.revealed.abilityRuledOut, action.ability],
        },
      }));
      return log(next, `Ruled out ${action.ability} on ${mon.set.name}.`, "scout");
    }

    case "UNRULE_ITEM":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: {
          ...m.revealed,
          itemRuledOut: m.revealed.itemRuledOut.filter((x) => x !== action.item),
        },
      }));

    case "UNRULE_ABILITY":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: {
          ...m.revealed,
          abilityRuledOut: m.revealed.abilityRuledOut.filter((x) => x !== action.ability),
        },
      }));

    case "SET_REVEALED":
      return patchMon(state, action.uid, (m) => ({
        ...m,
        revealed: { ...m.revealed, [action.field]: action.value },
      }));

    case "SET_WEATHER": {
      const turns = action.rock ? state.durations.weatherRock : state.durations.weather;
      const field: Field = {
        ...state.field,
        weather: action.kind ? { kind: action.kind, turnsLeft: turns } : null,
      };
      return log(
        { ...state, field },
        action.kind ? `${action.kind} up (${turns} turns).` : "Weather cleared.",
        "field"
      );
    }

    case "SET_TERRAIN": {
      const field: Field = {
        ...state.field,
        terrain: action.kind ? { kind: action.kind, turnsLeft: state.durations.terrain } : null,
      };
      return { ...state, field };
    }

    case "SET_TAILWIND": {
      const field: Field = {
        ...state.field,
        tailwind: {
          ...state.field.tailwind,
          [action.side]: action.on ? state.durations.tailwind : 0,
        },
      };
      return log(
        { ...state, field },
        `Tailwind ${action.on ? "up" : "gone"} (${action.side === "me" ? "yours" : "theirs"}).`,
        "field"
      );
    }

    case "SET_TRICK_ROOM": {
      const field: Field = {
        ...state.field,
        trickRoom: action.on ? state.durations.trickRoom : 0,
      };
      return log({ ...state, field }, `Trick Room ${action.on ? "up" : "gone"}.`, "field");
    }

    case "SET_SCREEN": {
      const turns = action.clay ? state.durations.screensClay : state.durations.screens;
      const field: Field = {
        ...state.field,
        screens: {
          ...state.field.screens,
          [action.side]: {
            ...state.field.screens[action.side],
            [action.kind]: action.on ? turns : 0,
          },
        },
      };
      return { ...state, field };
    }

    case "SET_GRAVITY":
      return {
        ...state,
        field: { ...state.field, gravity: action.on ? state.durations.gravity : 0 },
      };

    case "SET_TIMER": {
      const [group, key] = action.path.split(".");
      const field: Field = { ...state.field };
      if (group === "weather" && field.weather) {
        field.weather = { ...field.weather, turnsLeft: action.value };
      } else if (group === "terrain" && field.terrain) {
        field.terrain = { ...field.terrain, turnsLeft: action.value };
      } else if (group === "trickRoom") {
        field.trickRoom = action.value;
      } else if (group === "gravity") {
        field.gravity = action.value;
      } else if (group === "tailwind") {
        field.tailwind = { ...field.tailwind, [key as SideId]: action.value };
      } else if (group === "screensMe") {
        field.screens = { ...field.screens, me: { ...field.screens.me, [key]: action.value } };
      } else if (group === "screensOpp") {
        field.screens = { ...field.screens, opp: { ...field.screens.opp, [key]: action.value } };
      }
      return { ...state, field };
    }

    case "SET_DURATION":
      return { ...state, durations: { ...state.durations, [action.key]: action.value } };

    case "APPLY_TURN_SCRIPT": {
      const { entries, script } = action;
      if (entries.length === 0) return state;

      let next: BattleState = log(state, `Turn ${state.turn}: ${script}`, "action");

      // 0. Split off what the parser could not resolve. Those entries used to
      //    reach the simulator and crash it, which meant one mistyped segment
      //    threw away the whole turn. Drop them and SAY SO - a silently ignored
      //    line would leave the board quietly wrong.
      const usable: { actorUid: string; moveName: string | null; action: SimAction }[] = [];
      for (const e of entries) {
        if (e.actorUid && e.action) {
          usable.push({ actorUid: e.actorUid, moveName: e.moveName, action: e.action });
          continue;
        }
        next = log(
          next,
          `Skipped "${(e.raw ?? "that segment").trim()}" - ` +
            `${e.problem ?? "could not tell what happened"}. The rest of the turn was applied.`,
          "system"
        );
      }
      if (usable.length === 0) return next;

      // 1. Everything they used is now CONFIRMED. This is the cheapest scouting
      //    there is - you already watched it happen.
      for (const e of usable) {
        const mon = next.mons[e.actorUid];
        if (!mon || mon.side !== "opp" || !e.moveName) continue;
        if (mon.revealed.moves.includes(e.moveName)) continue;
        next = patchMon(next, e.actorUid, (m) => ({
          ...m,
          revealed: {
            ...m.revealed,
            moves: [...m.revealed.moves, e.moveName!],
            ruledOut: m.revealed.ruledOut.filter((x) => x !== e.moveName),
          },
        }));
        next = log(next, `Confirmed ${mon.set.name} has ${e.moveName}.`, "scout");
      }

      // 2. The ORDER is a Speed observation. Narrow their possible Speed stats
      //    against it before the field changes.
      const observations = deriveObservations(next, usable);
      const speedUpdates = applyObservations(next, observations);
      for (const [uid, candidates] of Object.entries(speedUpdates)) {
        const before = speedRange(next.mons[uid]);
        next = patchMon(next, uid, (m) => ({ ...m, speedCandidates: candidates }));
        const after = speedRange(next.mons[uid]);
        next = log(
          next,
          `Speed read on ${next.mons[uid].set.name}: ${before.min}-${before.max} narrowed to ` +
            `${after.min}-${after.max}${after.known ? " (exact)" : ""}.`,
          "scout"
        );
      }

      // 3. Play the turn out. Average rolls, because this already happened and
      //    you can correct HP from the game if you can see it.
      const plan: Plan = {};
      for (const e of usable) plan[e.actorUid] = e.action;
      const sim = simulateTurn(next, plan, { roll: "average", tie: "them" });
      next = sim.state;
      for (const ev of sim.events) next = log(next, ev.text, "action");

      // 4. What you actually SAW overrides the simulated roll.
      //
      //    Record the HP each Pokemon was on BEFORE the correction, because the
      //    difference between that and what you report is a measurement of the
      //    attacker's investment - see step 5.
      const hpBeforeEffect: Record<string, number> = {};
      for (const eff of action.effects ?? []) {
        const mon = next.mons[eff.uid];
        if (!mon) continue;
        hpBeforeEffect[eff.uid] = state.mons[eff.uid]?.curHP ?? mon.curHP;
        if (eff.kind === "faint") {
          next = patchMon(next, eff.uid, (m) => ({ ...m, curHP: 0, fainted: true }));
          next = log(next, `${mon.set.name} fainted.`, "hp");
        } else {
          const target =
            eff.exact !== undefined ? eff.exact : (mon.maxHP * (eff.pct ?? 100)) / 100;
          next = patchMon(next, eff.uid, (m) => clampHP(m, target));
          next = log(
            next,
            `${mon.set.name} corrected to ${next.mons[eff.uid].curHP}/${mon.maxHP} HP.`,
            "hp"
          );
        }
      }

      // 5. The damage you just reported is a MEASUREMENT of their spread.
      //
      //    "Heat Wave did 82% to Raichu" bounds Charizard's Special Attack, and
      //    that bound holds for the rest of the game. A KO is deliberately not
      //    used: all it proves is "at least lethal", which is a far weaker
      //    statement than an exact number and would wrongly narrow the range.
      //    Attribution has to be exact. A spread move hit everything on the far
      //    side, so every reported drop over there is its doing - but a
      //    single-target move with no target recorded is ambiguous, and a
      //    Pokemon on the attacker's OWN side never took damage from it. Get
      //    this wrong and the tool "measures" a stat from someone else's hit.
      const attackerSideOf = (uid: string) => next.mons[uid]?.side;
      for (const e of usable) {
        if (e.action.kind !== "move") continue;
        const spread = Boolean(getMoveData(e.action.moveName)?.spread);
        const foeSide = attackerSideOf(e.actorUid) === "me" ? "opp" : "me";
        const targets = e.action.targetUid
          ? [e.action.targetUid]
          : spread
            ? Object.keys(hpBeforeEffect).filter((u) => next.mons[u]?.side === foeSide)
            : [];
        for (const targetUid of targets) {
          if (!(targetUid in hpBeforeEffect)) continue;
          const after = next.mons[targetUid];
          if (!after || after.fainted) continue;
          const before = hpBeforeEffect[targetUid];
          const damage = before - after.curHP;
          if (damage <= 0) continue;

          // Damage no legal spread could produce means an assumption is wrong,
          // and that is worth more than any deduction - say it rather than
          // discarding the observation.
          const impossible = damageContradiction(
            {
              attackerUid: e.actorUid,
              defenderUid: targetUid,
              moveName: e.action.moveName,
              damage,
              defenderMaxHP: after.maxHP,
            },
            state
          );
          if (impossible) {
            next = log(next, impossible, "scout");
            continue;
          }

          const narrowings = narrowFromDamage(
            {
              attackerUid: e.actorUid,
              defenderUid: targetUid,
              moveName: e.action.moveName,
              damage,
              defenderMaxHP: after.maxHP,
            },
            // Measured against the board as it was when the hit landed.
            state
          );
          for (const n of narrowings) {
            next = patchMon(next, n.uid, (m) => {
              const prev = m.statBounds[n.key as keyof typeof m.statBounds];
              // Intersect with anything already proved - every hit either
              // narrows the range or agrees with it.
              const merged = prev
                ? {
                    min: Math.max(prev.min, n.after.min),
                    max: Math.min(prev.max, n.after.max),
                    minSP: Math.max(prev.minSP, Math.min(...n.sp)),
                  }
                : { min: n.after.min, max: n.after.max, minSP: Math.min(...n.sp) };
              return { ...m, statBounds: { ...m.statBounds, [n.key]: merged } };
            });
            next = log(next, n.text, "scout");
          }
        }
      }

      return next;
    }

    case "NEXT_TURN": {
      const f = state.field;
      const dec = (n: number) => Math.max(0, n - 1);
      const expired: string[] = [];
      if (f.weather && f.weather.turnsLeft === 1) expired.push(f.weather.kind);
      if (f.terrain && f.terrain.turnsLeft === 1) expired.push(f.terrain.kind + " terrain");
      if (f.trickRoom === 1) expired.push("Trick Room");
      if (f.tailwind.me === 1) expired.push("your Tailwind");
      if (f.tailwind.opp === 1) expired.push("their Tailwind");

      const decScreens = (s: Screens): Screens => ({
        reflect: dec(s.reflect),
        lightScreen: dec(s.lightScreen),
        auroraVeil: dec(s.auroraVeil),
      });

      const field: Field = {
        weather:
          f.weather && f.weather.turnsLeft > 1
            ? { ...f.weather, turnsLeft: dec(f.weather.turnsLeft) }
            : null,
        terrain:
          f.terrain && f.terrain.turnsLeft > 1
            ? { ...f.terrain, turnsLeft: dec(f.terrain.turnsLeft) }
            : null,
        trickRoom: dec(f.trickRoom),
        gravity: dec(f.gravity),
        tailwind: { me: dec(f.tailwind.me), opp: dec(f.tailwind.opp) },
        screens: { me: decScreens(f.screens.me), opp: decScreens(f.screens.opp) },
      };
      // Everything still out has now been on the field one turn longer, which
      // is what makes Fake Out illegal for it from here on.
      const mons = { ...state.mons };
      for (const side of ["me", "opp"] as SideId[]) {
        for (const uid of state.sides[side].active) {
          if (!uid || !mons[uid]) continue;
          mons[uid] = { ...mons[uid], turnsOnField: mons[uid].turnsOnField + 1 };
        }
      }

      let next: BattleState = { ...state, mons, turn: state.turn + 1, field };
      next = log(next, `--- Turn ${next.turn} ---`, "system");
      if (expired.length) next = log(next, `Ended: ${expired.join(", ")}.`, "field");
      return next;
    }

    case "LOG":
      return log(state, action.text, action.kind);

    case "RESET":
      // Resetting the battle must never discard the team you entered.
      return newBattleState(action.team);

    default:
      return state;
  }
}

// --- Session wrapper (undo / redo) -----------------------------------------
export type SessionAction = Action | { type: "UNDO" } | { type: "REDO" };

/** Actions that only annotate, not change the board - no undo entry needed. */
const NON_UNDOABLE = new Set<string>(["LOG"]);

export function sessionReduce(session: Session, action: SessionAction): Session {
  if (action.type === "UNDO") {
    if (session.past.length === 0) return session;
    const previous = session.past[session.past.length - 1];
    return {
      present: previous,
      past: session.past.slice(0, -1),
      future: [session.present, ...session.future],
    };
  }
  if (action.type === "REDO") {
    if (session.future.length === 0) return session;
    const [next, ...rest] = session.future;
    return { present: next, past: [...session.past, session.present], future: rest };
  }

  const present = reduce(session.present, action as Action);
  if (present === session.present) return session;
  if (NON_UNDOABLE.has(action.type)) return { ...session, present };

  return {
    present,
    past: [...session.past, session.present].slice(-100),
    future: [],
  };
}

export { makeMonState };
