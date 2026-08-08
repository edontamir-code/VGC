// ===========================================================================
// Which two should I lead?
//
// This is NOT the bring-four question and it must not be answered with the same
// machinery. The bring-four asks "who beats their six over a whole game"; the
// lead asks "who wins the first turn", and those pull in different directions.
// A Pokemon can be the best answer on the team and a terrible lead, and the
// reverse is more common still: Incineroar is one of the best leads in the
// format and it wins almost no 1v1s. It leads because it Intimidates the whole
// field and Fake Outs whatever most needed to move.
//
// So a lead is scored on what a lead actually does on turn one:
//
//   FAKE OUT      - only works the turn a Pokemon arrives, so leading is the
//                   only way to use it at full value
//   INTIMIDATE    - worth roughly the share of their team that attacks
//                   physically, and NEGATIVE into Defiant or Competitive
//   SPEED CONTROL - Tailwind or Trick Room from turn one
//   REDIRECTION   - Rage Powder / Follow Me protecting a setup partner
//   SURVIVING     - a lead that dies on turn one has done nothing, and this is
//                   where the KO race does belong: as a floor, not the goal
//
// Everything is measured against what they can actually bring, weighted by the
// usage data, rather than against a single guessed lead.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import { getMoveData } from "./moves.ts";
import { scout } from "./scouting.ts";
import { moveProbability } from "./inference.ts";
import { abilityCandidates } from "./candidates.ts";
import { activeProfile } from "./stats.ts";
import { sidePriorityGuard } from "./terrain.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

export type LeadFactorKind =
  | "fakeOut"
  | "intimidate"
  | "speedControl"
  | "redirect"
  | "survives"
  | "pressure"
  | "liability";

export interface LeadFactor {
  kind: LeadFactorKind;
  /** Positive helps, negative hurts. */
  points: number;
  text: string;
}

export interface LeadScore {
  pair: MonState[];
  score: number;
  factors: LeadFactor[];
  text: string;
}

// Weights. Deliberately in the same units as each other and nothing else -
// this ranks leads against leads, and the numbers mean nothing outside that.
const W = {
  fakeOut: 100,
  /** Multiplied by the share of their attackers that are physical. */
  intimidate: 160,
  /** Handing a Defiant/Competitive user a free boost. */
  intimidateBackfire: -140,
  speedControl: 90,
  redirect: 60,
  /** Per point of expected HP fraction surviving their best turn-1 shot. */
  survives: 120,
  pressure: 70,
};

/** Abilities that turn my Intimidate into their boost. */
const SPITE_ABILITIES = new Set(["Defiant", "Competitive"]);

/**
 * What share of their damage comes off the physical side, 0-1.
 *
 * This is what makes Intimidate good or useless, and it cannot be read off a
 * species list: a Charizard-Y team is almost entirely special, and Intimidate
 * into it does close to nothing. Weighted by how likely they are to actually
 * hold each move.
 */
export function physicalShare(state: BattleState): number {
  let phys = 0;
  let spec = 0;
  for (const foe of Object.values(state.mons)) {
    if (foe.side !== "opp" || foe.fainted || foe.brought === "out") continue;
    for (const moveName of scout(foe).arsenal) {
      const data = getMoveData(moveName);
      if (!data || data.power <= 0) continue;
      const p = moveProbability(foe, moveName);
      // Weight by power as well as probability: a 120 BP physical move matters
      // more to this question than a 40 BP one.
      const weight = p * data.power;
      if (data.category === "phys") phys += weight;
      else spec += weight;
    }
  }
  const total = phys + spec;
  return total > 0 ? phys / total : 0.5;
}

/** Their Pokemon that would punish an Intimidate. */
function spiteHolders(state: BattleState): MonState[] {
  return Object.values(state.mons).filter((m) => {
    if (m.side !== "opp" || m.fainted || m.brought === "out") return false;
    const cand = abilityCandidates(m);
    return cand.options.some((o) => SPITE_ABILITIES.has(o.name) && o.pct >= 30);
  });
}

/** The worst single hit they could land on this Pokemon on turn one, as a fraction of its HP. */
function worstIncoming(mon: MonState, state: BattleState): number {
  let worst = 0;
  for (const foe of Object.values(state.mons)) {
    if (foe.side !== "opp" || foe.fainted || foe.brought === "out") continue;
    for (const moveName of scout(foe).arsenal) {
      if (!getMoveData(moveName)) continue;
      const r = resolveMatchup(foe, mon, moveName, state);
      if (!r) continue;
      // Their maximum roll - the honest worst case for me.
      const frac = r.max / Math.max(1, mon.maxHP);
      if (frac > worst) worst = frac;
    }
  }
  return worst;
}

function has(mon: MonState, moves: string[]): string | null {
  const arsenal = scout(mon).arsenal;
  return moves.find((m) => arsenal.includes(m)) ?? null;
}

