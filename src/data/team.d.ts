// Type declarations for src/data/team.js — Edon's 6 mons, spreads decoded from the
// in-game stat screen (each sums to 66 SP).
import type { BaseStats, SPSpread, Nature, WeatherKind } from "../engine.js";

/** Defensive berry that halves one hit (Occa/Chople). */
export interface BerrySpec {
  type: string;
  superEffOnly?: boolean;
  mult: number;
}

export interface TeamMon {
  name: string;
  /** Display name once Mega-evolved, if this mon Megas. */
  mega?: string;
  types: string[];
  /** In-battle base stats (the MEGA form's, for the two Mega mons). */
  base: BaseStats;
  /** Pre-Mega base stats, kept for reference. */
  baseForm?: BaseStats;
  sp: SPSpread;
  nature: Nature;
  item: string;
  ability: string;
  immuneTypes?: string[];
  berry?: BerrySpec;
  setsWeather?: WeatherKind | null;
  moves: string[];
  movePool?: string[];
  note?: string;
}

export const TEAM: TeamMon[];
