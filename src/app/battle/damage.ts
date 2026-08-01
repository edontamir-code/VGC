// ===========================================================================
// Resolving one attacker + one defender + one move against the CURRENT board.
// Every number returned comes out of src/engine.js. This file only decides
// which inputs to hand it, and how to phrase the answer.
// ===========================================================================
import { matchup } from "../../engine.js";
import type { DamageResult, MatchupField, MatchupMon, MatchupMove } from "../../engine.js";
import type { BattleState, MonState } from "../model/types.ts";
import { activeProfile, battleStats, immuneTypesOf } from "./stats.ts";
import { attackerAbilityMods, defenderAbilityMods, ignoresBurn } from "./abilities.ts";
import { buildMove } from "./moves.ts";
import type { BuildMoveOpts } from "./moves.ts";

export type Verdict = "IMMUNE" | "LIVES" | "SASH" | "ROLL" | "DEAD";

export interface ResolvedMatchup {
  moveName: string;
  resolvedType: string;
  power: number;
  hits: number;
  category: "phys" | "spec";
  spread: boolean;

  /** Damage numbers (already summed across multi-hit). */
  min: number;
  max: number;
  typeMult: number;

  /** Percentages of the defender's MAX HP - the conventional calc reading. */
  minPct: number;
  maxPct: number;
  /** Percentages of the defender's CURRENT HP - what matters mid-battle. */
  minPctCur: number;
  maxPctCur: number;

  /** Verdict against full HP (the BUILD_BRIEF semantics). */
  verdictFull: Verdict;
  /** Verdict against current HP - the live one. */
  verdict: Verdict;
  /** Engine's KO wording against current HP. */
  koChance: string;
  /** Best case / worst case hits needed to KO from current HP. */
  hitsToKObest: number;
  hitsToKOworst: number;

  defenderMaxHP: number;
  defenderCurHP: number;

  modifiers: string[];
  caveats: string[];
  assumptions: string[];
}

/** Run the engine with an explicit defender HP (used for KO-at-current-HP). */
function run(
  a: MatchupMon,
  d: MatchupMon,
  move: MatchupMove,
  field: MatchupField,
  defHP: number
): DamageResult {
  return matchup(a, { ...d, stats: { ...d.stats!, hp: defHP } }, move, field);
}

/** Which screen, if any, protects the defender against this move category. */
function screenUp(
  state: BattleState,
  defender: MonState,
  category: "phys" | "spec"
): string | null {
  const s = state.field.screens[defender.side];
  if (s.auroraVeil > 0) return "Aurora Veil";
  if (category === "phys" && s.reflect > 0) return "Reflect";
  if (category === "spec" && s.lightScreen > 0) return "Light Screen";
  return null;
}

function fmt(stage: number): string {
  return stage > 0 ? `+${stage}` : `${stage}`;
}

// ---------------------------------------------------------------------------
// Memoisation.
//
// The planner calls this hundreds of thousands of times, overwhelmingly with
// repeats: the same attacker object, defender object and field object recur
// across thousands of action profiles. Because every state transition produces
// NEW objects and never mutates old ones, object identity is a sound cache key.
// ---------------------------------------------------------------------------
const objIds = new WeakMap<object, number>();
let nextObjId = 0;
function idOf(o: object): number {
  let v = objIds.get(o);
  if (v === undefined) {
    v = ++nextObjId;
    objIds.set(o, v);
  }
  return v;
}

const matchupCache = new Map<string, ResolvedMatchup | null>();
const CACHE_LIMIT = 200_000;

/** Exposed for tests and for the UI to reclaim memory between battles. */
export function clearMatchupCache(): void {
  matchupCache.clear();
}

export function resolveMatchup(
  attacker: MonState,
  defender: MonState,
  moveName: string,
  state: BattleState,
  opts: BuildMoveOpts = {}
): ResolvedMatchup | null {
  // Only the default option set is cached; anything with extra modifiers is rare.
  if (!opts.helpingHand) {
    const key = `${idOf(attacker)}|${idOf(defender)}|${moveName}|${idOf(state.field)}|${idOf(state.mons)}`;
    const hit = matchupCache.get(key);
    if (hit !== undefined) return hit;
    const computed = resolveMatchupUncached(attacker, defender, moveName, state, opts);
    if (matchupCache.size > CACHE_LIMIT) matchupCache.clear();
    matchupCache.set(key, computed);
    return computed;
  }
  return resolveMatchupUncached(attacker, defender, moveName, state, opts);
}

