// ===========================================================================
// Conditional answers: "Sylveon is really strong, but only inside Trick Room."
//
// A flat answer matrix scores every 1v1 on the board as it stands, which quietly
// throws away half of how doubles teams are actually built. Sylveon does not
// beat much at 60 Speed; behind a Trick Room it beats a great deal. Farigiraf is
// not in the four because it wins matchups, it is there because it turns
// Sylveon on. Those two are ONE plan, and a tool that lists them as two
// unrelated Pokemon with mediocre individual scores has missed the point.
//
// So the matrix is re-scored under each speed condition we can actually create,
// and any matchup that FLIPS is reported together with the Pokemon that flips
// it. That is the difference between "Sylveon loses to Garchomp" and "Sylveon
// beats Garchomp if Farigiraf gets Trick Room up first".
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { buildAnswerMatrix, withMegaChoice } from "./answers.ts";
import type { AnswerCell, AnswerVerdict } from "./answers.ts";
import { SETTER_MOVE, settersFor, withCondition } from "./speedConditions.ts";
import type { SpeedCondition } from "./speedConditions.ts";
import { outspeedVerdict } from "./speedInference.ts";
import { activeProfile } from "./stats.ts";

export { CONDITION_LABEL, settersFor, withCondition } from "./speedConditions.ts";
export type { SpeedCondition } from "./speedConditions.ts";

/** How good is this verdict, so we can say whether a condition helped. */
const RANK: Record<AnswerVerdict, number> = {
  walled: 0,
  loses: 1,
  trade: 2,
  slow: 3,
  answer: 4,
};

const nameOf = (m: MonState) => activeProfile(m).displayName;

export interface ConditionFlip {
  mine: MonState;
  theirs: MonState;
  before: AnswerVerdict;
  after: AnswerVerdict;
  cell: AnswerCell;
}

export interface ConditionalPlan {
  condition: SpeedCondition;
  /** Who on my team can turn it on. Empty means the plan is not available. */
  setters: MonState[];
  /** Matchups this condition turns into answers. */
  gained: ConditionFlip[];
  /** Matchups it costs me - Trick Room cuts both ways. */
  lost: ConditionFlip[];
  /** Pokemon that gain the most from it, best first. */
  abusers: { mon: MonState; gains: string[] }[];
  text: string | null;
}

/**
 * What does turning this condition on actually buy me?
 *
 * Only conditions I can CREATE are worth reporting: telling a player their
 * Sylveon would be excellent under a Trick Room nobody on the team can set is
 * noise. Losses are reported alongside gains because Trick Room turns off my
 * fast Pokemon just as hard as it turns on my slow ones.
 */
export function conditionalPlan(
  state: BattleState,
  cond: Exclude<SpeedCondition, "normal">,
  megaUid: string | null | undefined = undefined
): ConditionalPlan {
  const base = megaUid === undefined ? state : withMegaChoice(state, "me", megaUid);
  const setters = settersFor(base, cond);

  const before = buildAnswerMatrix(withCondition(base, "normal"));
  const after = buildAnswerMatrix(withCondition(base, cond));

  const gained: ConditionFlip[] = [];
  const lost: ConditionFlip[] = [];

  for (const a of after.cells) {
    const b = before.cells.find(
      (x) => x.mine.uid === a.mine.uid && x.theirs.uid === a.theirs.uid
    );
    if (!b || b.verdict === a.verdict) continue;
    const flip: ConditionFlip = {
      mine: a.mine,
      theirs: a.theirs,
      before: b.verdict,
      after: a.verdict,
      cell: a,
    };
    // Only a swing into or out of a genuine ANSWER is worth a player's attention.
    if (a.verdict === "answer" && b.verdict !== "answer") gained.push(flip);
    else if (b.verdict === "answer" && a.verdict !== "answer") lost.push(flip);
    else if (RANK[a.verdict] > RANK[b.verdict]) gained.push(flip);
    else lost.push(flip);
  }

  const byMon = new Map<string, { mon: MonState; gains: string[] }>();
  for (const g of gained) {
    if (g.after !== "answer") continue;
    const entry = byMon.get(g.mine.uid) ?? { mon: g.mine, gains: [] };
    entry.gains.push(nameOf(g.theirs));
    byMon.set(g.mine.uid, entry);
  }
  const abusers = [...byMon.values()].sort((a, b) => b.gains.length - a.gains.length);

  let text: string | null = null;
  if (setters.length > 0 && abusers.length > 0) {
    const top = abusers[0];
    text =
      `${setters.map(nameOf).join(" or ")} sets ${SETTER_MOVE[cond]}, and that turns ` +
      `${top.mon.set.name} into an answer to ${top.gains.join(", ")}` +
      (abusers.length > 1
        ? ` (also helps ${abusers.slice(1).map((a) => a.mon.set.name).join(", ")})`
        : "") +
      `. They are one plan, not two Pokemon.` +
      (lost.length > 0
        ? ` It costs you ${lost
            .filter((l) => l.before === "answer")
            .map((l) => `${nameOf(l.mine)} vs ${nameOf(l.theirs)}`)
            .slice(0, 3)
            .join(", ")}.`
        : "");
  } else if (setters.length > 0 && abusers.length === 0) {
    text = `${setters.map(nameOf).join(" or ")} can set ${SETTER_MOVE[cond]}, but it does not gain you a matchup here.`;
  }

  return { condition: cond, setters, gained, lost, abusers, text };
}

