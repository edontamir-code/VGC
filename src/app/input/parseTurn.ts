// ===========================================================================
// Turn scripting: type what happened, in order, and get a structured turn.
//
//   "I protect, he protects, he tailwinds"
//   "chomp eq, gambit sucker on whims, whims tw, incin fo chomp"
//   "1 protect / 2 heat wave / 3 fake out on glim / 4 moonblast"
//
// THE ORDER IS DATA. What you type first resolved first, which is a direct
// observation of the speed order - see speedInference.ts.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { activeMons } from "../battle/resolver.ts";
import { getMoveData } from "../battle/moves.ts";
import { STATUS_MOVES } from "../battle/statusMoves.ts";
import { scout } from "../battle/scouting.ts";
import type { Action } from "../sim/actions.ts";
import {
  ME_WORDS, THEM_WORDS, allMatches, bestMatch, norm, resolveMoveName, MOVE_ALIASES, VERB_FORMS,
} from "./match.ts";

export interface ParsedEntry {
  /** 1-based position in the order the user typed. */
  index: number;
  raw: string;
  actorUid: string | null;
  actorName: string;
  action: Action | null;
  moveName: string | null;
  targetUid: string | null;
  targetName: string | null;
  /** Set when we could not pin something down. */
  problem: string | null;
  /** Other mons the actor phrase could have meant. */
  actorAmbiguity: { uid: string; name: string }[];
}

/**
 * Something you observed that is not an action: an HP reading or a faint.
 * These are applied AFTER the simulation, because what you saw on screen beats
 * whatever roll the simulator picked.
 */
export type ParsedEffect =
  | { kind: "hp"; uid: string; name: string; pct?: number; exact?: number; raw: string }
  | { kind: "faint"; uid: string; name: string; raw: string };

export interface ParsedTurn {
  entries: ParsedEntry[];
  /** HP readings and faints, in the order given. */
  effects: ParsedEffect[];
  /** True when every entry resolved to a concrete actor and action. */
  complete: boolean;
  problems: string[];
}

