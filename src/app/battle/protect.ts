// ===========================================================================
// Protect: the most-used move in the format, and the one the tool understood
// worst.
//
// The mechanic, which the tool was only half modelling:
//
//   Each Pokemon carries its OWN consecutive-protect counter. The first use
//   always works. Each successive use in an unbroken run succeeds with
//   probability 1/3^n, so 100%, 33.3%, 11.1%, 3.7%. Using any other move,
//   switching out, or a failed Protect resets the counter to zero.
//
// Two consequences the tool has to get right:
//
//   1. The counter is per Pokemon, so BOTH of your actives can Protect on the
//      same turn and both are guaranteed. That is a free turn of information
//      whenever you are unsure what they are doing, and the tool should say so
//      rather than pricing a "double Protect" as a coinflip.
//
//   2. A repeat Protect is UNRELIABLE, not impossible. The old model deleted it
//      from the legal move list entirely, which meant the planner could never
//      weigh a 33% Protect against a certain loss - and sometimes 33% is the
//      whole game.
//
// Guarantees still assume it fails: under maximin the coinflip goes against
// you, so a pin may never rest on a repeat Protect. That is a claim about what
// is PROVEN, not a claim about what is likely, and those are reported apart.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { isProtect } from "../sim/actions.ts";
import { rankedLines } from "./resolver.ts";
import type { Line } from "./resolver.ts";
import { simulateTurn } from "../sim/turn.ts";
import type { Plan } from "../sim/actions.ts";
import { evaluate } from "../search/evaluate.ts";
import { blockedBySidePriorityGuard } from "./terrain.ts";
import { scout } from "./scouting.ts";
import { activeProfile } from "./stats.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

/**
 * Chance a Protect-type move succeeds, given how many times in a row this
 * Pokemon has already protected.
 *
 * 1 / 3^streak. The run is broken by any other move, a switch, or a failure.
 */
export function protectSuccessChance(streak: number): number {
  if (streak <= 0) return 1;
  return 1 / Math.pow(3, streak);
}

export interface ProtectRead {
  uid: string;
  mon: MonState;
  /** Does it even have a Protect-type move? */
  hasProtect: boolean;
  streak: number;
  /** 0-1. */
  chance: number;
  /** True when it cannot fail. */
  guaranteed: boolean;
  text: string;
}

/** Every Protect-type move this Pokemon could actually use. */
function protectMoveOf(mon: MonState): string | null {
  return scout(mon).arsenal.find((m) => isProtect(m)) ?? null;
}

export function protectRead(mon: MonState): ProtectRead {
  const move = protectMoveOf(mon);
  const streak = mon.protectStreak;
  const chance = protectSuccessChance(streak);
  const pct = Math.round(chance * 100);

  return {
    uid: mon.uid,
    mon,
    hasProtect: Boolean(move),
    streak,
    chance,
    guaranteed: streak === 0,
    text: !move
      ? `${nameOf(mon)} has no Protect.`
      : streak === 0
        ? `${nameOf(mon)} ${move} is guaranteed this turn.`
        : `${nameOf(mon)} protected ${streak === 1 ? "last turn" : `${streak} turns running`}, ` +
          `so another ${move} is ${pct}% - do not build the turn on it.`,
  };
}

export interface DoubleProtectRead {
  /** My actives that can Protect at all. */
  available: ProtectRead[];
  /** True when every one of them is on a fresh counter. */
  bothGuaranteed: boolean;
  text: string | null;
}

/**
 * Can I just Protect with both and find out what they are doing?
 *
 * The counter is per Pokemon, so two fresh Protects are two guaranteed blocks -
 * a whole turn of scouting for free. Worth stating plainly, because it is the
 * cheapest way out of a turn you do not understand.
 */
export function doubleProtect(state: BattleState): DoubleProtectRead {
  const actives = (state.sides.me.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);

  const available = actives.map(protectRead).filter((r) => r.hasProtect);
  if (available.length === 0) return { available, bothGuaranteed: false, text: null };

  const bothGuaranteed = available.every((r) => r.guaranteed);

  let text: string | null = null;
  if (available.length >= 2 && bothGuaranteed) {
    text =
      `Both ${available.map((r) => nameOf(r.mon)).join(" and ")} can Protect this turn and ` +
      `both are guaranteed - the counter is per Pokemon, so they do not share it. ` +
      `That is a free turn if you do not know what they are doing.`;
  } else if (available.length === 1 && available[0].guaranteed) {
    text = available[0].text;
  } else if (!bothGuaranteed) {
    const risky = available.filter((r) => !r.guaranteed);
    text = risky.map((r) => r.text).join(" ");
  }

  return { available, bothGuaranteed, text };
}

// ---------------------------------------------------------------------------
// Calling the Fake Out
// ---------------------------------------------------------------------------


export interface FakeOutBranch {
  /** Which of mine gets flinched in this branch. */
  target: MonState;
  /** What that Pokemon would have done with the turn. */
  deniedMove: string | null;
  /** Plain words for what the flinch costs. */
  cost: string;
  /** Position value for me after this branch, from the real simulator. */
  score: number;
  /** Can that Pokemon Protect through it, and how reliably? 0 = no Protect. */
  protectChance: number;
}

