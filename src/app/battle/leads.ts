// ===========================================================================
// Turn 0 to turn 1: the leads.
//
// Team preview shows you six each; the lead pair is the first real information
// either player gives up, and it is where most opponents commit to a plan.
// Whimsicott out front is a Tailwind. Farigiraf out front is a Trick Room.
// Incineroar is a Fake Out and an Intimidate. Those are not four separate
// matchups, they are four different games, and the choice you make on turn 1 -
// press, deny, set up your own speed control, or get out - largely decides
// which one you end up playing.
//
// So this reads the lead pair as a PLAN rather than as two Pokemon:
//
//   - what their leads are most likely trying to do, weighted by usage
//   - whether they beat you to it if you are trying the same thing
//   - what turn 1 specifically makes possible that no later turn does
//     (Fake Out only exists on the turn a Pokemon arrives)
//
// Everything is driven off the usage-weighted move probabilities rather than a
// hardcoded list of species, so it keeps working for Pokemon nobody has written
// a special case for.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { moveProbability, probabilityOfAny } from "./inference.ts";
import { activeMons } from "./resolver.ts";
import { effectiveSpeed } from "../../speed.js";
import { rawStats, activeProfile } from "./stats.ts";
import { scout } from "./scouting.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

/** Below this, a plan is a guess rather than a read, and is not reported. */
export const PLAN_CUTOFF = 0.25;

export type LeadPlanKind =
  | "tailwind"
  | "trickRoom"
  | "fakeOut"
  | "redirect"
  | "screens"
  | "weather"
  | "hazards"
  | "pressure";

export interface LeadPlan {
  kind: LeadPlanKind;
  /** The Pokemon that carries it. */
  by: MonState;
  /** 0-1, from the usage-weighted move distribution. */
  probability: number;
  /** The move (or ability) that would do it. */
  via: string;
  text: string;
  /** What beats it, phrased as an instruction. */
  counter: string | null;
}

/** Move sets that constitute each plan. */
const PLAN_MOVES: Record<Exclude<LeadPlanKind, "pressure" | "weather">, string[]> = {
  tailwind: ["Tailwind"],
  trickRoom: ["Trick Room"],
  fakeOut: ["Fake Out"],
  redirect: ["Rage Powder", "Follow Me"],
  screens: ["Reflect", "Light Screen", "Aurora Veil"],
  hazards: ["Stealth Rock", "Spikes", "Toxic Spikes", "Sticky Web"],
};

const PLAN_LABEL: Record<LeadPlanKind, string> = {
  tailwind: "Tailwind",
  trickRoom: "Trick Room",
  fakeOut: "Fake Out",
  redirect: "redirection",
  screens: "screens",
  weather: "weather",
  hazards: "hazards",
  pressure: "straight pressure",
};

/** The likeliest move from a set, for naming the threat concretely. */
function likeliestOf(mon: MonState, moves: string[]): { move: string; p: number } {
  let best = { move: moves[0], p: 0 };
  for (const m of moves) {
    const p = moveProbability(mon, m);
    if (p > best.p) best = { move: m, p };
  }
  return best;
}

/**
 * Who moves first between two Pokemon right now, using their best-guess Speed.
 *
 * At turn 1 nothing has been observed, so this is the assumed spread - stated
 * as such wherever it is used, because "you outspeed" on an assumption is not
 * the same claim as "you outspeed" on a measurement.
 */
function fasterThan(a: MonState, b: MonState, state: BattleState): boolean {
  const spe = (m: MonState) =>
    effectiveSpeed(
      {
        spe: rawStats(m).spe,
        item: m.itemActive ? m.set.item : "",
        ability: activeProfile(m).ability,
        status: m.status,
        side: m.side,
        stages: m.stages,
        unburdened: m.unburdened,
      },
      {
        weather: state.field.weather?.kind ?? null,
        trickRoom: state.field.trickRoom > 0,
        tailwind: (["me", "opp"] as SideId[]).filter((s) => state.field.tailwind[s] > 0),
      }
    );
  const sa = spe(a);
  const sb = spe(b);
  return state.field.trickRoom > 0 ? sa < sb : sa > sb;
}

/** Do I have this plan available on my side, and on which Pokemon? */
function mineWith(state: BattleState, moves: string[]): MonState | null {
  for (const m of activeMons(state, "me")) {
    if (scout(m).arsenal.some((x) => moves.includes(x))) return m;
  }
  return null;
}

