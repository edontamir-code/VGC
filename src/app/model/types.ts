// ===========================================================================
// BattleState - the live board model from BATTLE_MODEL.md.
// Nothing here does math; it holds what the engine needs to be asked about.
// ===========================================================================
import type {
  BaseStats, SPSpread, Nature, WeatherKind, Stats,
} from "../../engine.js";
import type { SideId, StatusKind } from "../../speed.js";
import type { BerrySpec } from "../../data/team.js";
import type { DataConfidence } from "../../data/threats.js";

export type { SideId, StatusKind, WeatherKind, Stats, BaseStats, SPSpread, Nature, BerrySpec };

// --- The editable set -------------------------------------------------------
// threats.js provides the DEFAULT common set; this is a mutable copy of it.
export interface MonSet {
  speciesId: string;
  name: string;
  types: string[];
  /** In-battle base stats. For a Mega mon this is the MEGA form's line. */
  base: BaseStats;
  /** Pre-Mega base stats, when the mon Megas. */
  baseForm?: BaseStats;
  /** Display name once Mega-evolved. */
  megaName?: string;
  sp: SPSpread;
  nature: Nature;
  item: string;
  ability: string;
  /** The four moves currently assumed. Editable. */
  moves: string[];
  /**
   * Every move this species commonly runs - usually more than four, of which
   * they bring four. Until you have confirmed four, the planner treats any
   * un-ruled-out pool move as something they might have.
   */
  movePool?: string[];
  immuneTypes?: string[];
  berry?: BerrySpec;
  setsWeather?: WeatherKind | null;
  note?: string;
  /** Confidence in the SOURCE DATA (see threats.d.ts), not in the opponent. */
  dataConf?: DataConfidence;
}

// --- Per-Pokemon live state -------------------------------------------------
export type StageKey = "atk" | "def" | "spa" | "spd" | "spe" | "acc" | "eva";
export type Stages = Record<StageKey, number>;

export const ZERO_STAGES: Stages = {
  atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0,
};

/**
 * Scouting progress. Anything not revealed is an ASSUMPTION carried over from
 * the common-set database and must never be rendered as a certainty.
 */
export interface Revealed {
  /** Move names actually observed in this game. */
  moves: string[];
  /**
   * Pool moves you have decided they are NOT running. Ruling moves out is as
   * informative as confirming them - it is what collapses the search space.
   */
  ruledOut: string[];
  /** True once you have SEEN the item, which pins it to set.item. */
  item: boolean;
  /** Items you have ruled out - e.g. it took a hit that a Sash would have survived. */
  itemRuledOut: string[];
  /** True once you have SEEN the ability. */
  ability: boolean;
  /** Abilities ruled out - e.g. it was hit by priority, so it lacks Armor Tail. */
  abilityRuledOut: string[];
  nature: boolean;
  /** True once the user pins down the SP spread (e.g. from a damage roll). */
  sp: boolean;
}

export const NOTHING_REVEALED: Revealed = {
  moves: [], ruledOut: [],
  item: false, itemRuledOut: [],
  ability: false, abilityRuledOut: [],
  nature: false, sp: false,
};

/** Moves a Pokemon can carry. */
export const MOVE_SLOTS = 4;

export type MonOrigin = "team" | "threat" | "custom";

/**
 * Whether this Pokemon is part of the four its trainer actually brought.
 * You see six at preview and they bring four, so most of the roster sits at
 * "possible" until you see it or until four others are confirmed.
 *
 * The planner treats every "possible" bench mon as a legal switch-in for them.
 * That is deliberately pessimistic: they might not have brought it, but if they
 * did, this is what happens - and a guarantee has to survive that.
 */
export type BroughtStatus = "confirmed" | "possible" | "out";

/** Champions doubles: six on the team, four brought to the battle. */
export const BROUGHT_COUNT = 4;
export const ROSTER_SIZE = 6;

