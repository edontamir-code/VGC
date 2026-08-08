// ===========================================================================
// Stat changes, and the abilities that bend them.
//
// The simulator only ever applied Icy Wind's Speed drop. Everything else was
// invisible, which meant the tool could not see the things that actually decide
// doubles turns:
//
//   CLOSE COMBAT drops your own Def and SpD - unless you have CONTRARY, in
//   which case it RAISES them. Mega Staraptor clicking Close Combat gets bulkier
//   every time it attacks, and the tool was scoring it as a pure attack.
//
//   INTIMIDATE drops both foes' Attack the moment it lands, which is often
//   worth more than a KO - unless they have DEFIANT, which turns your
//   Intimidate into a +2 Attack boost for them. Leading Intimidate into a
//   Kingambit is not neutral, it is actively bad.
//
// So stat changes get their own module: one place that knows who a change
// applies to, who is immune, who inverts it, and who is angered by it.
// ===========================================================================
import type { BattleState, MonState, Stages, StageKey } from "../model/types.ts";
import { activeProfile } from "./stats.ts";

/** A set of stage deltas, e.g. { def: -1, spd: -1 } for Close Combat. */
export type StageDelta = Partial<Record<StageKey, number>>;

/** Abilities that ignore stat DROPS from the opponent entirely. */
const DROP_IMMUNE = new Set([
  "Clear Body",
  "White Smoke",
  "Full Metal Body",
]);

/** Abilities that protect one specific stat from being lowered. */
const STAT_GUARD: Record<string, StageKey> = {
  "Hyper Cutter": "atk",
  "Big Pecks": "def",
  "Keen Eye": "acc",
  "Illuminate": "acc",
};

/**
 * Abilities that block Intimidate specifically.
 * Gen 8+ - these do not stop other stat drops, only the Intimidate trigger.
 */
const INTIMIDATE_PROOF = new Set([
  "Inner Focus",
  "Own Tempo",
  "Oblivious",
  "Scrappy",
  "Guard Dog",
]);

/** Abilities that turn an opponent's stat drop into a boost. */
const SPITE: Record<string, StageKey> = {
  Defiant: "atk",
  Competitive: "spa",
};

/** Contrary inverts every stat change applied to its holder. */
function inverts(mon: MonState): boolean {
  return activeProfile(mon).ability === "Contrary";
}

export interface StageOutcome {
  mon: MonState;
  /** What was actually applied, after immunity/inversion. */
  applied: StageDelta;
  /** Human-readable, or null when nothing happened. */
  text: string | null;
}

const nameOf = (m: MonState) => activeProfile(m).displayName;

const LABEL: Record<string, string> = {
  atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe", acc: "Acc", eva: "Eva",
};

function describe(applied: StageDelta): string {
  return Object.entries(applied)
    .map(([k, v]) => `${v > 0 ? "+" : ""}${v} ${LABEL[k] ?? k}`)
    .join(", ");
}

/**
 * Apply a stat change to one Pokemon.
 *
 * `fromOpponent` decides two things: whether drop-immunity applies at all (your
 * own Close Combat drop is not something Clear Body stops), and whether Defiant
 * fires. Getting that flag wrong is how a tool ends up telling you a Contrary
 * Staraptor is immune to its own boost.
 */
