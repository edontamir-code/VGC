// ===========================================================================
// Non-damaging (or not-yet-modelled) moves. DATA ONLY.
// moves.js deliberately covers attacking moves; these entries let the resolver
// describe the rest of a set honestly instead of dropping it.
// ===========================================================================
export interface StatusMoveInfo {
  effect: string;
  priority?: number;
  /** Field effect it sets, so the turn tracker can offer a one-tap toggle. */
  sets?: "tailwind" | "trickRoom" | "reflect" | "lightScreen" | "auroraVeil";
  protects?: boolean;
  /** Locks the target into its last move (Encore). */
  encores?: boolean;
  /** Pulls single-target attacks onto the user (Rage Powder, Follow Me). */
  redirects?: boolean;
  /** Targets a foe rather than the user. */
  targetsFoe?: boolean;
  /**
   * True when the simulator actually carries this out. Anything without it is
   * reported as unsimulated rather than silently treated as a no-op.
   */
  simulated?: boolean;
}

export const STATUS_MOVES: Record<string, StatusMoveInfo> = {
  Protect: { effect: "Blocks everything this turn (fails if used consecutively).", protects: true, priority: 4, simulated: true },
  "Spiky Shield": { effect: "Protects and chips contact attackers.", protects: true, priority: 4, simulated: true },
  Detect: { effect: "Protect by another name.", protects: true, priority: 4, simulated: true },
  Tailwind: { effect: "Doubles your side's Speed.", sets: "tailwind", simulated: true },
  "Trick Room": { effect: "Reverses the Speed order.", sets: "trickRoom", priority: -7, simulated: true },
  "Light Screen": { effect: "Halves special damage on your side.", sets: "lightScreen", simulated: true },
  Reflect: { effect: "Halves physical damage on your side.", sets: "reflect", simulated: true },
  "Aurora Veil": { effect: "Halves both, in snow.", sets: "auroraVeil", simulated: true },
  Encore: {
    effect: "Locks the target into the move it just used for 3 turns.",
    encores: true,
    targetsFoe: true,
    simulated: true,
  },
  Roost: { effect: "Recovers 50% HP." },
  Substitute: { effect: "Sets a 25% HP substitute." },
  Charm: { effect: "Lowers the target's Attack by 2." },
  "Nasty Plot": { effect: "Raises the user's SpA by 2." },
  "Swords Dance": { effect: "Raises the user's Attack by 2." },
  "Helping Hand": { effect: "Boosts the ally's move by 1.5x this turn.", priority: 5 },
  Taunt: { effect: "Blocks the target's status moves for 3 turns.", targetsFoe: true },
  "Calm Mind": { effect: "Raises the user's SpA and SpD by 1." },
  "Strength Sap": { effect: "Lowers the target's Attack by 1 and heals by that amount.", targetsFoe: true },
  Trick: { effect: "Swaps items with the target.", targetsFoe: true },
  Imprison: { effect: "Blocks the foes from using moves the user also knows." },
  "Will-O-Wisp": { effect: "Burns the target - halves its physical damage.", targetsFoe: true },
  "Fake Tears": { effect: "Lowers the target's SpD by 2.", targetsFoe: true },
  Tickle: { effect: "Lowers the target's Attack and Defence by 1.", targetsFoe: true },
  "Sunny Day": { effect: "Sets sun for 5 turns." },
  "Rain Dance": { effect: "Sets rain for 5 turns." },
  "Dragon Dance": { effect: "Raises the user's Attack and Speed by 1." },
  "Final Gambit": { effect: "The user faints, dealing damage equal to its remaining HP.", targetsFoe: true },
  Coaching: { effect: "Raises the ALLY's Attack and Defence by 1." },
  "Scary Face": { effect: "Lowers the target's Speed by 2.", targetsFoe: true },
  Yawn: { effect: "Puts the target to sleep at the end of the next turn.", targetsFoe: true },
  Disable: { effect: "Blocks the target's last move for 4 turns.", targetsFoe: true },
  // Fake Out, Ice Fang, Icy Wind and Electroweb now live in moves.js with real
  // damage numbers, so they are deliberately NOT listed here.
  "Parting Shot": { effect: "Lowers the target's Atk and SpA by 1, then switches out." },
  "Rage Powder": {
    effect: "Redirects single-target attacks to the user.",
    priority: 2,
    redirects: true,
    simulated: true,
  },
  "Follow Me": {
    effect: "Redirects single-target attacks to the user.",
    priority: 2,
    redirects: true,
    simulated: true,
  },
  "Wide Guard": { effect: "Blocks spread moves against the user's side this turn.", priority: 3 },
  "Life Dew": { effect: "Heals the user and its ally by 25%." },
  "Bulk Up": { effect: "Raises the user's Attack and Defence by 1." },
  "Quick Guard": { effect: "Blocks priority moves against the user's side.", priority: 3 },
  "Dire Claw": { effect: "Physical Poison, 80 BP - chance of poison/paralysis/sleep." },
};

export function isStatusMove(name: string): boolean {
  return name in STATUS_MOVES;
}
