// ===========================================================================
// The species catalogue: everything you can put on a team.
//
// Built from the threat database plus any species that only exists in team.js.
// A threat entry wins when both have the same species, because that is the
// COMMON set - the right starting point for someone who is not Edon.
// ===========================================================================
import { TEAM } from "../../data/team.js";
import { THREATS } from "../../data/threats.js";
import { DEX, baseFormOf } from "../../data/dex.js";
import { setFromTeam, setFromThreat } from "./factory.ts";
import type { MonSet } from "./types.ts";

export interface SpeciesEntry {
  id: string;
  name: string;
  types: string[];
  /** "threat" and "team" have real sets; "dex" is stats-only. */
  source: "threat" | "team" | "dex";
  /** A fresh, editable copy of the default set. */
  make: () => MonSet;
}

function speciesKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const catalogue: SpeciesEntry[] = [];
const seen = new Set<string>();

// Dedup is on the FULL name. "Gengar" and "Mega Gengar" are different
// Pokemon with different stats, so stripping the prefix would silently drop
// every Mega whose base form was already listed.
for (const t of THREATS) {
  catalogue.push({
    id: t.id,
    name: t.name,
    types: [...t.types],
    source: "threat",
    make: () => setFromThreat(t),
  });
  seen.add(speciesKey(t.id));
  seen.add(speciesKey(t.name));
}

// Species that only exist on the built-in team (Glimmora, Delphox, ...).
for (const m of TEAM) {
  const key = speciesKey(m.mega ?? m.name);
  if (seen.has(key) || seen.has(speciesKey(m.name))) continue;
  catalogue.push({
    id: `team-${m.name.toLowerCase()}`,
    name: m.mega ?? m.name,
    types: [...m.types],
    source: "team",
    make: () => setFromTeam(m),
  });
  seen.add(key);
}

// Everything else that is legal in the format. These have no competitive set,
// so they come in with a neutral, legal 66-SP spread you then edit. Without
// this, team preview simply could not represent most opponents.
for (const d of DEX) {
  if (seen.has(speciesKey(d.name))) continue;
  const pre = baseFormOf(d.name);
  catalogue.push({
    id: `dex-${speciesKey(d.name)}`,
    name: d.name,
    types: [...d.types],
    source: "dex",
    make: (): MonSet => ({
      speciesId: `dex-${speciesKey(d.name)}`,
      name: d.name,
      types: [...d.types],
      base: { ...d.base },
      baseForm: pre ? { ...pre.base } : undefined,
      megaName: pre ? d.name : undefined,
      // A neutral, legal spread. Totals 66 and caps at 32, so it is always a
      // valid build - but it is a PLACEHOLDER, not observed usage.
      sp: { hp: 22, atk: 0, def: 11, spa: 0, spd: 11, spe: 22 },
      nature: {},
      item: "",
      ability: "",
      moves: [],
      movePool: [],
      note: "No competitive set on file - spread, item, ability and moves are placeholders. Fill them in as you scout.",
      dataConf: "std",
    }),
  });
  seen.add(speciesKey(d.name));
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
