// ===========================================================================
// When the order you recorded is IMPOSSIBLE.
//
// If what you saw cannot happen given the set we assume they have, then the
// assumption is wrong - and knowing which assumption is wrong is free scouting.
// A Whimsicott whose Protect did not go first probably does not have Prankster.
// A mon that outran something it cannot outrun is probably holding a Scarf.
//
// These are advisory. They never block recording a turn: you watched the game,
// the app did not.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { effectivePriority } from "../battle/moves.ts";
import { getMoveData } from "../battle/moves.ts";
import { activeProfile } from "../battle/stats.ts";
import {
  deriveObservations, speedCandidatesOf, speedRange,
} from "../battle/speedInference.ts";
import { effectiveSpeed } from "../../speed.js";
import { speedFieldOf, speedMonOf } from "../battle/speed.ts";

export interface Contradiction {
  kind: "priority" | "speed";
  text: string;
  /** The most likely wrong assumption, in plain words. */
  suggestion: string;
  /** Mon the suspect assumption belongs to, so the UI can link to it. */
  monUid: string | null;
}

const nameOf = (m: MonState) =>
  m.hasMega || !m.set.baseForm ? m.set.name : m.set.speciesId;

export interface OrderedAction {
  actorUid: string;
  moveName: string | null;
}

/**
 * Check a recorded order against the priority brackets and the Speed evidence.
 */
export function detectContradictions(
  state: BattleState,
  ordered: OrderedAction[]
): Contradiction[] {
  const out: Contradiction[] = [];
  const acts = ordered.filter((o) => state.mons[o.actorUid] && o.moveName);

  // --- 1. Priority inversions ---------------------------------------------
  for (let i = 0; i < acts.length; i++) {
    for (let j = i + 1; j < acts.length; j++) {
      const a = acts[i];
      const b = acts[j];
      const monA = state.mons[a.actorUid];
      const monB = state.mons[b.actorUid];
      const pa = effectivePriority(a.moveName!, monA);
      const pb = effectivePriority(b.moveName!, monB);
      if (pa >= pb) continue;

      // B was in a higher bracket but you recorded it later - impossible.
      const bIsStatus = !getMoveData(b.moveName!);
      const bAbility = activeProfile(monB).ability;
      let suggestion: string;
      let monUid: string | null = monB.uid;

      if (bIsStatus && bAbility === "Prankster") {
        suggestion =
          `${nameOf(monB)} may not actually have Prankster - without it, ${b.moveName} ` +
          `sits at priority ${pb - 1} and the order you saw is consistent.`;
      } else if (bIsStatus) {
        suggestion = `Check that ${nameOf(monB)} really used ${b.moveName}.`;
      } else {
        suggestion =
          `One of these moves is probably misidentified - ${b.moveName} is priority ` +
          `+${pb}, so it should have gone before ${a.moveName}.`;
        monUid = null;
      }

      out.push({
        kind: "priority",
        monUid,
        text:
          `You recorded ${nameOf(monA)} ${a.moveName} (priority ${pa}) before ` +
          `${nameOf(monB)} ${b.moveName} (priority +${pb}), but the higher bracket ` +
          `always moves first.`,
        suggestion,
      });
    }
  }

  // --- 2. No legal Speed fits ---------------------------------------------
  const field = speedFieldOf(state);
  const trickRoom = state.field.trickRoom > 0;

  for (const obs of deriveObservations(state, acts)) {
    const faster = state.mons[obs.fasterUid];
    const slower = state.mons[obs.slowerUid];
    const fasterKnown = faster.side === "me" || faster.revealed.sp;
    const slowerKnown = slower.side === "me" || slower.revealed.sp;
    if (fasterKnown === slowerKnown) continue;

    const unknown = fasterKnown ? slower : faster;
    const known = fasterKnown ? faster : slower;
    const knownSpeed = effectiveSpeed(speedMonOf(known), field);
    const candidates = speedCandidatesOf(unknown);

    const survives = candidates.filter((c) => {
      const e = effectiveSpeed({ ...speedMonOf(unknown), spe: c }, field);
      if (fasterKnown) return trickRoom ? e >= knownSpeed : e <= knownSpeed;
      return trickRoom ? e <= knownSpeed : e >= knownSpeed;
    });

    if (survives.length > 0) continue;

    const r = speedRange(unknown);
    out.push({
      kind: "speed",
      monUid: unknown.uid,
      text:
        `No legal Speed for ${nameOf(unknown)} fits this order. It would need to be ` +
        `${fasterKnown ? "slower" : "faster"} than ${nameOf(known)} (${knownSpeed}), ` +
        `but its possible range is ${r.min}-${r.max}.`,
      suggestion: fasterKnown
        ? `Something slowed it down - paralysis, an Icy Wind you have not recorded, or a Speed drop.`
        : `It is probably holding a Choice Scarf, or there is a Tailwind up that is not on the field yet.`,
    });
  }

  return out;
}
