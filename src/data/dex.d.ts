// Type declarations for src/data/dex.js — the full Champions species dex.
import type { BaseStats, StatKey } from "../engine.js";

export interface DexEntry {
  name: string;
  types: string[];
  base: BaseStats;
}

export const DEX: DexEntry[];
export const DEX_SIZE: number;
export const OVERRIDES: Record<string, Partial<Record<StatKey, number>>>;

export function dexEntry(name: string): DexEntry | null;
export function megaOf(name: string): DexEntry | null;
export function baseFormOf(megaName: string): DexEntry | null;