/** What is their lead pair trying to do? */
export function readLeads(state: BattleState): LeadPlan[] {
  const foes = activeMons(state, "opp");
  const out: LeadPlan[] = [];

  for (const foe of foes) {
    // Weather is an ability, not a move - it happens whether they like it or not.
    if (foe.set.setsWeather) {
      out.push({
        kind: "weather",
        by: foe,
        probability: 1,
        via: activeProfile(foe).ability,
        text:
          `${nameOf(foe)} sets ${foe.set.setsWeather} the moment it comes in. Every Fire and ` +
          `Water calc on the board is already conditioned on it.`,
        counter: "Bring your own weather setter in, or play around the boosted side.",
      });
    }

    for (const kind of Object.keys(PLAN_MOVES) as (keyof typeof PLAN_MOVES)[]) {
      const p = probabilityOfAny(foe, PLAN_MOVES[kind]);
      if (p < PLAN_CUTOFF) continue;
      const { move } = likeliestOf(foe, PLAN_MOVES[kind]);

      let text: string;
      let counter: string | null = null;

      switch (kind) {
        case "tailwind": {
          const mine = mineWith(state, ["Tailwind"]);
          text = `${nameOf(foe)} ${Math.round(p * 100)}% Tailwind lead.`;
          // Tailwind is a SIDE effect: both teams can have one up at once and
          // neither replaces the other. That mechanic used to be spelled out
          // here every game; what changes turn to turn is only whether you
          // have an answer on the field.
          counter = mine
            ? `${nameOf(mine)} can match it - a turn spent matching only restores parity.`
            : `No Tailwind on your side: deny it or accept being slower for four turns.`;
          break;
        }
        case "trickRoom": {
          text = `${nameOf(foe)} ${Math.round(p * 100)}% Trick Room lead.`;
          counter = `Deny it - Trick Room is -7 priority, so Fake Out, Taunt or a KO all land first.`;
          break;
        }
        case "fakeOut": {
          // The percentage is the only part of this that is not general
          // knowledge - what Fake Out does does not need restating.
          text = `${nameOf(foe)} ${Math.round(p * 100)}% Fake Out.`;
          counter = null;
          break;
        }
        case "redirect": {
          text =
            `${nameOf(foe)} is ${Math.round(p * 100)}% to carry ${move}, which pulls your ` +
            `single-target attacks onto it and away from what you meant to hit.`;
          counter = `Spread moves ignore it. So does KOing the redirector first.`;
          break;
        }
        case "screens": {
          text =
            `${nameOf(foe)} is ${Math.round(p * 100)}% to set ${move}. That is roughly a third ` +
            `off your damage for five turns and it turns your KOs into 2HKOs.`;
          counter = `Set up alongside it, or pressure the setter before it goes up.`;
          break;
        }
        default: {
          text =
            `${nameOf(foe)} is ${Math.round(p * 100)}% to lead ${move}.`;
          counter = null;
        }
      }

      out.push({ kind, by: foe, probability: p, via: move, text, counter });
    }
  }

  // Nothing setup-shaped on either lead means the lead is there to hit you.
  if (out.length === 0 && foes.length > 0) {
    out.push({
      kind: "pressure",
      by: foes[0],
      probability: 1,
      via: "attacks",
      text:
        `Neither lead looks like setup - no Tailwind, Trick Room or screens above ` +
        `${Math.round(PLAN_CUTOFF * 100)}%. Expect them to just attack, and play the damage race.`,
      counter: null,
    });
  }

  return out.sort((a, b) => b.probability - a.probability);
}

// ---------------------------------------------------------------------------
// The speed-control race
// ---------------------------------------------------------------------------

export interface SpeedRace {
  /** The plan both sides want. */
  kind: "tailwind" | "trickRoom";
  mine: MonState;
  theirs: MonState;
  /** True when my setter's move RESOLVES first. */
  iResolveFirst: boolean;
  /** True when this is a genuine race - only Trick Room is. */
  contested: boolean;
  /** Speed is assumed, not observed, on turn 1. */
  assumed: boolean;
  text: string;
}

/**
 * When both sides want the same speed control, who actually wins?
 *
 * These two are NOT symmetric, and getting them the same way round is the sort
 * of error that costs a game:
 *
 *   TAILWIND    is a SIDE effect. Both teams can have one running at the same
 *               time and neither replaces the other. There is no race. Matching
 *               theirs restores the Speed matchup; it does not remove theirs.
 *
 *   TRICK ROOM  is a FIELD effect and it TOGGLES. Setting it while it is
 *               already up turns it off. Both uses sit at -7 priority, and the
 *               field is still normal when the bracket resolves, so the FASTER
 *               setter moves first and the SLOWER one resolves second - which
 *               means the slower setter is the one that ends up deciding.
 */