function resolveMatchupUncached(
  attacker: MonState,
  defender: MonState,
  moveName: string,
  state: BattleState,
  opts: BuildMoveOpts = {}
): ResolvedMatchup | null {
  const built = buildMove(moveName, attacker, defender, state, opts);
  if (!built) return null;

  const aProf = activeProfile(attacker);
  const dProf = activeProfile(defender);
  // battleStats, not stagedStats: this is where Huge Power and friends land.
  const aStats = battleStats(attacker, state);
  const dStats = battleStats(defender, state);
  const weather = state.field.weather?.kind ?? null;
  const category = built.move.category;

  const engineAttacker: MatchupMon = {
    types: aProf.types,
    stats: aStats,
    item: attacker.itemActive ? attacker.set.item : "",
    ability: aProf.ability,
    // Deliberately null. engine.js:135 falls back to `attacker.setsWeather`
    // when field.weather is null, which is right for a one-off calc but wrong
    // for a tracker: it would keep applying sun after Drought's turns ran out
    // or after another setter overwrote it. BATTLE_MODEL.md makes the FIELD
    // authoritative, so the field is the only thing we let the engine see.
    // (The tracker auto-sets weather when a Drought/Drizzle mon comes in.)
    setsWeather: null,
  };
  const engineDefender: MatchupMon = {
    types: dProf.types,
    stats: { ...dStats, hp: defender.maxHP },
    item: defender.itemActive ? defender.set.item : "",
    ability: dProf.ability,
    immuneTypes: immuneTypesOf(defender),
  };

  const screen = screenUp(state, defender, category);
  const modifiers = [...built.modifiers];
  const assumptions: string[] = ["no crit"];
  const caveats = [...built.caveats];

  const burned = attacker.status === "brn" && category === "phys" && !ignoresBurn(attacker);
  const field: MatchupField = {
    weather,
    screen: Boolean(screen),
    singles: false,
    atkMult: burned ? 0.5 : 1,
  };
  if (screen) modifiers.push(`${screen} (x0.667)`);
  if (burned) modifiers.push("Burn x0.5 Atk");
  if (attacker.status === "brn" && category === "phys" && !burned) {
    modifiers.push("Guts ignores the burn");
  }

  // Attacker-side ability modifiers, folded into the engine's otherMult.
  const atkMods = attackerAbilityMods(
    attacker,
    moveName,
    built.resolvedType,
    built.move.power,
    Boolean(built.move.contact)
  );

  // Pass 1 - no defensive berry yet; we need typeMult to know if it triggers.
  let move: MatchupMove = built.move;
  for (const mod of atkMods) {
    move = { ...move, otherMult: (move.otherMult ?? 1) * mod.mult };
    modifiers.push(mod.label);
  }
  let result = run(engineAttacker, engineDefender, move, field, defender.maxHP);

  // Defender-side ability modifiers need the type effectiveness, so they go on
  // a second pass once the engine has told us what it is.
  const defMods = defenderAbilityMods(
    defender,
    built.resolvedType,
    Boolean(built.move.contact),
    result.typeMult
  );
  if (defMods.length) {
    for (const mod of defMods) {
      move = { ...move, otherMult: (move.otherMult ?? 1) * mod.mult };
      modifiers.push(mod.label);
    }
    result = run(engineAttacker, engineDefender, move, field, defender.maxHP);
  }

  // Pass 2 - apply Occa/Chople now that super-effectiveness is known.
  const berry = defender.set.berry;
  if (
    berry &&
    defender.itemActive &&
    berry.type === built.resolvedType &&
    (!berry.superEffOnly || result.typeMult > 1)
  ) {
    move = { ...move, otherMult: (move.otherMult ?? 1) * berry.mult };
    result = run(engineAttacker, engineDefender, move, field, defender.maxHP);
    modifiers.push(`${berry.type} berry x${berry.mult}`);
  }

  const hits = built.hits;
  const min = result.min * hits;
  const max = result.max * hits;
  const curHP = Math.max(0, defender.curHP);

  // KO wording against CURRENT HP. The engine's koChance is exact for a single
  // hit; for multi-hit we can only state the bounds honestly.
  let koChance: string;
  if (hits === 1) {
    koChance = run(engineAttacker, engineDefender, move, field, Math.max(1, curHP)).koChance;
  } else if (min >= curHP) {
    koChance = "guaranteed KO";
  } else if (max < curHP) {
    koChance = "guaranteed survive";
  } else {
    koChance = "roll (multi-hit - exact odds not modelled)";
  }

  const pct = (n: number, of: number) => (of > 0 ? +((100 * n) / of).toFixed(1) : 0);

  const immune = result.typeMult === 0;
  const sashHeld =
    defender.set.item === "Focus Sash" && defender.itemActive && curHP === defender.maxHP;

  const verdictAt = (hp: number): Verdict => {
    if (immune) return "IMMUNE";
    if (sashHeld) return "SASH";
    if (max < hp) return "LIVES";
    if (min >= hp) return "DEAD";
    return "ROLL";
  };

  if (sashHeld) modifiers.push("Focus Sash - survives one hit from full");

  if (weather) assumptions.push(`${weather} up`);
  if (attacker.stages.atk || attacker.stages.spa) {
    assumptions.push(
      `attacker ${category === "phys" ? `Atk ${fmt(attacker.stages.atk)}` : `SpA ${fmt(attacker.stages.spa)}`}`
    );
  }
  if (defender.stages.def || defender.stages.spd) {
    assumptions.push(
      `defender ${category === "phys" ? `Def ${fmt(defender.stages.def)}` : `SpD ${fmt(defender.stages.spd)}`}`
    );
  }
  if (built.move.spread) assumptions.push("spread x0.75");
  if (aProf.inferred) {
    caveats.push(`${aProf.displayName}'s pre-Mega ability is inferred, not from the data files.`);
  }

  return {
    moveName,
    resolvedType: built.resolvedType,
    power: built.move.power,
    hits,
    category,
    spread: Boolean(built.move.spread),
    min,
    max,
    typeMult: result.typeMult,
    minPct: pct(min, defender.maxHP),
    maxPct: pct(max, defender.maxHP),
    minPctCur: pct(min, curHP),
    maxPctCur: pct(max, curHP),
    verdictFull: verdictAt(defender.maxHP),
    verdict: verdictAt(curHP),
    koChance,
    hitsToKObest: max > 0 ? Math.ceil(curHP / max) : Infinity,
    hitsToKOworst: min > 0 ? Math.ceil(curHP / min) : Infinity,
    defenderMaxHP: defender.maxHP,
    defenderCurHP: curHP,
    modifiers,
    caveats,
    assumptions,
  };
}

export const VERDICT_LABEL: Record<Verdict, string> = {
  IMMUNE: "IMMUNE",
  LIVES: "LIVES",
  SASH: "LIVES (Sash)",
  ROLL: "ROLL",
  DEAD: "DEAD",
};
