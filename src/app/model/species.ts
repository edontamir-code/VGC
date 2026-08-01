// ===========================================================================
// The species catalogue: everything you can put on a team.
//
// Built from the threat database plus any species that only exists in team.js.
// A threat entry wins when both have the same species, because that is the
// COMMON set - the right starting point for someone who is not Edon.
// ===========================================================================
import { TEAM } from "../../data/team.js";
import { THREATS } from "../../data/threats.js";
import { setFromTeam, setFromThreat } from "./factory.ts";
import type { MonSet } from "./types.ts";

export interface SpeciesEntry {
  id: string;
  name: string;
  types: string[];
  source: "threat" | "team";
  /** A fresh, editable copy of the default set. */
  make: () => MonSet;
}

function speciesKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const catalogue: SpeciesEntry[] = [];
const seen = new Set<string>();

for (const t of THREATS) {
  catalogue.push({
    id: t.id,
    name: t.name,
    types: [...t.types],
    source: "threat",
    make: () => setFromThreat(t),
  });
  seen.add(speciesKey(t.id));
  seen.add(speciesKey(t.name.replace(/^Mega\s+/i, "")));
}

// Species that only exist on the built-in team (Glimmora, Delphox, ...).
for (const m of TEAM) {
  const key = speciesKey(m.name);
  if (seen.has(key)) continue;
  catalogue.push({
    id: `team-${m.name.toLowerCase()}`,
    name: m.mega ?? m.name,
    types: [...m.types],
    source: "team",
    make: () => setFromTeam(m),
  });
  seen.add(key);
}

catalogue.sort((a, b) => a.name.localeCompare(b.name));

export const SPECIES: SpeciesEntry[] = catalogue;

export function findSpecies(id: string): SpeciesEntry | null {
  return SPECIES.find((s) => s.id === id) ?? null;
}

/** The built-in team, as editable sets. */
export function builtInTeam(): MonSet[] {
  return TEAM.map((m) => setFromTeam(m));
}
