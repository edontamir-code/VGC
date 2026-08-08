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
  /**
   * Stat stages this move applies to the USER after it lands.
   * Close Combat is { def: -1, spd: -1 }. Contrary inverts these, which is why
   * a Contrary Staraptor gets bulkier every time it attacks.
   */
  selfStages?: Partial<Record<"atk" | "def" | "spa" | "spd" | "spe", number>>;
  /** Stat stages this move applies to whatever it hits. */
  targetStages?: Partial<Record<"atk" | "def" | "spa" | "spd" | "spe", number>>;
  /** Ignores accuracy and evasion checks entirely (Kowtow Cleave, Aerial Ace). */
  neverMisses?: boolean;
  /** Percent accuracy. Absent means it always hits. No Guard overrides it. */
  accuracy?: number;
  /** The user loses its next turn entirely (Hyper Beam). */
  recharge?: boolean;
  note?: string;
}

export const MOVES: Record<string, MoveData>;

export function movePower(
  move: MoveData,
  ctx?: { faintedAllies?: number }
): number;
