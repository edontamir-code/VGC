// ===========================================================================
// Learning their Speed from the order things actually happened.
//
// This is the highest-value inference in the app and it costs nothing to
// collect: you already know the order, because you watched it.
//
// If two Pokemon act in the same priority bracket and yours went first, then
// (outside Trick Room) yours was at least as fast. Your own Speed is known
// exactly, so that is a hard bound on theirs. Every turn narrows it further,
// and a narrower Speed range means a narrower SP spread, which tightens every
// damage calc that depends on their investment.
//
// Soundness: an exact tie is resolved randomly, so "A went first" only proves
// A >= B, never A > B. We use >=, which never rules out a spread they could
// actually be running.
// ===========================================================================
import { statOther } from "../../engine.js";
import { effectiveSpeed } from "../../speed.js";
import type { BattleState, MonState } from "../model/types.ts";
import { SP_MAX_PER_STAT } from "./stats.ts";
import { speedMonOf, speedFieldOf } from "./speed.ts";
import { effectivePriority } from "./moves.ts";
import { activeProfile } from "./stats.ts";

/** Every raw Speed stat this species could legally have. */
export function possibleSpeedStats(mon: MonState): number[] {
  const base = activeProfile(mon).base.spe;
  const out = new Set<number>();
  for (const nature of [0.9, 1.0, 1.1]) {
    for (let sp = 0; sp <= SP_MAX_PER_STAT; sp++) {
      out.add(statOther(base, sp, nature));
    }
  }
  return [...out].sort((a, b) => a - b);
}

/** The candidate set we are currently working with. */
export function speedCandidatesOf(mon: MonState): number[] {
  if (mon.speedCandidates && mon.speedCandidates.length) return mon.speedCandidates;
  // Our own mons are known exactly.
  if (mon.side === "me" || mon.revealed.sp) {
    const p = activeProfile(mon);
    return [statOther(p.base.spe, mon.set.sp.spe ?? 0, natureMultOf(mon))];
  }
  return possibleSpeedStats(mon);
}

function natureMultOf(mon: MonState): number {
  if (mon.set.nature.plus === "spe") return 1.1;
  if (mon.set.nature.minus === "spe") return 0.9;
  return 1.0;
}

/** Effective speed for a hypothetical raw Speed stat, under the given field. */
function effFor(mon: MonState, rawSpe: number, state: BattleState): number {
  return effectiveSpeed({ ...speedMonOf(mon), spe: rawSpe }, speedFieldOf(state));
}

export interface OrderObservation {
  fasterUid: string;
  slowerUid: string;
  /** Priority bracket both were in - only same-bracket pairs are informative. */
  bracket: number;
}

/**
 * Derive the informative pairs from an observed action order.
 * Only adjacent same-bracket pairs are used; a higher-priority move going first
 * says nothing about Speed.
 */
export function deriveObservations(
  state: BattleState,
  ordered: { actorUid: string; moveName: string | null }[]
): OrderObservation[] {
  const out: OrderObservation[] = [];
  const withPriority = ordered
    .filter((o) => state.mons[o.actorUid])
    .map((o) => ({
      uid: o.actorUid,
      priority: o.moveName ? effectivePriority(o.moveName, state.mons[o.actorUid]) : 0,
    }));

  for (let i = 0; i < withPriority.length; i++) {
    for (let j = i + 1; j < withPriority.length; j++) {
      const a = withPriority[i];
      const b = withPriority[j];
      if (a.priority !== b.priority) continue;
      if (state.mons[a.uid].side === state.mons[b.uid].side) continue; // same side tells us nothing new
      out.push({ fasterUid: a.uid, slowerUid: b.uid, bracket: a.priority });
    }
  }
  return out;
}

/**
 * Narrow the opponent's possible Speed stats using one observation.
 * Returns only the mons whose candidate set actually changed.
 */
export function applyObservations(
  state: BattleState,
  observations: OrderObservation[]
): Record<string, number[]> {
  const updates: Record<string, number[]> = {};
  const trickRoom = state.field.trickRoom > 0;

  const current = (uid: string) =>
    updates[uid] ?? speedCandidatesOf(state.mons[uid]);

  for (const obs of observations) {
    const faster = state.mons[obs.fasterUid];
    const slower = state.mons[obs.slowerUid];
    if (!faster || !slower) continue;

    const fasterKnown = faster.side === "me" || faster.revealed.sp;
    const slowerKnown = slower.side === "me" || slower.revealed.sp;

    // Only useful when exactly one side of the pair is unknown.
    if (fasterKnown === slowerKnown) continue;

    if (slowerKnown) {
      // The UNKNOWN mon moved first: it is at least as fast as the known one.
      const threshold = effFor(slower, current(slower.uid)[0], state);
      const kept = current(faster.uid).filter((c) => {
        const e = effFor(faster, c, state);
        return trickRoom ? e <= threshold : e >= threshold;
      });
      if (kept.length && kept.length < current(faster.uid).length) updates[faster.uid] = kept;
    } else {
      // The unknown mon moved SECOND: it is no faster than the known one.
      const threshold = effFor(faster, current(faster.uid)[0], state);
      const kept = current(slower.uid).filter((c) => {
        const e = effFor(slower, c, state);
        return trickRoom ? e >= threshold : e <= threshold;
      });
      if (kept.length && kept.length < current(slower.uid).length) updates[slower.uid] = kept;
    }
  }

  return updates;
}

export interface SpeedRange {
  min: number;
  max: number;
  /** Raw stat candidates remaining. 1 = pinned exactly. */
  candidates: number;
  known: boolean;
}

/** Their raw Speed stat, as far as we currently know it. */
export function speedRange(mon: MonState): SpeedRange {
  const c = speedCandidatesOf(mon);
  return {
    min: c[0],
    max: c[c.length - 1],
    candidates: c.length,
    known: c.length === 1,
  };
}

/** Their effective in-battle Speed range under the current field. */
export function effectiveSpeedRange(mon: MonState, state: BattleState): SpeedRange {
  const c = speedCandidatesOf(mon).map((raw) => effFor(mon, raw, state));
  const sorted = [...new Set(c)].sort((a, b) => a - b);
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    candidates: sorted.length,
    known: sorted.length === 1,
  };
}

/**
 * Do I outspeed them, given everything observed so far?
 * "always" / "never" / "unknown" - and unknown is reported, never guessed.
 */
export function outspeedVerdict(
  mine: MonState,
  theirs: MonState,
  state: BattleState
): { verdict: "always" | "never" | "unknown"; mySpeed: number; theirRange: SpeedRange } {
  const mySpeed = effectiveSpeed(speedMonOf(mine), speedFieldOf(state));
  const theirRange = effectiveSpeedRange(theirs, state);
  const tr = state.field.trickRoom > 0;

  const fasterWins = !tr;
  if (fasterWins) {
    if (mySpeed > theirRange.max) return { verdict: "always", mySpeed, theirRange };
    if (mySpeed < theirRange.min) return { verdict: "never", mySpeed, theirRange };
  } else {
    if (mySpeed < theirRange.min) return { verdict: "always", mySpeed, theirRange };
    if (mySpeed > theirRange.max) return { verdict: "never", mySpeed, theirRange };
  }
  return { verdict: "unknown", mySpeed, theirRange };
}
