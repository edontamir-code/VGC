// ===========================================================================
// Building MonSets / MonStates / a fresh BattleState from the data files.
// ===========================================================================
import { computeStats } from "../../engine.js";
import { TEAM } from "../../data/team.js";
import { THREATS } from "../../data/threats.js";
import type { TeamMon } from "../../data/team.js";
import type { ThreatMon } from "../../data/threats.js";
import {
  DEFAULT_DURATIONS, EMPTY_FIELD, NOTHING_REVEALED, ZERO_STAGES,
} from "./types.ts";
import type {
  BattleState, MonSet, MonState, MonOrigin, SideId, Session,
} from "./types.ts";

let uidCounter = 0;
export function nextUid(prefix = "m"): string {
  uidCounter += 1;
  return `${prefix}${uidCounter}`;
}

export function setFromTeam(m: TeamMon): MonSet {
  return {
    speciesId: m.name,
    name: m.mega ?? m.name,
    types: [...m.types],
    base: { ...m.base },
    baseForm: m.baseForm ? { ...m.baseForm } : undefined,
    megaName: m.mega,
    sp: { ...m.sp },
    nature: { ...m.nature },
    item: m.item,
    ability: m.ability,
    moves: [...m.moves],
    movePool: m.movePool ? [...m.movePool] : undefined,
    immuneTypes: m.immuneTypes ? [...m.immuneTypes] : undefined,
    berry: m.berry ? { ...m.berry } : undefined,
    setsWeather: m.setsWeather ?? null,
    note: m.note,
  };
}

export function setFromThreat(t: ThreatMon): MonSet {
  return {
    speciesId: t.id,
    name: t.name,
    types: [...t.types],
    base: { ...t.base },
    // Without this an opposing Mega had no pre-Mega line, so it silently used
    // its Mega stats even before it had Mega Evolved.
    baseForm: t.baseForm ? { ...t.baseForm } : undefined,
    megaName: t.baseForm ? t.name : undefined,
    sp: { ...t.sp },
    nature: { ...t.nature },
    item: t.item,
    ability: t.ability,
    moves: [...t.moves],
    movePool: t.movePool ? [...t.movePool] : undefined,
    immuneTypes: t.immuneTypes ? [...t.immuneTypes] : undefined,
    berry: t.berry ? { ...t.berry } : undefined,
    setsWeather: t.setsWeather ?? null,
    note: t.note,
    dataConf: t.conf,
  };
}

/**
 * A MonState at full health, in its BASE form.
 *
 * `set.base` is the Mega stat line for anything holding a stone, because that
 * is the profile the data files document. But nobody arrives Mega Evolved -
 * not me and not them. Defaulting `hasMega` to true meant an opposing
 * Charizard walked onto the field as Mega Charizard Y: Drought instead of
 * Blaze (sun up, every Fire number x1.5), 159 SpA instead of 109, and its
 * Mega already treated as spent. That made the opponent look both stronger
 * and more committed than they were.
 */
export function makeMonState(
  set: MonSet,
  side: SideId,
  origin: MonOrigin
): MonState {
  const stats = computeStats(set.baseForm ?? set.base, set.sp, set.nature);
  return {
    uid: nextUid(side === "me" ? "me" : "op"),
    side,
    origin,
    set,
    maxHP: stats.hp,
    curHP: stats.hp,
    stages: { ...ZERO_STAGES },
    status: null,
    itemActive: true,
    hasMega: false,
    unburdened: false,
    fainted: false,
    turnsOnField: 0,
    protectStreak: 0,
    lastMoveName: null,
    encoreTurnsLeft: 0,
    mustRecharge: false,
    speedCandidates: null,
    statBounds: {},
    // My own team is known; theirs starts as "might have been brought".
    brought: side === "me" ? "confirmed" : "possible",
    // My own mons are fully known; opponents start as assumed common sets.
    revealed:
      side === "me"
        ? {
            moves: [...set.moves], ruledOut: [],
            item: true, itemRuledOut: [],
            ability: true, abilityRuledOut: [],
            nature: true, sp: true,
          }
        : { ...NOTHING_REVEALED, moves: [], ruledOut: [], itemRuledOut: [], abilityRuledOut: [] },
  };
}

export function monFromTeamName(name: string, side: SideId = "me"): MonState | null {
  const m = TEAM.find((x) => x.name === name);
  return m ? makeMonState(setFromTeam(m), side, "team") : null;
}

export function monFromThreatId(id: string, side: SideId = "opp"): MonState | null {
  const t = THREATS.find((x) => x.id === id);
  return t ? makeMonState(setFromThreat(t), side, "threat") : null;
}

/**
 * Fresh board: my 6 loaded (first two active), opponent side empty until the
 * user fills it in from Team Preview.
 */
export function newBattleState(customTeam?: MonSet[]): BattleState {
  const sets = customTeam?.length ? customTeam : TEAM.map((m) => setFromTeam(m));
  const mine = sets.map((s) => makeMonState({ ...s }, "me", "team"));

  // NOBODY has Mega Evolved at the start of a battle - see makeMonState, which
  // now enforces that for both sides rather than patching it back here for
  // mine only. Mega Evolution is an action you take during a turn, not a state
  // you begin in, and until you take it you have the BASE form with the BASE
  // ability. Raichu is Lightning Rod - which REDIRECTS Electric moves onto it -
  // right up until it becomes No Guard.
  const mons: Record<string, MonState> = {};
  for (const m of mine) mons[m.uid] = m;

  return {
    turn: 1,
    mons,
    sides: {
      // NOBODY is out until you say who you led.
      //
      // This used to default to the first two on the team, which put both Mega
      // stone holders on the field before the game had started. Every read on
      // the board was then about a lead you had not chosen and would often
      // never play - and the tool showed it confidently, which is worse than
      // showing nothing. Team preview comes before turn 1 in the real game, and
      // the board should say so.
      me: { active: [null, null], bench: mine.map((m) => m.uid) },
      opp: { active: [null, null], bench: [] },
    },
    field: {
      ...EMPTY_FIELD,
      tailwind: { me: 0, opp: 0 },
      screens: {
        me: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
        opp: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
      },
    },
    durations: { ...DEFAULT_DURATIONS },
    log: [
      {
        id: nextUid("log"),
        turn: 1,
        text: "Battle started. Add the opponent's mons as you see them.",
        kind: "system",
      },
    ],
  };
}

export function newSession(customTeam?: MonSet[]): Session {
  return { present: newBattleState(customTeam), past: [], future: [] };
}

export { TEAM, THREATS };