export function applyStages(
  mon: MonState,
  delta: StageDelta,
  fromOpponent: boolean
): StageOutcome {
  const ability = activeProfile(mon).ability;
  const stages: Stages = { ...mon.stages };
  const applied: StageDelta = {};
  const notes: string[] = [];
  let spiteTriggered = false;

  for (const [rawKey, rawAmount] of Object.entries(delta)) {
    const key = rawKey as StageKey;
    // Contrary first: it decides whether this is even a drop.
    let amount = inverts(mon) ? -rawAmount : rawAmount;
    if (amount === 0) continue;

    if (amount < 0 && fromOpponent) {
      if (DROP_IMMUNE.has(ability)) {
        notes.push(`${ability} blocked the ${LABEL[key]} drop`);
        continue;
      }
      if (STAT_GUARD[ability] === key) {
        notes.push(`${ability} blocked the ${LABEL[key]} drop`);
        continue;
      }
      if (SPITE[ability]) spiteTriggered = true;
    }

    const before = stages[key];
    const after = Math.max(-6, Math.min(6, before + amount));
    if (after === before) continue;
    stages[key] = after;
    applied[key] = after - before;
  }

  // Defiant / Competitive: any drop from the opponent, however small, is worth
  // +2 to them. This is why Intimidate into a Kingambit is a mistake - the net
  // is +1, so you have handed them a boost by trying to weaken them.
  if (spiteTriggered) {
    const key = SPITE[ability];
    const before = stages[key];
    const after = Math.min(6, before + 2);
    if (after !== before) {
      stages[key] = after;
      applied[key] = (applied[key] ?? 0) + (after - before);
      const net = applied[key]!;
      notes.push(
        `${ability} answered with +2 ${LABEL[key]}, so the net is ` +
          `${net > 0 ? "+" : ""}${net} - you made it STRONGER`
      );
    }
  }

  const changed = Object.keys(applied).length > 0;
  const next = changed ? { ...mon, stages } : mon;
  const body = changed ? `${nameOf(mon)} ${describe(applied)}` : null;

  return {
    mon: next,
    applied,
    text:
      notes.length && body
        ? `${body} (${notes.join("; ")})`
        : notes.length
          ? `${nameOf(mon)}: ${notes.join("; ")}`
          : body,
  };
}

// ---------------------------------------------------------------------------
// Intimidate
// ---------------------------------------------------------------------------

export function hasIntimidate(mon: MonState): boolean {
  return activeProfile(mon).ability === "Intimidate";
}

export interface IntimidateResult {
  state: BattleState;
  events: string[];
}

/** Drop one specific Pokemon's Attack, respecting immunity and Defiant. */
function intimidateOne(
  state: BattleState,
  sourceName: string,
  targetUid: string
): { state: BattleState; event: string | null } {
  const foe = state.mons[targetUid];
  if (!foe || foe.fainted) return { state, event: null };

  const ability = activeProfile(foe).ability;
  if (INTIMIDATE_PROOF.has(ability)) {
    return { state, event: `${nameOf(foe)}'s ${ability} ignored ${sourceName}'s Intimidate` };
  }

  const out = applyStages(foe, { atk: -1 }, true);
  const next = out.mon === foe ? state : { ...state, mons: { ...state.mons, [targetUid]: out.mon } };
  return { state: next, event: out.text ? `${sourceName}'s Intimidate: ${out.text}` : null };
}

/**
 * A Pokemon has just arrived. Resolve Intimidate in BOTH directions.
 *
 * Both directions matter, and only one of them is obvious:
 *
 *   OUTGOING - if the arriving Pokemon has Intimidate, it drops both foes.
 *   INCOMING - if anything opposite it has Intimidate, THAT hits the newcomer.
 *
 * The second is the one that was missing, and it is the case that actually
 * comes up: you set their leads first, so their Incineroar arrives to an empty
 * field and intimidates nobody. Then your Kingambit arrives and, without this,
 * never gets intimidated at all - so the tool would quietly miss that Kingambit
 * is sitting at +1 Attack from Defiant before either side has moved.
 *
 * Reported per target, because the outcomes genuinely differ across the two:
 * one may be immune, one may have Defiant and come out ahead. "Intimidate
 * landed" is not a useful summary of a turn where half of it backfired.
 */
export function applyIntimidate(
  state: BattleState,
  enteringUid: string
): IntimidateResult {
  const entering = state.mons[enteringUid];
  if (!entering || entering.fainted) return { state, events: [] };

  const foeSide = entering.side === "me" ? "opp" : "me";
  let next = state;
  const events: string[] = [];

  // Outgoing: mine drops theirs.
  if (hasIntimidate(entering)) {
    for (const uid of state.sides[foeSide].active) {
      if (!uid) continue;
      const r = intimidateOne(next, nameOf(entering), uid);
      next = r.state;
      if (r.event) events.push(r.event);
    }
  }

  // Incoming: anything opposite with Intimidate drops the newcomer.
  for (const uid of state.sides[foeSide].active) {
    if (!uid) continue;
    const foe = next.mons[uid];
    if (!foe || foe.fainted || !hasIntimidate(foe)) continue;
    const r = intimidateOne(next, nameOf(foe), enteringUid);
    next = r.state;
    if (r.event) events.push(r.event);
  }

  return { state: next, events };
}