/** Every condition I can create that actually changes something. */
export function conditionalPlans(
  state: BattleState,
  megaUid: string | null | undefined = undefined
): ConditionalPlan[] {
  const out: ConditionalPlan[] = [];
  for (const cond of ["trickRoom", "tailwind"] as const) {
    const p = conditionalPlan(state, cond, megaUid);
    if (p.setters.length > 0 && (p.gained.length > 0 || p.lost.length > 0)) out.push(p);
  }
  return out.sort((a, b) => b.gained.length - a.gained.length);
}

// ---------------------------------------------------------------------------
// Tailwind AND Trick Room, on the same team.
//
// These are not two independent buttons. Tailwind doubles the Speed STAT, and
// Trick Room orders by the stat with the smallest going first - so running both
// at once makes your Tailwind'd Pokemon move LATER than they would have with no
// Tailwind at all. speed.js already computes this correctly; nothing in the UI
// ever said it, so a team carrying both would happily be shown two plans that
// quietly cancel.
//
// What real games do is SEQUENCE them: Tailwind for its four turns while the
// fast half of the team does the work, then Trick Room once the board has
// turned over and the slow half is what is left. Which order depends on who
// you are leading with and who is in the back.
// ---------------------------------------------------------------------------

export interface SpeedFlip {
  mon: MonState;
  foe: MonState;
  /** Outspeeds with Tailwind only. */
  fastWithTW: boolean;
  /** Outspeeds with both Tailwind and Trick Room up. */
  fastWithBoth: boolean;
}

export interface ConditionSequence {
  /** True when my team can create both. */
  hasBoth: boolean;
  /** Answers with both up at once. */
  bothAtOnce: number;
  /** Answers with the better single condition up. */
  bestSingle: number;
  bestSingleCondition: Exclude<SpeedCondition, "normal"> | null;
  /**
   * True when stacking them actively hurts. This is a SPEED fact, not a
   * coverage one - measuring coverage alone misses it entirely on a team that
   * already covers everything.
   */
  conflicts: boolean;
  /** Concrete cases where Tailwind stops helping once Trick Room is up. */
  cancelled: SpeedFlip[];
  /** The order that suits the board, and why. */
  recommended: Exclude<SpeedCondition, "normal">[] | null;
  text: string | null;
}

function coverageUnder(state: BattleState, conds: Exclude<SpeedCondition, "normal">[]): number {
  let s = withCondition(state, "normal");
  for (const c of conds) s = withCondition(s, c);
  return buildAnswerMatrix(s).coverage.filter((c) => c.covered).length;
}

/**
 * Should I run both, and in which order?
 *
 * Tailwind doubles the Speed STAT; Trick Room sends the smallest stat first. So
 * a Tailwind'd Pokemon under Trick Room moves LATER than it would have with
 * neither up - the two undo each other, and the tool has to say so rather than
 * offering them as two independent buttons.
 *
 * The conflict is detected on actual turn order, not on coverage: a team that
 * already answers all six shows no coverage difference at all while still
 * having its speed control cancelled.
 *
 * The "which first" call is made on who is on the field NOW, because a
 * condition you set for a Pokemon still on the bench is four turns spent on
 * nothing.
 */