export interface MonState {
  uid: string;
  side: SideId;
  origin: MonOrigin;
  set: MonSet;
  maxHP: number;
  /** Exact remaining HP. The UI lets the user enter either exact or %. */
  curHP: number;
  stages: Stages;
  status: StatusKind | null;
  /** False once Sitrus/Sash/berry has been consumed. */
  itemActive: boolean;
  hasMega: boolean;
  /** Unburden speed doubling armed (item gone). */
  unburdened: boolean;
  fainted: boolean;
  /**
   * Turns this mon has been on the field. 0 = it came in this turn.
   * Fake Out is only legal at 0, which is why the planner has to track it.
   */
  turnsOnField: number;
  /**
   * Consecutive successful Protects. A second Protect in a row is unreliable,
   * so the planner treats it as FAILING - a pin may never rest on it.
   */
  protectStreak: number;
  /** The last move this mon used - what an Encore would lock it into. */
  lastMoveName: string | null;
  /** Turns remaining locked into `lastMoveName` by Encore. 0 = free. */
  encoreTurnsLeft: number;
  /**
   * True when this Pokemon spent its last turn on a recharge move (Hyper Beam)
   * and must spend this one doing nothing.
   *
   * Without this the search gets 150 BP for free and recommends Hyper Beam over
   * everything, because the turn it costs never appears in any line it looks at.
   */
  mustRecharge: boolean;
  /**
   * Raw Speed stats still consistent with every turn order observed so far.
   * null = nothing observed yet (all legal spreads possible). Narrowed by
   * speedInference.ts as you record turns.
   */
  speedCandidates: number[] | null;
  /**
   * Stat values still consistent with the damage actually observed, per stat.
   *
   * "Heat Wave did 82% to Raichu" is a measurement of Special Attack, and it
   * holds for the rest of the game. These compound: every hit either narrows
   * the range or confirms it. Written by damageInference.ts.
   */
  statBounds: Partial<Record<"atk" | "def" | "spa" | "spd" | "hp", { min: number; max: number; minSP: number }>>;
  /** Part of their brought four? See BroughtStatus. */
  brought: BroughtStatus;
  revealed: Revealed;
}

// --- Field ------------------------------------------------------------------
export type TerrainKind = "electric" | "grassy" | "misty" | "psychic";

export interface Weather { kind: WeatherKind; turnsLeft: number }
export interface Terrain { kind: TerrainKind; turnsLeft: number }

/** turnsLeft per screen; 0 = not up. */
export interface Screens {
  reflect: number;
  lightScreen: number;
  auroraVeil: number;
}

export interface Field {
  weather: Weather | null;
  terrain: Terrain | null;
  /** turnsLeft; 0 = off. */
  trickRoom: number;
  tailwind: Record<SideId, number>;
  screens: Record<SideId, Screens>;
  gravity: number;
}

/**
 * Editable so the app survives a balance patch without a code change
 * (BATTLE_MODEL.md step 4).
 */
export interface Durations {
  weather: number;
  weatherRock: number;
  tailwind: number;
  trickRoom: number;
  screens: number;
  screensClay: number;
  terrain: number;
  gravity: number;
}

export const DEFAULT_DURATIONS: Durations = {
  weather: 5, weatherRock: 8,
  tailwind: 4, trickRoom: 5,
  screens: 5, screensClay: 8,
  terrain: 5, gravity: 5,
};

export const EMPTY_SCREENS: Screens = { reflect: 0, lightScreen: 0, auroraVeil: 0 };

export const EMPTY_FIELD: Field = {
  weather: null,
  terrain: null,
  trickRoom: 0,
  tailwind: { me: 0, opp: 0 },
  screens: { me: { ...EMPTY_SCREENS }, opp: { ...EMPTY_SCREENS } },
  gravity: 0,
};

// --- The board --------------------------------------------------------------
/** Slots hold uids; null = empty slot (fainted and not yet replaced). */
export interface SideState {
  active: (string | null)[];
  bench: string[];
}

export interface LogEntry {
  id: string;
  turn: number;
  text: string;
  kind: "action" | "field" | "hp" | "scout" | "system";
}

export interface BattleState {
  turn: number;
  mons: Record<string, MonState>;
  sides: Record<SideId, SideState>;
  field: Field;
  durations: Durations;
  log: LogEntry[];
}

/** Undo/redo wrapper. Snapshots are cheap - the state is a few KB. */
export interface Session {
  present: BattleState;
  past: BattleState[];
  future: BattleState[];
}

export const OTHER_SIDE: Record<SideId, SideId> = { me: "opp", opp: "me" };