const FAINT_WORDS = /^(faint|faints|fainted|died|dies|die|dead|ko|kod|koed|ko'd|killed|down|gone)$/i;
const KO_VERB = /^(ko|kod|koed|ko'd|killed|kill|kills)$/i;

/**
 * Try to read a segment as an HP reading or a faint rather than an action.
 * Returns null when it is not one.
 */
function parseEffect(words: string[], raw: string, everyone: MonState[]): ParsedEffect | null {
  if (words.length === 0) return null;
  const clean = words.filter((w) => !/^(is|was|at|on|to|now|has|with|and)$/i.test(w));
  if (clean.length === 0) return null;

  // "ko'd whims" / "killed star"
  if (KO_VERB.test(clean[0]) && clean.length > 1) {
    const t = bestMatch(clean.slice(1).join(" "), everyone, displayName, 55);
    if (t) return { kind: "faint", uid: t.value.uid, name: displayName(t.value), raw };
  }

  // "<mon> fainted"
  const last = clean[clean.length - 1];
  if (FAINT_WORDS.test(last) && clean.length > 1) {
    const t = bestMatch(clean.slice(0, -1).join(" "), everyone, displayName, 55);
    if (t) return { kind: "faint", uid: t.value.uid, name: displayName(t.value), raw };
  }

  // "<mon> 45%" / "<mon> at 45" / "<mon> 120hp"
  const numTok = clean.find((w) => /^\d+%?$|^\d+hp$/i.test(w));
  if (numTok) {
    const rest = clean.filter((w) => w !== numTok);
    if (rest.length === 0) return null;
    // Only treat as an HP reading when the remaining words are ONLY a mon name -
    // otherwise "gambit low kick" style inputs would be swallowed.
    const t = bestMatch(rest.join(" "), everyone, displayName, 60);
    if (!t) return null;
    const isPct = numTok.includes("%") || !/hp$/i.test(numTok);
    const n = Number(numTok.replace(/[^\d]/g, ""));
    if (!Number.isFinite(n)) return null;
    return isPct
      ? { kind: "hp", uid: t.value.uid, name: displayName(t.value), pct: n, raw }
      : { kind: "hp", uid: t.value.uid, name: displayName(t.value), exact: n, raw };
  }

  return null;
}

const displayName = (m: MonState) =>
  m.hasMega || !m.set.baseForm ? m.set.name : m.set.speciesId;

/** Everything this mon might plausibly have used - its pool plus all known moves. */
function candidateMoves(mon: MonState): string[] {
  const s = scout(mon);
  return [
    ...new Set([
      ...s.arsenal,
      ...mon.set.moves.filter(Boolean),
      ...(mon.set.movePool ?? []),
    ]),
  ];
}

const ALL_MOVE_NAMES = () => [
  ...new Set([
    ...Object.keys(STATUS_MOVES),
    ...Object.values(MOVE_ALIASES),
    ...Object.values(VERB_FORMS),
  ]),
];

/** Split the whole script into one segment per action. */
export function splitSegments(text: string): string[] {
  return text
    .split(/[,;\n]|\s+then\s+|\s+\/\s+|\s*\|\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

interface ResolveCtx {
  state: BattleState;
  mine: MonState[];
  theirs: MonState[];
  used: Set<string>;
}

/**
 * Work out who acted. Handles "I"/"he", species names and shorthand, and slot
 * numbers 1-4 (mine 1-2, theirs 3-4).
 */
function resolveActor(
  words: string[],
  ctx: ResolveCtx
): { uid: string | null; consumed: number; ambiguity: { uid: string; name: string }[] } {
  if (words.length === 0) return { uid: null, consumed: 0, ambiguity: [] };
  const first = norm(words[0]);

  // Slot number.
  const slots = [...ctx.mine, ...ctx.theirs];
  if (/^[1-4]$/.test(first)) {
    const idx = Number(first) - 1;
    return { uid: slots[idx]?.uid ?? null, consumed: 1, ambiguity: [] };
  }

  // Pronouns: pick a mon on that side that has not acted yet.
  const pickSide = (side: MonState[]) => {
    const free = side.filter((m) => !ctx.used.has(m.uid));
    const pool = free.length ? free : side;
    return {
      uid: pool[0]?.uid ?? null,
      ambiguity: pool.length > 1 ? pool.map((m) => ({ uid: m.uid, name: displayName(m) })) : [],
    };
  };

  if (ME_WORDS.has(first)) {
    // "my chomp" - the next word may name the mon.
    if (words.length > 1) {
      const named = bestMatch(words[1], ctx.mine, displayName, 55);
      if (named) return { uid: named.value.uid, consumed: 2, ambiguity: [] };
    }
    const r = pickSide(ctx.mine);
    return { ...r, consumed: 1 };
  }
  if (THEM_WORDS.has(first)) {
    if (words.length > 1) {
      const named = bestMatch(words[1], ctx.theirs, displayName, 55);
      if (named) return { uid: named.value.uid, consumed: 2, ambiguity: [] };
    }
    const r = pickSide(ctx.theirs);
    return { ...r, consumed: 1 };
  }

  // A species name, either side.
  const matches = allMatches(words[0], slots, displayName, 55);
  if (matches.length === 1) return { uid: matches[0].value.uid, consumed: 1, ambiguity: [] };
  if (matches.length > 1) {
    return {
      uid: matches[0].value.uid,
      consumed: 1,
      ambiguity: matches.map((m) => ({ uid: m.value.uid, name: displayName(m.value) })),
    };
  }

  return { uid: null, consumed: 0, ambiguity: [] };
}

const TARGET_PREPOSITIONS = new Set(["on", "into", "at", "to", "vs", "->", ">"]);

/** Every way a player narrates a switch. */
const SWITCH_VERB =
  /^(switch|switches|switched|switching|swap|swaps|swapped|sub|subs|subbed|in|go|goes|went|going|out|back|pivot|pivots|brought|brings|sent|sends|recall|recalls|retreat|retreats)$/;
/** Filler between the verb and the Pokemon coming in. */
const SWITCH_FILLER = new Set(["to", "for", "into", "with", "out", "in", "and", "the"]);

export function parseTurn(text: string, state: BattleState): ParsedTurn {
  const mine = activeMons(state, "me");
  const theirs = activeMons(state, "opp");
  const ctx: ResolveCtx = { state, mine, theirs, used: new Set() };
  const entries: ParsedEntry[] = [];
  const effects: ParsedEffect[] = [];
  const problems: string[] = [];
  const everyone = [...mine, ...theirs];

  splitSegments(text).forEach((raw) => {
    const words = raw.split(/\s+/).filter(Boolean);

    // HP readings and faints are observations, not actions - they must not
    // enter the ordered list, or they would corrupt the speed inference.
    const effect = parseEffect(words, raw, everyone);
    if (effect) {
      effects.push(effect);
      return;
    }

    const i = entries.length;
    const entry: ParsedEntry = {
      index: i + 1,
      raw,
      actorUid: null,
      actorName: "?",
      action: null,
      moveName: null,
      targetUid: null,
      targetName: null,
      problem: null,
      actorAmbiguity: [],
    };

    if (/^(nothing|skip|none|-)$/i.test(raw.trim())) {
      entries.push({ ...entry, problem: null, moveName: "(no action)", actorName: "-" });
      return;
    }

    const actor = resolveActor(words, ctx);
    let rest = words.slice(actor.consumed);

    if (!actor.uid) {
      entry.problem = "could not tell who acted";
      problems.push(`"${raw}": ${entry.problem}`);
      entries.push(entry);
      return;
    }
    entry.actorUid = actor.uid;
    entry.actorAmbiguity = actor.ambiguity;
    const actorMon = state.mons[actor.uid];
    entry.actorName = displayName(actorMon);
    ctx.used.add(actor.uid);

    // Target, if the user said "on X".
    let targetWords: string[] = [];
    const prepIdx = rest.findIndex((w) => TARGET_PREPOSITIONS.has(norm(w)) || w === "->");
    if (prepIdx >= 0) {
      targetWords = rest.slice(prepIdx + 1);
      rest = rest.slice(0, prepIdx);
    }

    // Switching.
    //
    // People narrate this a dozen ways mid-game - "zard out for incin", "zard
    // goes to incin", "zard -> incin" - and a script that only accepts one of
    // them is a script you stop using. The filler words after the verb ("to",
    // "for", "into", "with", "out") are dropped before matching the target.
    // "raichu megas zap cannon on chomp" / "mega raichu, zap cannon".
    //
    // Mega Evolution is a separate decision that happens BEFORE the move, so it
    // is a flag on the action rather than an action of its own. Stripped out
    // here so the rest of the phrase parses as an ordinary move.
    let megaFlag = false;
    if (rest.length && /^(mega|megas|megaevolve|mega-evolve|megaevolves)$/i.test(norm(rest[0]))) {
      megaFlag = true;
      rest = rest.slice(1);
    }

    const benchMons = state.sides[actorMon.side].bench
      .map((u) => state.mons[u])
      .filter((m): m is MonState => Boolean(m) && !m.fainted);

    // "zard -> incin" with no verb and no move. An arrow to something on your
    // OWN bench can only mean a switch; an arrow to the other side is a target.
    if (rest.length === 0 && targetWords.length > 0) {
      const own = bestMatch(targetWords.join(" "), benchMons, displayName, 45);
      if (own) {
        entry.action = { kind: "switch", toUid: own.value.uid };
        entry.moveName = `switch to ${displayName(own.value)}`;
        entries.push(entry);
        return;
      }
    }

    if (rest.length && SWITCH_VERB.test(norm(rest[0]))) {
      const tail = [...rest.slice(1), ...targetWords].filter((w) => !SWITCH_FILLER.has(norm(w)));
      const to = tail.length ? bestMatch(tail.join(" "), benchMons, displayName, 45) : null;
      if (to) {
        entry.action = { kind: "switch", toUid: to.value.uid };
        entry.moveName = `switch to ${displayName(to.value)}`;
        entries.push(entry);
        return;
      }
      entry.problem = "could not tell who they switched to";
      problems.push(`"${raw}": ${entry.problem}`);
      entries.push(entry);
      return;
    }

    // The move. With no "on X" preposition the trailing words may still be a
    // target ("incin fo chomp"), so try every split of move / target and keep
    // the one that explains the most words.
    const candidates = [...new Set([...candidateMoves(actorMon), ...ALL_MOVE_NAMES()])];

    let moveName: string | null = null;
    let trailingTarget: MonState | null = null;

    for (let k = rest.length; k >= 1; k--) {
      const phrase = rest.slice(0, k).join(" ");
      const m = resolveMoveName(phrase, candidates);
      if (!m) continue;
      const remainder = rest.slice(k).filter((w) => !TARGET_PREPOSITIONS.has(norm(w)));
      if (remainder.length === 0) {
        moveName = m;
        break;
      }
      const t = bestMatch(remainder.join(" "), everyone, displayName, 55);
      if (t) {
        moveName = m;
        trailingTarget = t.value;
        break;
      }
      // Move resolved but the rest is noise - remember it and keep looking for
      // a split that accounts for everything.
      if (!moveName) moveName = m;
    }

    if (!moveName) {
      const movePhrase = rest.join(" ");
      entry.problem = movePhrase ? `did not recognise "${movePhrase}"` : "no move given";
      problems.push(`"${raw}": ${entry.problem}`);
      entries.push(entry);
      return;
    }
    entry.moveName = moveName;
    if (trailingTarget && !targetWords.length) {
      entry.targetUid = trailingTarget.uid;
      entry.targetName = displayName(trailingTarget);
    }

    // Target resolution.
    const data = getMoveData(moveName);
    const foes = actorMon.side === "me" ? theirs : mine;
    const needsTarget = Boolean(data && !data.spread) || Boolean(STATUS_MOVES[moveName]?.targetsFoe);

    if (targetWords.length) {
      const t = bestMatch(targetWords.join(" "), [...mine, ...theirs], displayName, 45);
      if (t) {
        entry.targetUid = t.value.uid;
        entry.targetName = displayName(t.value);
      }
    }
    if (!entry.targetUid && needsTarget) {
      if (foes.length === 1) {
        entry.targetUid = foes[0].uid;
        entry.targetName = displayName(foes[0]);
      } else if (foes.length > 1) {
        // Leave it for the UI to ask - guessing a target silently would be worse.
        entry.problem = "which target?";
      }
    }

    entry.action = {
      kind: "move",
      moveName,
      targetUid: entry.targetUid ?? undefined,
      ...(megaFlag ? { mega: true } : {}),
    };
    if (entry.problem) problems.push(`"${raw}": ${entry.problem}`);
    entries.push(entry);
  });

  return {
    entries,
    effects,
    complete:
      entries.length > 0 && entries.every((e) => e.action !== null && !e.problem),
    problems,
  };
}

/** Turn the parse into a Plan the simulator understands. */
export function planFromParse(parsed: ParsedTurn): Record<string, Action> {
  const plan: Record<string, Action> = {};
  for (const e of parsed.entries) {
    if (e.actorUid && e.action) plan[e.actorUid] = e.action;
  }
  return plan;
}

export type { SideId };
