// ===========================================================================
// The reply. After every command, what does the tool actually want to tell me?
//
// The analysis all existed already - answer matrix, opening read, lead risks,
// ranked lines - but it was spread across four panels and two tabs, which under
// a timer means you read none of it. This assembles the one thing that matters
// for the phase you are in, in the order you need it:
//
//   1. the urgent thing (you get KO'd first, their Fake Out stops your plan)
//   2. what to do
//   3. why
//
// Short on purpose. A paragraph you skip is worth less than a sentence you read.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { suggestBringFour } from "./answers.ts";
import { conditionSequence } from "./conditions.ts";
import { openingRead } from "./leads.ts";
import { rankedLinesWithRisk } from "./leadRisk.ts";
import { bestBoardPlay } from "./spread.ts";
import { budgetRead } from "./damageInference.ts";
import { resourceWarnings, unansweredThreats } from "./resources.ts";
import { doubleProtect, fakeOutCalls } from "./protect.ts";
import { moveProbability } from "./inference.ts";
import type { PlanLine } from "../search/plan.ts";
import { activeMons } from "./resolver.ts";
import { activeProfile } from "./stats.ts";
import { phaseOf } from "../input/command.ts";
import type { Phase } from "../input/command.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

export interface Brief {
  phase: Phase;
  headline: string;
  /** What to do, best first. */
  advice: string[];
  /** Things that will cost you the game if you miss them. */
  urgent: string[];
  /** Background - reads, probabilities, the reasoning. */
  notes: string[];
}

function bringBrief(state: BattleState): Brief {
  const bring = suggestBringFour(state);
  const advice: string[] = [];
  const urgent: string[] = [];
  const notes: string[] = [];

  if (!bring) {
    return {
      phase: "roster",
      headline: "Their team is in. Tell me the leads.",
      advice: [], urgent: [], notes: [],
    };
  }

  advice.push(
    `Bring ${bring.team.map(nameOf).join(", ")}` +
      (bring.megaName ? ` - ${bring.megaName} is your Mega.` : ".")
  );
  if (bring.megaBenched.length) {
    notes.push(
      `${bring.megaBenched.join(" and ")} ${bring.megaBenched.length === 1 ? "comes" : "come"} ` +
        `as the base form. Only one Pokemon Mega Evolves.`
    );
  }
  for (const r of bring.conditionalReasons) advice.push(r);
  if (bring.misses.length) {
    urgent.push(
      `No answer to ${bring.misses.join(", ")} - plan to handle ${
        bring.misses.length === 1 ? "it" : "them"
      } some other way.`
    );
  }

  const seq = conditionSequence(state);
  if (seq.conflicts && seq.text) notes.push(seq.text);

  return {
    phase: "roster",
    headline: `${bring.covers.length} of ${bring.covers.length + bring.misses.length + bring.conditionalCovers.length} covered outright.`,
    advice,
    urgent,
    notes,
  };
}

/**
 * What you cannot afford to spend.
 *
 * Shared between the lead brief and the turn brief, because the lead turn is
 * where this matters MOST: "should I get out of here" is the turn-1 decision,
 * and the reason to get out is usually that the Pokemon in front of them is
 * holding something in their back line shut.
 */
function resourceLines(state: BattleState): { urgent: string[]; notes: string[] } {
  const urgent: string[] = [];
  const notes: string[] = [];

  for (const w of resourceWarnings(state)) {
    if (w.severity === "high") urgent.push(w.text);
    else notes.push(w.text);
  }
  const orphaned = unansweredThreats(state);
  if (orphaned.length) {
    urgent.push(
      `Nothing left on your side answers ${orphaned.map(nameOf).join(", ")}. ` +
        `You are playing to win before ${orphaned.length === 1 ? "it comes" : "they come"} in.`
    );
  }
  return { urgent, notes };
}

