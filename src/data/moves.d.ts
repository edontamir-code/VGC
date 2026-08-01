// Type declarations for src/data/moves.js — common Reg M-B moves.
import type { MoveCategory } from "../engine.js";

export interface MoveData {
  type: string;
  category: MoveCategory;
  power: number;
  /** Hits both foes in doubles (x0.75). */
  spread?: boolean;
  /** Eligible for Tough Claws. */
  contact?: boolean;
  priority?: number;
  /** Weather Ball: Normal/50 normally, weather's type at 100 BP in weather. */
  weatherBall?: boolean;
  /** Fixed extra modifier baked into this move on this set. */
  otherMult?: number;
  /** Power scaling rule, e.g. "last_respects". */
  scaling?: string;
  /** Always flinches the target (Fake Out). Read by the lead-risk model. */
  flinch?: boolean;
  /** Only usable on the turn the user switches in (Fake Out). */
  firstTurnOnly?: boolean;
  /** Speed stages this move drops on the target (Icy Wind, Electroweb). */
  lowersSpe?: number;
  note?: string;
}

export const MOVES: Record<string, MoveData>;

export function movePower(
  move: MoveData,
  ctx?: { faintedAllies?: number }
): number;
