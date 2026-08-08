// ===========================================================================
// One box that drives the whole game.
//
// The tool had a text parser for turns and then made you click for everything
// else: a separate field for their six, a drawer with "Move to slot 2" to set
// leads, and the advice off in other panels. Under a real timer that is not one
// tool, it is four, and you are switching between them at the worst moment.
//
// So: a single command line that knows what PHASE the game is in and reads what
// you type accordingly.
//
//   no opponent yet   -> a list of names is their six
//   roster known      -> "they lead whims and incin" / "we lead staraptor arc"
//   both leads out    -> a turn script, as before
//
// Explicit intent always beats the phase guess. "they lead X" sets their leads
// whenever you type it, including mid-game after a KO, because saying what
// happened should never depend on which screen you are looking at.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import type { Action } from "../state/reducer.ts";
import { parseRoster } from "./parseRoster.ts";
import { parseTurn } from "./parseTurn.ts";
import type { ParsedTurn } from "./parseTurn.ts";
import { bestMatch, ME_WORDS, THEM_WORDS } from "./match.ts";
import { makeMonState } from "../model/factory.ts";
import { activeProfile } from "../battle/stats.ts";

export type Phase = "roster" | "leads" | "turn";

const nameOf = (m: MonState) => activeProfile(m).displayName;

/** What the tool is waiting for. */
export function phaseOf(state: BattleState): Phase {
  const theirs = Object.values(state.mons).filter((m) => m.side === "opp");
  if (theirs.length === 0) return "roster";
  const theirActive = state.sides.opp.active.filter(Boolean).length;
  const myActive = state.sides.me.active.filter(Boolean).length;
  if (theirActive === 0 || myActive === 0) return "leads";
  return "turn";
}

export const PHASE_PROMPT: Record<Phase, string> = {
  roster: "Type their six from team preview: zard, incin, gambit, chomp, bascu, whims",
  leads: "Who led? e.g. \"they lead whims and incin\" then \"we lead staraptor and arcanine\"",
  turn: "Type the turn as it happened: chomp eq, zard heat wave, whims tailwind",
};

export type CommandKind = "roster" | "leads" | "turn" | "empty" | "error";

export interface CommandResult {
  kind: CommandKind;
  /** Dispatch these in order. */
  actions: Action[];
  /** What the tool understood, echoed back so a misread is obvious. */
  echo: string;
  problems: string[];
  /** The parsed turn, when this was one - the caller needs it for the log. */
  turn: ParsedTurn | null;
  /** Phase the tool will be in after these actions land. */
  nextPhase: Phase;
}

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

const LEAD_VERB = /\b(leads?|led|leading|opens?|opened|starts?|started|sends? out|sent out|out)\b/i;

/** "they lead X and Y" -> "opp"; "we lead X and Y" -> "me"; else null. */
function leadSide(text: string): SideId | null {
  if (!LEAD_VERB.test(text)) return null;
  // Only look at words BEFORE the verb - "we lead X into their Whimsicott"
  // is still about my leads.
  const head = text.slice(0, text.search(LEAD_VERB)).toLowerCase();
  const words = head.split(/[^a-z]+/).filter(Boolean);
  for (const w of words) {
    if (THEM_WORDS.has(w)) return "opp";
    if (ME_WORDS.has(w)) return "me";
  }
  return null;
}

/**
 * Split "they lead whims, incin, I lead raichu, staraptor" into its two
 * statements.
 *
 * Both leads are one thought, so people type them as one line - and the
 * comma between them is the same comma that separates the names, so there is
 * no way to segment on punctuation. What actually marks a new statement is a
 * SIDE WORD followed by a lead verb.
 *
 * Without this, the first verb won the whole line: "they lead" claimed
 * everything after it, "I lead raichu" was read as a Pokemon name that did not
 * match anything, and your side silently stayed empty.
 *
 * Returns null unless there are at least two statements, so the ordinary
 * one-statement path is untouched.
 */
const SIDE_WORDS_SRC =
  "i|me|my|mine|we|us|our|he|she|they|him|her|them|opp|opponent|his|their|theirs|enemy|foe";
const LEAD_VERB_SRC =
  "leads?|led|leading|opens?|opened|starts?|started|sends? out|sent out";

