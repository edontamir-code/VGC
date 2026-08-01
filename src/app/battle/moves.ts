// ===========================================================================
// Assembling the move record handed to `matchup`.
// The engine owns the damage math; this file only decides POWER, TYPE and the
// catch-all `otherMult` that the engine already accepts as inputs.
// ===========================================================================
import { MOVES, movePower } from "../../data/moves.js";
import type { MoveData } from "../../data/moves.js";
import type { MatchupMove, WeatherKind } from "../../engine.js";
import type { BattleState, MonState } from "../model/types.ts";
import { activeProfile } from "./stats.ts";
import { STATUS_MOVES } from "./statusMoves.ts";
import { terrainDamageMult } from "./terrain.ts";

/**
 * The type a move actually lands as.
 *
 * MIRRORS engine.js:134-142 (Weather Ball, then Pixilate). It is duplicated
 * here ONLY because `matchup` returns a damage result without telling us the
 * resolved type, and we need that type to decide whether a defensive berry
 * (Occa/Chople) triggers and to label the UI. If engine.js:134-142 ever
 * changes, change this with it. The damage itself still comes from the engine.
 */
export function resolveMoveType(
  move: MoveData,
  attackerAbility: string,
  weather: WeatherKind | null
): string {
  let type = move.type;
  if (move.weatherBall) {
    const map: Record<WeatherKind, string> = {
      sun: "Fire", rain: "Water", sand: "Rock", snow: "Ice",
    };
    type = weather && map[weather] ? map[weather] : "Normal";
  }
  if (attackerAbility === "Pixilate" && type === "Normal") type = "Fairy";
  return type;
}

/**
 * Base power after Weather Ball / Last-Respects style scaling.
 * The engine recomputes Weather Ball's power itself (engine.js:138); we mirror
 * it here only so the UI can SHOW the right BP.
 */
export function resolvePower(
  move: MoveData,
  faintedAlliesCount: number,
  weather: WeatherKind | null
): number {
  if (move.weatherBall) return weather ? 100 : 50;
  return movePower(move, { faintedAllies: faintedAlliesCount });
}

/** Moves that strike more than once. Not represented in moves.js. */
export const HIT_COUNTS: Record<string, number> = {
  "Dual Wingbeat": 2,
};

/** Moves whose real behaviour the engine does not model. Surfaced, never hidden. */
export const MOVE_CAVEATS: Record<string, string> = {
  "Electro Shot": "Charges for a turn unless it is raining.",
  "Low Kick": "Power scales with target weight - not modelled; treated as 60 BP.",
  "Sucker Punch": "Fails if the target is not attacking this turn.",
  "Make It Rain": "Lowers the user's SpA after use.",
  "Dual Wingbeat": "Hits twice - range is the sum of two independent rolls.",
};

export function getMoveData(name: string): MoveData | null {
  return MOVES[name] ?? null;
}

/**
 * Priority bracket for a move IN THE HANDS OF A SPECIFIC MON.
 *
 * Prankster gives non-damaging moves +1, which is not a detail: it is why a
 * Whimsicott's Tailwind or Encore goes before almost anything on the field, and
 * getting it wrong would invalidate every plan built around out-speeding it.
 */
export function effectivePriority(moveName: string, mon: MonState): number {
  const data = MOVES[moveName];
  let p = data?.priority ?? STATUS_MOVES[moveName]?.priority ?? 0;
  if (!data && activeProfile(mon).ability === "Prankster") p += 1;
  return p;
}

/** How many allies on this side have fainted (Last Respects / Supreme Overlord). */
export function faintedAllies(state: BattleState, side: MonState["side"]): number {
  return Object.values(state.mons).filter(
    (m) => m.side === side && m.fainted
  ).length;
}

export interface BuiltMove {
  move: MatchupMove;
  resolvedType: string;
  hits: number;
  /** Human-readable list of every modifier this build applied. */
  modifiers: string[];
  caveats: string[];
}

export interface BuildMoveOpts {
  helpingHand?: boolean;
}

/**
 * Build the `matchup` move argument for a specific attacker/defender pair.
 * Everything is expressed through power / otherMult, which the engine already
 * supports - no engine change is needed for any of it.
 */
export function buildMove(
  moveName: string,
  attacker: MonState,
  defender: MonState,
  state: BattleState,
  opts: BuildMoveOpts = {}
): BuiltMove | null {
  const data = getMoveData(moveName);
  if (!data) return null;

  const atkProfile = activeProfile(attacker);
  const weather = state.field.weather?.kind ?? null;
  const resolvedType = resolveMoveType(data, atkProfile.ability, weather);
  const allies = faintedAllies(state, attacker.side);

  const modifiers: string[] = [];
  const caveats: string[] = [];

  const power = resolvePower(data, allies, weather);
  if (data.scaling === "last_respects" && allies > 0) {
    modifiers.push(`Last Respects ${power} BP (${allies} fainted ally/allies)`);
  }

  let otherMult = data.otherMult ?? 1.0;

  // Supreme Overlord: +10% per fainted ally. Only when the set actually lists it
  // (threats.js ships Kingambit with Defiant - the ability field is editable).
  if (atkProfile.ability === "Supreme Overlord" && allies > 0) {
    otherMult *= 1 + 0.1 * allies;
    modifiers.push(`Supreme Overlord x${(1 + 0.1 * allies).toFixed(1)} (${allies} fainted)`);
  }

  // Knock Off: x1.5 into a target still holding a removable item.
  if (moveName === "Knock Off" && defender.itemActive && defender.set.item) {
    otherMult *= 1.5;
    modifiers.push("Knock Off x1.5 (target still holds an item)");
  }

  if (opts.helpingHand) {
    otherMult *= 1.5;
    modifiers.push("Helping Hand x1.5");
  }

  // Terrain, expressed through the engine's existing otherMult input.
  const terr = terrainDamageMult(state, attacker, defender, resolvedType, moveName);
  if (terr.mult !== 1) {
    otherMult *= terr.mult;
    if (terr.label) modifiers.push(terr.label);
  }

  // NOTE: the defender's Occa/Chople berry is NOT applied here. It depends on
  // the hit being super-effective, which is only known from the engine's
  // typeMult - damage.ts applies it on a second pass.

  if (MOVE_CAVEATS[moveName]) caveats.push(MOVE_CAVEATS[moveName]);

  const hits = HIT_COUNTS[moveName] ?? 1;

  return {
    move: { ...data, name: moveName, power, otherMult },
    resolvedType,
    hits,
    modifiers,
    caveats,
  };
}
