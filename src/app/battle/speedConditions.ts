// ===========================================================================
// Speed conditions you can create: Trick Room and Tailwind.
//
// Kept in their own module because BOTH the answer matrix and the conditional
// planner need them, and having answers.ts import conditions.ts while
// conditions.ts imports answers.ts is a cycle waiting to bite.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { scout } from "./scouting.ts";

export type SpeedCondition = "normal" | "trickRoom" | "tailwind";

export const CONDITION_LABEL: Record<SpeedCondition, string> = {
  normal: "as it stands",
  trickRoom: "under Trick Room",
  tailwind: "under Tailwind",
};

/** The move that creates each condition, for attribution. */
export const SETTER_MOVE: Record<Exclude<SpeedCondition, "normal">, string> = {
  trickRoom: "Trick Room",
  tailwind: "Tailwind",
};

/** The board as it would be with the given speed condition running. */
export function withCondition(state: BattleState, cond: SpeedCondition): BattleState {
  if (cond === "normal") {
    if (state.field.trickRoom === 0 && state.field.tailwind.me === 0) return state;
    return {
      ...state,
      field: { ...state.field, trickRoom: 0, tailwind: { ...state.field.tailwind, me: 0 } },
    };
  }
  if (cond === "trickRoom") {
    if (state.field.trickRoom > 0) return state;
    return { ...state, field: { ...state.field, trickRoom: 5 } };
  }
  if (state.field.tailwind.me > 0) return state;
  return { ...state, field: { ...state.field, tailwind: { ...state.field.tailwind, me: 4 } } };
}

/** My Pokemon that can actually create this condition. */
export function settersFor(state: BattleState, cond: SpeedCondition): MonState[] {
  if (cond === "normal") return [];
  const move = SETTER_MOVE[cond];
  return Object.values(state.mons).filter(
    (m) => m.side === "me" && !m.fainted && scout(m).arsenal.includes(move)
  );
}