function splitLeadStatements(text: string): string[] | null {
  // A side word, then a lead verb within a word or two ("they lead",
  // "he sent out", "I am leading").
  const re = new RegExp(
    `\\b(?:${SIDE_WORDS_SRC})\\b(?:\\s+\\w+){0,2}?\\s+(?:${LEAD_VERB_SRC})\\b`,
    "gi"
  );
  const starts: number[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index !== undefined) starts.push(m.index);
  }
  if (starts.length < 2) return null;

  const out: string[] = [];
  for (let i = 0; i < starts.length; i++) {
    const seg = text.slice(starts[i], starts[i + 1] ?? text.length).trim();
    // Trailing separators left behind by the cut.
    const cleaned = seg.replace(/[\s,;+&/]+$/, "");
    if (cleaned) out.push(cleaned);
  }
  return out.length >= 2 ? out : null;
}

/** Strip the side word and the verb, leaving just the names. */
function leadNames(text: string): string[] {
  const m = text.search(LEAD_VERB);
  const tail = m >= 0 ? text.slice(m).replace(LEAD_VERB, " ") : text;
  return tail
    .split(/[,+&/]|\band\b|\bwith\b|\bplus\b/i)
    // Filler words that survive the verb strip - "my lead IS raichu", "they
    // lead WITH the whimsicott". Left attached they turn a clean name into a
    // fuzzy match against "is raichu", which quietly loses the Pokemon.
    .map((s) => s.trim().replace(/^(?:is|are|was|were|be|the|a|an|of|out|into)\b\s*/i, "").trim())
    .filter((s) => s.length > 0 && !/^(with|and|the|a|out|into|vs|against)$/i.test(s));
}

/** A bare list of names, no verbs - "zard, incin, chomp". */
function looksLikeNameList(text: string, state: BattleState): boolean {
  const parts = text.split(/[,+&/]|\band\b/i).map((s) => s.trim()).filter(Boolean);
  if (parts.length < 2) return false;
  // Any part that resolves to a move on the board makes this a turn, not a list.
  const turn = parseTurn(text, state);
  return !turn.entries.some((e) => e.moveName && e.action);
}

// ---------------------------------------------------------------------------

function setLeads(
  state: BattleState,
  side: SideId,
  names: string[]
): { actions: Action[]; echo: string; problems: string[] } {
  const pool = Object.values(state.mons).filter((m) => m.side === side && !m.fainted);
  const actions: Action[] = [];
  const chosen: MonState[] = [];
  const problems: string[] = [];

  for (const raw of names.slice(0, 2)) {
    const hit = bestMatch(raw, pool.filter((m) => !chosen.includes(m)), nameOf, 45);
    if (!hit) {
      problems.push(
        side === "opp"
          ? `"${raw}" is not on their roster - add it first, or check the spelling.`
          : `"${raw}" is not on your team.`
      );
      continue;
    }
    chosen.push(hit.value);
  }

  chosen.forEach((m, slot) => {
    actions.push({ type: "SWITCH_IN", side, slot, uid: m.uid });
  });

  const who = side === "opp" ? "They" : "You";
  return {
    actions,
    echo: chosen.length
      ? `${who} lead ${chosen.map(nameOf).join(" + ")}.`
      : `${who} lead: could not identify anyone.`,
    problems,
  };
}

/**
 * Read one line from the command box and say what should happen.
 *
 * Nothing is dispatched here - the caller does that - so this stays a pure
 * function and is testable without a React tree.
 */
