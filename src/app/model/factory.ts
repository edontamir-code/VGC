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
 * A MonState at full health.
 * `hasMega` defaults to true for mons whose `base` is already the Mega line -
 * that is the in-battle profile the data files document (team.js header).
 */
export function makeMonState(
  set: MonSet,
  side: SideId,
  origin: MonOrigin
): MonState {
  const stats = computeStats(set.base, set.sp, set.nature);
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
    hasMega: Boolean(set.megaName ?? set.baseForm),
    unburdened: false,
    fainted: false,
    turnsOnField: 0,
    protectStreak: 0,
    lastMoveName: null,
    encoreTurnsLeft: 0,
    speedCandidates: null,
    // My own team is known; theirs starts as "might have been brought".
    brought: side === "me" ? "confirmed" : "possible",
    // My own mons are fully known; opponents start as assumed common sets.
    revealed:
      side === "me"
        ? { moves: [...set.moves], ruledOut: [], item: true, ability: true, nature: true, sp: true }
        : { ...NOTHING_REVEALED, moves: [], ruledOut: [] },
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
  const mons: Record<string, MonState> = {};
  for (const m of mine) mons[m.uid] = m;

  return {
    turn: 1,
    mons,
    sides: {
      me: {
        active: [mine[0]?.uid ?? null, mine[1]?.uid ?? null],
        bench: mine.slice(2).map((m) => m.uid),
      },
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
