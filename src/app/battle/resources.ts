// ===========================================================================
// "Keep your Charizard answer alive."
//
// The tool could already tell you Sylveon answers Basculegion. What it could
// not tell you was that trading Sylveon into a Whimsicott is losing the game,
// because Basculegion is still in the back and Sylveon was the only thing on
// your team that beat it.
//
// That is resource preservation, and it is most of what separates a good
// doubles player from a calculator. A Pokemon is not worth its HP bar - it is
// worth the threats it is holding shut. A Pokemon that is the ONLY answer to
// something still alive is close to unspendable; one whose job is already done,
// or duplicated elsewhere on the team, is a tool you should be happy to spend.
//
// Two things come out of this file:
//
//   1. a per-Pokemon VALUE the search can use, so the planner naturally avoids
//      trading away sole answers instead of merely being told off afterwards
//   2. plain-language warnings for the console
//
// The search calls evaluate() hundreds of thousands of times, so the answer
// matrix is computed ONCE up front and passed in as a lookup. Recomputing it
// inside the evaluation would be correct and unusably slow.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { buildAnswerMatrix } from "./answers.ts";
import { activeProfile } from "./stats.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

export interface AnswerDuty {
  /** My Pokemon. */
  uid: string;
  /** Their still-living Pokemon that this one answers. */
  answers: string[];
  /** Of those, the ones NOTHING else of mine answers. */
  soleFor: string[];
  /** True when losing it would leave a live threat unanswered. */
  irreplaceable: boolean;
}

/** uid -> what that Pokemon is holding shut. Cheap to look up, built once. */
export type DutyMap = Record<string, AnswerDuty>;

/**
 * Who is holding what shut, right now.
 *
 * Only LIVING threats count. An answer to something already fainted is not a
 * resource, it is a memory, and treating it as one would make the planner
 * hoard Pokemon whose job is finished.
 */
export function answerDuties(state: BattleState): DutyMap {
  const matrix = buildAnswerMatrix(state);
  const duties: DutyMap = {};

  for (const mon of Object.values(state.mons)) {
    if (mon.side !== "me" || mon.fainted) continue;
    duties[mon.uid] = { uid: mon.uid, answers: [], soleFor: [], irreplaceable: false };
  }

  for (const cov of matrix.coverage) {
    if (cov.threat.fainted) continue;
    // Their Pokemon that are provably NOT in the brought four cannot appear.
    if (cov.threat.brought === "out") continue;

    const live = cov.answers.filter((a) => !a.mine.fainted);
    for (const a of live) {
      const d = duties[a.mine.uid];
      if (!d) continue;
      d.answers.push(cov.threat.uid);
      if (live.length === 1) {
        d.soleFor.push(cov.threat.uid);
        d.irreplaceable = true;
      }
    }
  }
  return duties;
}

/**
 * What one of my Pokemon is worth beyond its HP, in evaluation points.
 *
 * Scaled so that being the sole answer to a live threat is worth a meaningful
 * fraction of a Pokemon, but never more than one: the planner must still be
 * willing to trade a sole answer to actually win, it just should not do it for
 * a small material gain. Redundant answers are worth much less, because losing
 * one of two answers costs you a safety margin rather than the matchup.
 */
export const SOLE_ANSWER_VALUE = 420;
export const SHARED_ANSWER_VALUE = 70;

export function dutyValue(duty: AnswerDuty | undefined): number {
  if (!duty) return 0;
  const shared = duty.answers.length - duty.soleFor.length;
  return duty.soleFor.length * SOLE_ANSWER_VALUE + shared * SHARED_ANSWER_VALUE;
}

// ---------------------------------------------------------------------------
// The warnings
// ---------------------------------------------------------------------------

export interface ResourceWarning {
  uid: string;
  /** How badly this matters. */
  severity: "high" | "med";
  text: string;
}

/**
 * What am I about to spend, and can I afford it?
 *
 * The interesting case is a sole answer to something that has NOT been on the
 * field yet - you are being asked to trade it against a Pokemon in front of you
 * for the sake of one that is still in the back, which is exactly the trade
 * people get wrong under a timer.
 */
export function resourceWarnings(state: BattleState): ResourceWarning[] {
  const duties = answerDuties(state);
  const out: ResourceWarning[] = [];
  const activeUids = new Set(state.sides.me.active.filter(Boolean) as string[]);

  for (const [uid, duty] of Object.entries(duties)) {
    if (!duty.irreplaceable) continue;
    const mon = state.mons[uid];
    if (!mon) continue;

    const threats = duty.soleFor.map((t) => state.mons[t]).filter(Boolean);
    const inTheBack = threats.filter(
      (t) => !(state.sides.opp.active.filter(Boolean) as string[]).includes(t.uid)
    );

    // Only worth saying when the Pokemon is actually at risk - it is out, or
    // it is hurt enough that a switch-in could be lost.
    const atRisk = activeUids.has(uid) || mon.curHP < mon.maxHP * 0.5;
    if (!atRisk) continue;

    out.push({
      uid,
      severity: inTheBack.length > 0 ? "high" : "med",
      text:
        `${nameOf(mon)} is your ONLY answer to ${threats.map(nameOf).join(" and ")}` +
        (inTheBack.length > 0
          ? `, and ${inTheBack.map(nameOf).join(" and ")} ` +
            `${inTheBack.length === 1 ? "is" : "are"} still in the back. Do not trade it off for ` +
            `something you have other answers to - once it is gone that matchup is unanswerable.`
          : `. Losing it hands them that matchup for the rest of the game.`),
    });
  }

  return out.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === "high" ? -1 : 1));
}

/** Threats nothing living of mine answers any more. */
export function unansweredThreats(state: BattleState): MonState[] {
  const matrix = buildAnswerMatrix(state);
  return matrix.coverage
    .filter(
      (c) =>
        !c.threat.fainted &&
        c.threat.brought !== "out" &&
        c.answers.filter((a) => !a.mine.fainted).length === 0
    )
    .map((c) => c.threat);
}
