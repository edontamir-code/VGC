// ===========================================================================
// Team preview, typed at speed: "zard, incin, gambit, chomp, bascu, whims".
// Same fuzzy matching as the turn parser, aimed at the threat database.
// ===========================================================================
import { SPECIES } from "../model/species.ts";
import type { SpeciesEntry } from "../model/species.ts";
import { allMatches, norm } from "./match.ts";
import { splitSegments } from "./parseTurn.ts";

export interface RosterEntry {
  raw: string;
  species: SpeciesEntry | null;
  /** Other database entries the text could have meant. */
  alternatives: SpeciesEntry[];
  /** True when the match has no competitive set, only stats. */
  statsOnly: boolean;
  problem: string | null;
}

export interface ParsedRoster {
  entries: RosterEntry[];
  matched: number;
  /** Names we could not find - these need adding to the database. */
  unknown: string[];
}

export function parseRoster(text: string): ParsedRoster {
  const segments = splitSegments(text)
    .flatMap((s) => s.split(/\s{2,}/))
    .map((s) => s.trim())
    .filter(Boolean);

  const entries: RosterEntry[] = [];
  const unknown: string[] = [];
  const taken = new Set<string>();

  for (const raw of segments) {
    if (!norm(raw)) continue;
    // Species with a real competitive set are preferred over stats-only dex
    // entries, so "chomp" lands on the curated Garchomp, not a bare one.
    const matches = allMatches(raw, SPECIES, (s) => s.name, 45)
      .filter((m) => !taken.has(m.value.id))
      .sort((a, b) => {
        const rank = (s: SpeciesEntry) => (s.source === "dex" ? 1 : 0);
        return rank(a.value) - rank(b.value) || b.score - a.score;
      });
    const byId = SPECIES.filter(
      (s) => !taken.has(s.id) && norm(s.id).startsWith(norm(raw))
    );

    const best = matches[0]?.value ?? byId[0] ?? null;
    if (best) {
      taken.add(best.id);
      entries.push({
        raw,
        species: best,
        alternatives: matches.slice(1, 4).map((m) => m.value),
        statsOnly: best.source === "dex",
        problem: null,
      });
    } else {
      unknown.push(raw);
      entries.push({
        raw,
        species: null,
        alternatives: [],
        statsOnly: false,
        problem: "not a legal Pokemon in this format",
      });
    }
  }

  return { entries, matched: entries.filter((e) => e.species).length, unknown };
}