function leadBrief(state: BattleState): Brief {
  const read = openingRead(state);
  const advice: string[] = [];
  const urgent: string[] = [];
  const notes: string[] = [];

  for (const p of read.plans.slice(0, 3)) {
    notes.push(p.text);
    if (p.counter) advice.push(p.counter);
  }
  for (const r of read.races) notes.push(r.text);
  for (const t of read.turnOneOnly) urgent.push(t);

  const res = resourceLines(state);
  urgent.push(...res.urgent);
  notes.push(...res.notes);
  for (const p of protectLines(state)) advice.push(p);

  return { phase: "leads", headline: read.headline, advice, urgent, notes };
}

/**
 * Protect, which is the most-used move in the format.
 *
 * Two things worth saying every turn: whether it is free right now, and - when
 * a Fake Out is coming - which Pokemon to spend it on.
 */
function protectLines(state: BattleState): string[] {
  const out: string[] = [];
  const dp = doubleProtect(state);
  if (dp.text) out.push(dp.text);
  for (const call of fakeOutCalls(state, moveProbability)) out.push(call.text);
  return out;
}

function turnBrief(state: BattleState): Brief {
  const foes = activeMons(state, "opp");
  const mine = activeMons(state, "me");
  if (!foes.length || !mine.length) {
    return {
      phase: "turn",
      headline: "Nobody is out. Tell me who came in.",
      advice: [], urgent: [], notes: [],
    };
  }

  const { lines, risks } = rankedLinesWithRisk(state);
  const advice: string[] = [];
  const urgent: string[] = [];
  const notes: string[] = [];

  // The risks come first: an action recommended into an unavoidable KO is worse
  // than no recommendation at all.
  for (const r of risks.filter((x) => x.severity === "high").slice(0, 3)) {
    urgent.push(r.text);
  }

  // What you cannot afford to spend. A Pokemon holding shut a threat still in
  // their back line is close to unspendable, and that is invisible from the
  // board in front of you - which is exactly why it needs saying.
  const res = resourceLines(state);
  urgent.push(...res.urgent);
  notes.push(...res.notes);
  for (const p of protectLines(state)) notes.push(p);

  const top = lines.find((l) => l.kind === "attack") ?? lines[0];
  if (top) {
    advice.push(`${nameOf(top.attacker)}: ${top.moveName}${top.spread ? " (hits both)" : ""}`);
    if (top.headline) notes.push(top.headline);
  }

  // What the whole board looks like after the best spread play - the "chips
  // them into range for the back line" argument, stated concretely.
  for (const m of mine) {
    const play = bestBoardPlay(m, state);
    if (play?.text) {
      notes.push(play.text);
      break;
    }
  }

  for (const r of risks.filter((x) => x.severity !== "high").slice(0, 2)) {
    notes.push(r.text);
  }

  // What their damage has proved about their spread. This compounds all game,
  // and the budget line is the one that actually changes decisions: a Pokemon
  // that hit that hard cannot also be the bulky build.
  for (const foe of Object.values(state.mons)) {
    if (foe.side !== "opp") continue;
    const bounds = Object.entries(foe.statBounds);
    if (bounds.length === 0) continue;
    notes.push(
      `${nameOf(foe)} measured: ` +
        bounds.map(([k, v]) => `${k.toUpperCase()} ${v.min}-${v.max}`).join(", ") + "."
    );
    const floors: Record<string, number> = {};
    for (const [k, v] of bounds) floors[k] = v.minSP;
    const read = budgetRead(foe, floors);
    if (read.text) urgent.push(read.text);
  }

  const headline = urgent.length
    ? "Careful - read the warning first."
    : top
      ? `Best line: ${nameOf(top.attacker)} ${top.moveName}.`
      : "No action stands out.";

  return { phase: "turn", headline, advice, urgent, notes };
}