export function conditionSequence(
  state: BattleState,
  megaUid: string | null | undefined = undefined
): ConditionSequence {
  const base = megaUid === undefined ? state : withMegaChoice(state, "me", megaUid);
  const canTR = settersFor(base, "trickRoom").length > 0;
  const canTW = settersFor(base, "tailwind").length > 0;

  const empty: ConditionSequence = {
    hasBoth: false, bothAtOnce: 0, bestSingle: 0, bestSingleCondition: null,
    conflicts: false, cancelled: [], recommended: null, text: null,
  };
  if (!canTR || !canTW) return empty;

  const foes = Object.values(base.mons).filter((m) => m.side === "opp" && !m.fainted);
  if (foes.length === 0) return empty;
  const mine = Object.values(base.mons).filter((m) => m.side === "me" && !m.fainted);

  // --- the speed fact -------------------------------------------------------
  const tw = withCondition(withCondition(base, "normal"), "tailwind");
  const twTR = withCondition(tw, "trickRoom");
  const cancelled: SpeedFlip[] = [];
  for (const m of mine) {
    for (const f of foes) {
      const a = outspeedVerdict(tw.mons[m.uid], tw.mons[f.uid], tw);
      const b = outspeedVerdict(twTR.mons[m.uid], twTR.mons[f.uid], twTR);
      if (a.verdict === "always" && b.verdict !== "always") {
        cancelled.push({ mon: m, foe: f, fastWithTW: true, fastWithBoth: false });
      }
    }
  }

  const trOnly = coverageUnder(base, ["trickRoom"]);
  const twOnly = coverageUnder(base, ["tailwind"]);
  const both = coverageUnder(base, ["trickRoom", "tailwind"]);
  const bestSingle = Math.max(trOnly, twOnly);
  const bestSingleCondition = trOnly >= twOnly ? "trickRoom" : "tailwind";
  const conflicts = cancelled.length > 0 || both < bestSingle;

  // --- which one first ------------------------------------------------------
  const activeUids = new Set(state.sides.me.active.filter(Boolean) as string[]);
  const helpsActive = (cond: Exclude<SpeedCondition, "normal">) =>
    conditionalPlan(base, cond, undefined).gained.filter(
      (g) => g.after === "answer" && activeUids.has(g.mine.uid)
    ).length;

  const trNow = helpsActive("trickRoom");
  const twNow = helpsActive("tailwind");
  const first: Exclude<SpeedCondition, "normal"> =
    trNow === twNow ? bestSingleCondition : trNow > twNow ? "trickRoom" : "tailwind";
  const second = first === "trickRoom" ? "tailwind" : "trickRoom";

  const label = (c: Exclude<SpeedCondition, "normal">) => SETTER_MOVE[c];
  const parts: string[] = [];

  if (cancelled.length > 0) {
    const eg = cancelled[0];
    parts.push(
      `Never stack them. Tailwind doubles the Speed stat and Trick Room sends the SMALLEST ` +
        `stat first, so they undo each other - ${nameOf(eg.mon)} outspeeds ${nameOf(eg.foe)} ` +
        `under Tailwind alone and loses that with Trick Room also up` +
        (cancelled.length > 1 ? ` (${cancelled.length} matchups flip back)` : "") +
        `.`
    );
  } else if (both < bestSingle) {
    parts.push(
      `Running both covers ${both}; ${label(bestSingleCondition)} alone covers ${bestSingle}. ` +
        `Do not set the second on top of the first.`
    );
  }

  parts.push(
    `Sequence them with turns in between: ${label(first)} first` +
      (first === "tailwind"
        ? ` while your fast Pokemon are out, then ${label(second)} once it has expired and the ` +
          `slow half is what is left`
        : ` for what you have on the field, then ${label(second)} after it runs out`) +
      `.`
  );

  return {
    hasBoth: true,
    bothAtOnce: both,
    bestSingle,
    bestSingleCondition,
    conflicts,
    cancelled,
    recommended: [first, second],
    text: parts.join(" "),
  };
}
