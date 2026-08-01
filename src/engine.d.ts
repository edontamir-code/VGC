// Type declarations for the VERIFIED engine (src/engine.js).
// These describe the existing JS — they do not change its behaviour.
// If you edit engine.js, update this file to match; never the other way round.

export type StatKey = "hp" | "atk" | "def" | "spa" | "spd" | "spe";
export type BattleStatKey = Exclude<StatKey, "hp">;

/** A full computed stat line at L50. */
export interface Stats {
  hp: number; atk: number; def: number; spa: number; spd: number; spe: number;
}

/** Base stats of a species (or of its Mega form, where the set Megas). */
export type BaseStats = Stats;

/** Stat Points: 0-32 per stat, 66 total. Sparse in the data files. */
export type SPSpread = Partial<Record<StatKey, number>>;

/** Nature as a +stat / -stat pair (1.1 / 0.9); omitted keys are neutral. */
export interface Nature { plus?: BattleStatKey; minus?: BattleStatKey }

export type MoveCategory = "phys" | "spec";
export type WeatherKind = "sun" | "rain" | "sand" | "snow";

export function statHP(base: number, sp: number): number;
export function statOther(base: number, sp: number, nat: number): number;
export function natureMults(
  plus?: string,
  minus?: string
): Record<BattleStatKey, number>;
export function computeStats(base: BaseStats, sp: SPSpread, nature?: Nature): Stats;
export function pokeRound(x: number): number;

export interface DamageResult {
  min: number;
  max: number;
  minPct: number;
  maxPct: number;
  typeMult: number;
  koChance: string;
}

export interface CalcDamageArgs {
  power: number;
  moveType: string;
  category: MoveCategory;
  attackerTypes: string[];
  defenderTypes: string[];
  attackStat: number;
  defStat: number;
  defHP: number;
  spread?: boolean;
  weather?: WeatherKind | null;
  stabMult?: number;
  hasSTAB?: boolean | null;
  lifeOrb?: boolean;
  toughClaws?: boolean;
  screen?: boolean;
  singles?: boolean;
  otherMult?: number;
  immune?: boolean;
}

export function calcDamage(args: CalcDamageArgs): DamageResult;

export const ITEM_TYPE_BOOST: Record<string, string>;

/** Attacker/defender record accepted by `matchup`. */
export interface MatchupMon {
  types: string[];
  base?: BaseStats;
  sp?: SPSpread;
  nature?: Nature;
  /** Pre-computed stats. When present, `matchup` uses these instead of base/sp/nature. */
  stats?: Stats;
  item?: string;
  ability?: string;
  setsWeather?: WeatherKind | null;
  immuneTypes?: string[];
}

/** Move record accepted by `matchup`. */
export interface MatchupMove {
  type: string;
  category: MoveCategory;
  power: number;
  spread?: boolean;
  contact?: boolean;
  priority?: number;
  weatherBall?: boolean;
  otherMult?: number;
  name?: string;
}

/** Field knobs `matchup` reads. */
export interface MatchupField {
  weather?: WeatherKind | null;
  screen?: boolean;
  singles?: boolean;
  /** Multiplies the attacking stat: Intimidate 0.667, burn 0.5, Swords Dance 2.0, ... */
  atkMult?: number;
}

export function matchup(
  attacker: MatchupMon,
  defender: MatchupMon,
  move: MatchupMove,
  field?: MatchupField
): DamageResult;
