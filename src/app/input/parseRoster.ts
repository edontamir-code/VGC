// ===========================================================================
// Team preview, typed at speed: "zard, incin, gambit, chomp, bascu, whims".
// Same fuzzy matching as the turn parser, aimed at the threat database.
// ===========================================================================
import { THREATS } from "../../data/threats.js";
import type { ThreatMon } from "../../data/threats.js";
import { allMatches, norm } from "./match.ts";
import { splitSegments } from "./parseTurn.ts";

export interface RosterEntry {
  raw: string;
  threat: ThreatMon | null;
  /** Other database entries the text could have meant. */
  alternatives: ThreatMon[];
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
    const matches = allMatches(raw, THREATS, (t) => t.name, 45).filter(
      (m) => !taken.has(m.value.id)
    );
    // Also try matching the id, so "charizard-y" works.
    const byId = THREATS.filter(
      (t) => !taken.has(t.id) && norm(t.id).startsWith(norm(raw))
    );

    const best = matches[0]?.value ?? byId[0] ?? null;
    if (best) {
      taken.add(best.id);
      entries.push({
        raw,
        threat: best,
        alternatives: matches.slice(1, 4).map((m) => m.value),
        problem: null,
      });
    } else {
      unknown.push(raw);
      entries.push({
        raw,
        threat: null,
        alternatives: [],
        problem: "not in the database",
      });
    }
  }

  return { entries, matched: entries.filter((e) => e.threat).length, unknown };
}