// ---------------------------------------------------------------------------
// Planner advice
//
// The brief above is built from the SINGLE-TURN line ranker, because that is
// synchronous and therefore always available the instant you hit enter. The
// multi-turn search runs in a Web Worker and answers a second or so later, so
// it arrives as an UPGRADE to a reply that already exists rather than as the
// thing you waited for.
//
// The two can disagree, and when they do the deeper answer wins - but the
// difference is shown rather than hidden, because "the one-turn read liked
// this and the three-turn read does not" is itself worth knowing.
// ---------------------------------------------------------------------------

export interface PlannerBrief {
  /** The line, e.g. "Raichu: Zap Cannon -> Garchomp + Sylveon: Protect". */
  label: string;
  /** How far ahead it was verified. */
  horizon: number;
  /** True when every reply was checked at every ply, not beamed. */
  exhaustive: boolean;
  /** True when the worst case still leaves me ahead. */
  isPin: boolean;
  /** Holds against every move they could still be holding. */
  pinVsPossible: boolean;
  /** Their best answer to it. */
  worstReply: string;
  /** Material at the horizon, worst case. */
  material: { me: number; opp: number };
  /** Unknown moves that would break the line. */
  breakers: string[];
  /** True when this differs from what the single-turn ranker suggested. */
  disagrees: boolean;
  headline: string;
  notes: string[];
}

/**
 * Format the planner's top line for the console.
 *
 * `singleTurnPick` is what the synchronous ranker had already recommended, so
 * the disagreement can be called out explicitly.
 */
export function plannerBrief(
  lines: PlanLine[],
  singleTurnPick: string | null
): PlannerBrief | null {
  const top = lines[0];
  if (!top) return null;

  const notes: string[] = [];
  const claim = top.pinVsPossible
    ? "holds against every move they could still be holding"
    : top.pinVsAssumed
      ? "holds against the four moves they are assumed to run, but not against everything they could have"
      : top.isPin
        ? "comes out ahead in the worst case the search found"
        : "has no guarantee - it is just the best floor available";

  notes.push(
    `Verified ${top.horizon} turn${top.horizon === 1 ? "" : "s"} ahead, ` +
      `${top.worst.exhaustive ? "checking every reply" : "beaming their replies"}. It ${claim}.`
  );
  notes.push(`Their best answer: ${top.worst.replyLabel}.`);
  if (top.breakers.length) {
    notes.push(
      `Breaks if they have ${[...new Set(top.breakers.map((b) => b.moveName))].join(" or ")}.`
    );
  }
  if (top.unsimulated.length) {
    notes.push(
      `Not simulated, judge yourself: ` +
        `${[...new Set(top.unsimulated.map((b) => b.moveName))].join(", ")}.`
    );
  }

  // Compare on the Pokemon-and-move level, ignoring target choice.
  const norm = (s: string) => s.toLowerCase().replace(/\s*->.*$/gm, "").trim();
  const disagrees = Boolean(singleTurnPick) && !norm(top.label).includes(norm(singleTurnPick!));

  return {
    label: top.label,
    horizon: top.horizon,
    exhaustive: top.worst.exhaustive,
    isPin: top.isPin,
    pinVsPossible: top.pinVsPossible,
    worstReply: top.worst.replyLabel,
    material: top.worst.material,
    breakers: [...new Set(top.breakers.map((b) => b.moveName))],
    disagrees,
    headline:
      `Looking ${top.horizon} ahead: ${top.label}` +
      (top.pinVsPossible ? " - guaranteed." : top.isPin ? " - best floor." : ""),
    notes,
  };
}

/** The brief for whatever phase the board is in. */
export function briefFor(state: BattleState): Brief {
  const phase = phaseOf(state);
  if (phase === "roster") {
    return {
      phase,
      headline: "Type their six from team preview.",
      advice: [], urgent: [], notes: [],
    };
  }
  if (phase === "leads") return bringBrief(state);
  return state.turn === 1 && openingRead(state).isLeadTurn
    ? leadBrief(state)
    : turnBrief(state);
}