/** Score one candidate lead pair. */
export function scoreLeadPair(state: BattleState, a: MonState, b: MonState): LeadScore {
  const factors: LeadFactor[] = [];
  const physShare = physicalShare(state);
  const spite = spiteHolders(state);
  // Their Armor Tail / Queenly Majesty blanks my Fake Out before it happens.
  const priorityGuard = sidePriorityGuard(state, "opp");

  for (const mon of [a, b]) {
    // --- Fake Out --------------------------------------------------------
    if (has(mon, ["Fake Out"])) {
      if (priorityGuard) {
        factors.push({
          kind: "liability",
          points: 0,
          text: `${nameOf(mon)}'s Fake Out does nothing - ${priorityGuard.holder.set.name}'s ${priorityGuard.ability} blocks the whole priority bracket.`,
        });
      } else {
        factors.push({
          kind: "fakeOut",
          points: W.fakeOut,
          text: `${nameOf(mon)} has Fake Out, which only works the turn it arrives - leading is the only way to use it.`,
        });
      }
    }

    // --- Intimidate ------------------------------------------------------
    if (activeProfile(mon).ability === "Intimidate") {
      const pts = Math.round(W.intimidate * physShare);
      factors.push({
        kind: "intimidate",
        points: pts,
        text:
          `${nameOf(mon)}'s Intimidate hits both of theirs on entry, and ` +
          `${Math.round(physShare * 100)}% of their damage is physical` +
          (physShare < 0.35 ? " - so it is worth much less than usual here." : "."),
      });
      if (spite.length) {
        factors.push({
          kind: "liability",
          points: W.intimidateBackfire,
          text:
            `But ${spite.map((m) => nameOf(m)).join(" and ")} can have ` +
            `${spite.length === 1 ? "Defiant or Competitive" : "Defiant/Competitive"}, which answers ` +
            `your -1 with +2. Leading Intimidate into that makes them STRONGER.`,
        });
      }
    }

    // --- Speed control ---------------------------------------------------
    const sc = has(mon, ["Tailwind", "Trick Room"]);
    if (sc) {
      factors.push({
        kind: "speedControl",
        points: W.speedControl,
        text: `${nameOf(mon)} can set ${sc} from turn one, before anything has died.`,
      });
    }

    // --- Redirection -----------------------------------------------------
    const rd = has(mon, ["Rage Powder", "Follow Me"]);
    if (rd) {
      factors.push({
        kind: "redirect",
        points: W.redirect,
        text: `${nameOf(mon)} can ${rd} to protect whatever the partner is doing.`,
      });
    }

    // --- Surviving the turn ----------------------------------------------
    // A lead that dies on turn one has contributed nothing, whatever else it
    // brought. This is where the KO race belongs: as a floor, not the goal.
    const incoming = worstIncoming(mon, state);
    const survives = Math.max(0, 1 - incoming);
    factors.push({
      kind: "survives",
      points: Math.round(W.survives * survives),
      text:
        incoming >= 1
          ? `${nameOf(mon)} can be KO'd on turn one by their best hit - it may never act.`
          : `${nameOf(mon)} survives their hardest turn-one hit with ${Math.round(survives * 100)}% left.`,
    });
  }

  // --- Raw pressure: can this pair actually threaten anything? ------------
  let threats = 0;
  for (const mon of [a, b]) {
    for (const foe of Object.values(state.mons)) {
      if (foe.side !== "opp" || foe.fainted || foe.brought === "out") continue;
      for (const moveName of scout(mon).arsenal) {
        if (!getMoveData(moveName)) continue;
        const r = resolveMatchup(mon, foe, moveName, state);
        if (r && r.min >= foe.curHP) {
          threats++;
          break;
        }
      }
    }
  }
  if (threats > 0) {
    factors.push({
      kind: "pressure",
      points: Math.round(W.pressure * Math.min(2, threats)),
      text: `This pair already threatens ${threats} of their Pokemon with a clean KO.`,
    });
  }

  const score = factors.reduce((n, f) => n + f.points, 0);
  const best = [...factors].sort((x, y) => y.points - x.points)[0];

  return {
    pair: [a, b],
    score,
    factors,
    text: best ? best.text : `${nameOf(a)} + ${nameOf(b)}.`,
  };
}

/**
 * Rank every pair from the four I am bringing.
 *
 * Restricted to the brought four when that is known - suggesting a lead you
 * cannot legally send out is worse than saying nothing.
 */
export function suggestLeads(state: BattleState, from?: MonState[]): LeadScore[] {
  const pool =
    from ??
    Object.values(state.mons).filter((m) => m.side === "me" && !m.fainted);
  if (pool.length < 2) return [];

  const out: LeadScore[] = [];
  for (let i = 0; i < pool.length; i++) {
    for (let j = i + 1; j < pool.length; j++) {
      out.push(scoreLeadPair(state, pool[i], pool[j]));
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
