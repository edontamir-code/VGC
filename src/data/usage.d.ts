// Type declarations for src/data/usage.js — the full usage distribution.
export interface SpeciesUsage {
  moves: Record<string, number>;
  items: Record<string, number>;
  abilities: Record<string, number>;
  natures: Record<string, number>;
  note?: string;
}

export interface LikelyOption {
  name: string;
  pct: number;
}

export const INCLUSION_CUTOFF: number;
export const USAGE: Record<string, SpeciesUsage>;
export function likely(
  record: Record<string, number> | undefined,
  cutoff?: number
): LikelyOption[];
export function usageFor(speciesId: string): SpeciesUsage | null;