export function speedRaces(state: BattleState): SpeedRace[] {
  const races: SpeedRace[] = [];
  for (const kind of ["tailwind", "trickRoom"] as const) {
    const move = kind === "tailwind" ? "Tailwind" : "Trick Room";
    const mine = mineWith(state, [move]);
    if (!mine) continue;
    const theirs = activeMons(state, "opp").find(
      (f) => moveProbability(f, move) >= PLAN_CUTOFF
    );
    if (!theirs) continue;

    // Within the -7 bracket the field is not yet inverted, so ordinary Speed
    // order applies: faster moves first.
    const iResolveFirst = fasterThan(mine, theirs, state);

    // Only the CONSEQUENCE, not the rule behind it. That Tailwinds coexist and
    // Trick Rooms toggle is format knowledge; which of these two setters
    // resolves second on this board is not, and it is the whole read.
    const text =
      kind === "tailwind"
        ? `Both sides have Tailwind - they do not cancel, so matching only restores parity.`
        : iResolveFirst
          ? `Trick Room war: ${nameOf(mine)} is faster, so ${nameOf(theirs)} resolves second ` +
            `and switches yours straight off. Deny it or wait.`
          : `Trick Room war: ${nameOf(mine)} is slower, so yours resolves second and cancels ` +
            `theirs. You want to be the slower setter here.`;

    races.push({
      kind,
      mine,
      theirs,
      iResolveFirst,
      contested: kind === "trickRoom",
      assumed: !theirs.revealed.sp,
      text,
    });
  }
  return races;
}

// ---------------------------------------------------------------------------
// The opening decision
// ---------------------------------------------------------------------------

export interface OpeningRead {
  /** Is this actually turn 1 with both leads on the board? */
  isLeadTurn: boolean;
  plans: LeadPlan[];
  races: SpeedRace[];
  /** Things that are only true on the turn a Pokemon arrives. */
  turnOneOnly: string[];
  headline: string;
}

export function openingRead(state: BattleState): OpeningRead {
  const foes = activeMons(state, "opp");
  const mine = activeMons(state, "me");
  const isLeadTurn =
    state.turn === 1 &&
    foes.length > 0 &&
    mine.length > 0 &&
    foes.every((f) => f.turnsOnField === 0) &&
    mine.every((m) => m.turnsOnField === 0);

  const plans = foes.length ? readLeads(state) : [];
  const races = foes.length ? speedRaces(state) : [];

  // Turn-one-only notes.
  //
  // "Fake Out only works on turn one" and "Fake Out is a cheap way to stop
  // Trick Room" are rules of the game, not reads on this board. Anyone using
  // this tool already knows them, and printing them beside every lead is how a
  // useful panel turns into wallpaper - by the third game the real warnings are
  // being skipped along with these.
  //
  // What is worth saying is the part that needs the board: WHO specifically is
  // worth flinching, which depends on what they are about to do.
  const turnOneOnly: string[] = [];
  if (isLeadTurn) {
    const myFO = mine.filter((m) => scout(m).arsenal.includes("Fake Out"));
    const setters = foes.filter(
      (f) =>
        moveProbability(f, "Trick Room") >= PLAN_CUTOFF ||
        moveProbability(f, "Tailwind") >= PLAN_CUTOFF
    );
    if (myFO.length && setters.length) {
      turnOneOnly.push(
        `${nameOf(myFO[0])} Fake Out stops ${setters.map(nameOf).join(" or ")} setting up.`
      );
    }
  }

  // The headline names their GAME PLAN, which is a setup move. Fake Out and
  // redirection are support - they protect the plan, they are not the plan -
  // and letting them take the headline buries the thing you actually have to
  // decide about.
  const PLAN_SHAPED: LeadPlanKind[] = ["trickRoom", "tailwind", "weather", "screens", "hazards"];
  const top =
    plans.find((p) => PLAN_SHAPED.includes(p.kind)) ?? plans[0];
  const headline = !isLeadTurn
    ? "Not the lead turn - these reads are about the Pokemon currently out."
    : top
      ? `Their lead reads as ${PLAN_LABEL[top.kind]}${
          top.probability < 1 ? ` (${Math.round(top.probability * 100)}%)` : ""
        }. Decide now whether you press it, deny it, or get out.`
      : "Enter their leads to get the opening read.";

  return { isLeadTurn, plans, races, turnOneOnly, headline };
}
