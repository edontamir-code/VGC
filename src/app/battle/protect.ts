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

export interface FakeOutCall {
  /** Their Pokemon that can Fake Out. */
  by: MonState;
  /** 0-1 that it holds Fake Out at all. */
  probability: number;
  /** The one of mine it most wants to flinch. */
  likelyTarget: MonState | null;
  /** True when that target can Protect through it for free. */
  targetCanProtect: boolean;
  text: string;
}

/**
 * "If I think he is going to Fake Out, Protect the one he wants to hit."
 *
 * Fake Out is spent on whatever most needs stopping - the Pokemon that would
 * otherwise set your speed control or land the KO - so the likely target is the
 * one whose turn is worth the most. Protect on that Pokemon costs nothing when
 * its counter is fresh: it blocks the flinch, and if they guessed differently
 * you have still lost only a turn you were going to spend guessing anyway.
 */
export function fakeOutCalls(
  state: BattleState,
  moveProbability: (mon: MonState, move: string) => number
): FakeOutCall[] {
  const foes = (state.sides.opp.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);
  const mine = (state.sides.me.active.filter(Boolean) as string[])
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m) && !m.fainted);

  const out: FakeOutCall[] = [];
  for (const foe of foes) {
    // Fake Out only works on the turn a Pokemon arrives.
    if (foe.turnsOnField > 0) continue;
    const p = moveProbability(foe, "Fake Out");
    if (p < 0.25) continue;

    // Whoever's turn is worth stopping: the speed-control setter first, then
    // the faster attacker.
    const setter = mine.find((m) =>
      scout(m).arsenal.some((x) => x === "Trick Room" || x === "Tailwind")
    );
    const likelyTarget = setter ?? mine[0] ?? null;
    const read = likelyTarget ? protectRead(likelyTarget) : null;
    const canProtect = Boolean(read?.hasProtect && read.guaranteed);

    out.push({
      by: foe,
      probability: p,
      likelyTarget,
      targetCanProtect: canProtect,
      text:
        `${nameOf(foe)} is ${Math.round(p * 100)}% to Fake Out` +
        (likelyTarget
          ? `, and ${nameOf(likelyTarget)} is what it most wants to stop` +
            (setter ? ` - it is your speed control` : "")
          : "") +
        (canProtect && likelyTarget
          ? `. ${nameOf(likelyTarget)}'s Protect is guaranteed this turn, so calling the Fake Out ` +
            `costs you nothing if you are right and one turn if you are wrong.`
          : likelyTarget
            ? `. It cannot Protect through it${read && !read.guaranteed ? " reliably - it already protected" : ""}.`
            : "."),
    });
  }
  return out.sort((a, b) => b.probability - a.probability);
}