export interface FakeOutRead {
  /** Their Pokemon that can Fake Out. */
  by: MonState;
  /** 0-1 that it holds Fake Out at all. */
  probability: number;
  /** One per Pokemon of mine it could hit, WORST FOR ME FIRST. Empty if blocked. */
  branches: FakeOutBranch[];
  /** The branch they should pick if they are playing well. */
  theirBest: FakeOutBranch | null;
  /**
   * True when the branches are close enough that the call is a guess. Worth
   * saying: it turns "Protect this one" into "pick one and accept the other".
   */
  closeCall: boolean;
  /**
   * The ability stopping it side-wide, if any. Armor Tail, Queenly Majesty and
   * Dazzling all blank the whole priority bracket for their side - so there is
   * no Fake Out to call, and no Protect worth spending on one.
   */
  blockedBy: { ability: string; holder: MonState } | null;
  text: string;
}

/** Below this gap the two branches are effectively the same to them. */
const CLOSE_CALL_MARGIN = 150;

/**
 * "Either he Fake Outs that one and goes on, or he Fake Outs the other one."
 *
 * Those are two concretely different game states and both matter. The old model
 * picked ONE likely target from a heuristic - your speed control, else whoever
 * happened to be in slot one - which is not how the decision works. What
 * decides it is what stopping each of your Pokemon is worth to THEM: if your
 * Raichu would otherwise one-shot their Trick Room setter, flinching Raichu is
 * the right call even though the setter on YOUR side looks like the obvious
 * target.
 *
 * So both branches are simulated and scored, and both are reported. The one
 * that hurts most is the one to expect - and when they are close, the honest
 * answer is that it is a guess, which is different advice entirely.
 */
export function fakeOutReads(
  state: BattleState,
  moveProbability: (mon: MonState, move: string) => number
): FakeOutRead[] {
  const foes = (state.sides.opp.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);
  const mine = (state.sides.me.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);
  if (mine.length === 0) return [];

  // What each of mine would do with the turn if left alone. That is exactly
  // what the flinch takes away, so it is what the branch costs.
  const best = new Map<string, Line>();
  for (const line of rankedLines(state, "me")) {
    if (!best.has(line.attackerUid)) best.set(line.attackerUid, line);
  }
  const myPlan: Plan = {};
  for (const m of mine) {
    const l = best.get(m.uid);
    if (!l) continue;
    myPlan[m.uid] = l.spread
      ? { kind: "move", moveName: l.moveName }
      : { kind: "move", moveName: l.moveName, targetUid: l.targets[0]?.uid };
  }

  // Armor Tail and friends blank the whole priority bracket for my side, so
  // there is no Fake Out to call and no Protect worth spending on one. Checked
  // BEFORE the branches: without this the tool cheerfully reports two live
  // targets and a coinflip for a move that cannot land at all.
  const guard = blockedBySidePriorityGuard(state, "opp", "me", 3);

  const out: FakeOutRead[] = [];
  for (const foe of foes) {
    // Fake Out only works on the turn a Pokemon arrives.
    if (foe.turnsOnField > 0) continue;
    const p = moveProbability(foe, "Fake Out");
    if (p < 0.25) continue;

    if (guard) {
      out.push({
        by: foe,
        probability: p,
        branches: [],
        theirBest: null,
        closeCall: false,
        blockedBy: guard,
        text:
          `${nameOf(foe)} is ${Math.round(p * 100)}% to have Fake Out, but ${nameOf(guard.holder)}'s ` +
          `${guard.ability} blocks the whole priority bracket for your side - it cannot land on ` +
          `either of you. Do not spend a Protect on it.`,
      });
      continue;
    }

    const branches: FakeOutBranch[] = mine.map((target) => {
      const sim = simulateTurn(
        state,
        { ...myPlan, [foe.uid]: { kind: "move", moveName: "Fake Out", targetUid: target.uid } },
        { roll: "worstForMe", tie: "them" }
      );
      const line = best.get(target.uid) ?? null;
      const kills = line?.targets.filter((t) => t.result.verdict === "DEAD") ?? [];
      const pr = protectRead(target);

      return {
        target,
        deniedMove: line?.moveName ?? null,
        cost: !line
          ? `${nameOf(target)} had nothing queued`
          : kills.length > 0
            ? `${nameOf(target)} loses the KO on ${kills.map((k) => nameOf(k.target)).join(" and ")}`
            : `${nameOf(target)} loses its ${line.moveName}`,
        score: evaluate(sim.state),
        protectChance: pr.hasProtect ? pr.chance : 0,
      };
    });

    // Worst for me first - that is the branch they should choose.
    branches.sort((a, b) => a.score - b.score);
    const theirBest = branches[0] ?? null;
    const gap =
      branches.length > 1 ? Math.abs(branches[0].score - branches[1].score) : Infinity;
    const closeCall = branches.length > 1 && gap < CLOSE_CALL_MARGIN;

    const protectWord = (c: number) =>
      c >= 1 ? "Protect blanks it" : c > 0 ? `Protect only ${Math.round(c * 100)}%` : "no Protect";

    let text = `${nameOf(foe)} is ${Math.round(p * 100)}% to Fake Out, and both of yours are live targets. `;
    text += branches
      .map((b) => `Into ${nameOf(b.target)}: ${b.cost} (${protectWord(b.protectChance)})`)
      .join(". ");
    text += closeCall
      ? `. The two branches are close, so which one they pick is a guess - take the Protect you ` +
        `can afford and accept the other line.`
      : theirBest
        ? `. ${nameOf(theirBest.target)} costs you most, so expect it there` +
          (theirBest.protectChance >= 1
            ? ` - and its Protect is guaranteed, so calling it costs nothing if you are right.`
            : `.`)
        : `.`;

    out.push({ by: foe, probability: p, branches, theirBest, closeCall, blockedBy: null, text });
  }
  return out.sort((a, b) => b.probability - a.probability);
}
