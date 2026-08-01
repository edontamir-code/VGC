// Type declarations for src/data/threats.js — common Reg M-B sets for auto-populate.
import type { BaseStats, SPSpread, Nature, WeatherKind } from "../engine.js";
import type { BerrySpec } from "./team.js";

/**
 * Confidence in the DATA, not in what the opponent is actually running:
 *   "high" = species/set well-established
 *   "std"  = spread is the standard competitive convention, NOT a scraped exact
 *            spread — verify for tight calcs.
 */
export type DataConfidence = "high" | "std";

export interface ThreatMon {
  id: string;
  name: string;
  types: string[];
  /** In-battle base stats (Mega form where the set Megas). */
  base: BaseStats;
  /** Pre-Mega base stats, when this set Mega Evolves. */
  baseForm?: BaseStats;
  sp: SPSpread;
  nature: Nature;
  item: string;
  ability: string;
  setsWeather?: WeatherKind;
  immuneTypes?: string[];
  berry?: BerrySpec;
  /** The four moves assumed by default. */
  moves: string[];
  /** Everything the species commonly runs; they bring four of these. */
  movePool?: string[];
  defaultMove?: string;
  conf?: DataConfidence;
  note?: string;
}

export const THREATS: ThreatMon[];