export function runCommand(text: string, state: BattleState): CommandResult {
  const trimmed = text.trim();
  const phase = phaseOf(state);
  const empty: CommandResult = {
    kind: "empty", actions: [], echo: "", problems: [], turn: null, nextPhase: phase,
  };
  if (!trimmed) return empty;

  // --- both sides' leads in one line ---------------------------------------
  //
  // Each statement is scored against the SAME state, which is safe here
  // precisely because the two touch different sides: setLeads only ever reads
  // and switches in mons belonging to the side it was given. Anything that
  // needed the first statement's result would have to thread state through,
  // and that is deliberately not attempted - a segment that is not a lead
  // statement falls through to the normal one-command path below.
  const segments = splitLeadStatements(trimmed);
  if (segments) {
    const sides = segments.map(leadSide);
    if (sides.every((s): s is SideId => s !== null) && new Set(sides).size === segments.length) {
      const actions: Action[] = [];
      const echoes: string[] = [];
      const problems: string[] = [];
      segments.forEach((seg, i) => {
        const r = setLeads(state, sides[i]!, leadNames(seg));
        actions.push(...r.actions);
        echoes.push(r.echo);
        problems.push(...r.problems);
      });
      return {
        kind: actions.length ? "leads" : "error",
        actions,
        echo: echoes.join(" "),
        problems,
        turn: null,
        nextPhase: phase === "roster" ? "leads" : phase,
      };
    }
  }

  // --- explicit leads, in any phase ---------------------------------------
  const explicit = leadSide(trimmed);
  if (explicit) {
    const r = setLeads(state, explicit, leadNames(trimmed));
    return {
      kind: r.actions.length ? "leads" : "error",
      actions: r.actions,
      echo: r.echo,
      problems: r.problems,
      turn: null,
      nextPhase: phase === "roster" ? "leads" : phase,
    };
  }

  // --- their six ------------------------------------------------------------
  if (phase === "roster" && looksLikeNameList(trimmed, state)) {
    const parsed = parseRoster(trimmed);
    const mons = parsed.entries
      .filter((e) => e.species)
      .map((e) => makeMonState(e.species!.make(), "opp", "threat"));
    if (mons.length === 0) {
      return {
        kind: "error", actions: [], echo: "",
        problems: [`Could not recognise any Pokemon in "${trimmed}".`],
        turn: null, nextPhase: "roster",
      };
    }
    return {
      kind: "roster",
      actions: [{ type: "ADD_ROSTER", side: "opp", mons }],
      echo: `Their team: ${mons.map((m) => m.set.name).join(", ")}.`,
      problems: parsed.unknown.length
        ? [`Did not recognise: ${parsed.unknown.join(", ")}.`]
        : [],
      turn: null,
      nextPhase: "leads",
    };
  }

  // --- a bare pair during the lead phase -----------------------------------
  // "whims and incin" with their side not yet out means their leads; if theirs
  // are already out it means mine.
  if (phase === "leads" && looksLikeNameList(trimmed, state)) {
    const side: SideId =
      state.sides.opp.active.filter(Boolean).length === 0 ? "opp" : "me";
    const r = setLeads(state, side, leadNames(trimmed));
    return {
      kind: r.actions.length ? "leads" : "error",
      actions: r.actions,
      echo: r.echo,
      problems: r.problems,
      turn: null,
      nextPhase: "leads",
    };
  }

  // --- otherwise it is a turn ----------------------------------------------
  const turn = parseTurn(trimmed, state);
  const usable = turn.entries.filter((e) => e.actorUid && e.action);
  if (usable.length === 0 && turn.effects.length === 0) {
    return {
      kind: "error",
      actions: [],
      echo: "",
      problems: turn.entries.map((e) => e.problem).filter((p): p is string => Boolean(p)).length
        ? turn.entries.map((e) => e.problem).filter((p): p is string => Boolean(p))
        : [`Could not read "${trimmed}" as a turn. ${PHASE_PROMPT[phase]}`],
      turn,
      nextPhase: phase,
    };
  }

  return {
    kind: "turn",
    actions: [
      {
        type: "APPLY_TURN_SCRIPT",
        entries: turn.entries.map((e) => ({
          actorUid: e.actorUid,
          moveName: e.moveName,
          action: e.action,
          raw: e.raw,
          problem: e.problem,
        })),
        effects: turn.effects.map((f) =>
          f.kind === "faint"
            ? ({ kind: "faint", uid: f.uid } as const)
            : ({ kind: "hp", uid: f.uid, pct: f.pct, exact: f.exact } as const)
        ),
        script: trimmed,
      },
    ],
    // The echo has to cover a health-only line too. "chomp to 63%" applied
    // correctly but echoed nothing, so the only feedback was an empty reply -
    // indistinguishable from the input being ignored, which it previously was.
    echo: [
      ...usable.map((e) => {
        const m = state.mons[e.actorUid!];
        // activeProfile, not set.name: a stone holder that is not this battle's
        // Mega must not be echoed back as its Mega form.
        return `${m ? nameOf(m) : "?"}: ${e.moveName ?? "?"}`;
      }),
      ...turn.effects.map((f) => {
        const m = state.mons[f.uid];
        const who = m ? nameOf(m) : "?";
        if (f.kind === "faint") return `${who} fainted`;
        return `${who} -> ${f.pct !== undefined ? `${f.pct}%` : `${f.exact} HP`}`;
      }),
    ].join(" | "),
    problems: turn.entries
      .filter((e) => e.problem)
      .map((e) => `"${e.raw.trim()}": ${e.problem}`),
    turn,
    nextPhase: "turn",
  };
}
