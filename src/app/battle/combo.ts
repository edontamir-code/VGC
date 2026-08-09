// ===========================================================================
// What can my two Pokemon do TOGETHER this turn?
//
// The calc grid prices each move on its own, which is how a damage calculator
// works and is not how doubles works. The question in front of you is never
// "what does Hyper Voice do" - it is "Helping Hand + Hyper Voice, or Psychic +
// Hyper Voice, and which of those actually removes something".
//
// Two things only show up when the pair is evaluated as one play:
//
//   - Helping Hand is worth nothing by itself and 1.5x on the partner's move.
//     Priced separately it is always the worst option on the board.
//   - A Focus Sash survives ONE hit. Two attacks into the same target means
//     the second one kills through it. No single-move calc can see that,
//     which is exactly why "Psychic + Hyper Voice covers for Sash" is a real
//     read and an invisible one.
//
// Damage uses my WORST rolls throughout, so a KO reported here is a KO.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { activeMons } from "./resolver.ts";
import { activeProfile } from "./stats.ts";
import { resolveMatchup } from "./damage.ts";
import { getMoveData } from "./moves.ts";
import { effectiveAccuracy } from "./abilities.ts";
import { STATUS_MOVES } from "./statusMoves.ts";
import { effectivePriority } from "./moves.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

/** One Pokemon's half of a joint play. */
export interface ComboAction {
  attackerUid: string;
  attackerName: string;
  moveName: string;
  /** undefined for spread moves and self-targeting moves. */
  targetUid?: string;
  /** True when this half is Helping Hand supporting the partner. */
  isHelpingHand: boolean;
}

export interface ComboTarget {
  uid: string;
  name: string;
  /** Percentage of the target's CURRENT hp, worst rolls. */
  minPct: number;
  maxPct: number;
  /** Dies at my worst rolls, with the Sash already accounted for. */
  ko: boolean;
  /** A Focus Sash held it on 1 HP and nothing followed up. */
  sashHeld: boolean;
  /** The second hit went through a Sash the first hit broke. */
  brokeSash: boolean;
}

export interface ComboPlay {
  actions: ComboAction[];
  label: string;
  targets: ComboTarget[];
  /** Guaranteed KOs at my worst rolls. */
  kos: number;
  koNames: string[];
  /** Product of every move's accuracy, 0-1. */
  reliability: number;
  /** Worst-roll damage across everything, as a share of full health bars. */
  boardMin: number;
  /** One line, in the terms you would say it out loud. */
  text: string;
}

/** Damage a single action contributes to each target, at the worst roll. */
interface Contribution {
  targetUid: string;
  min: number;
  max: number;
}

function contributionsOf(
  attacker: MonState,
  moveName: string,
  targetUid: string | undefined,
  state: BattleState,
  helpingHand: boolean
): { hits: Contribution[]; accuracy: number } {
  const data = getMoveData(moveName);
  if (!data) return { hits: [], accuracy: 100 };

  const foes = activeMons(state, attacker.side === "me" ? "opp" : "me");
  const targets = data.spread
    ? foes
    : foes.filter((f) => f.uid === targetUid);

  const hits: Contribution[] = [];
  let accuracy = 100;
  for (const foe of targets) {
    const r = resolveMatchup(attacker, foe, moveName, state, helpingHand ? { helpingHand: true } : {});
    if (!r || r.typeMult === 0) continue;
    hits.push({ targetUid: foe.uid, min: r.min, max: r.max });
    accuracy = effectiveAccuracy(data.accuracy, attacker, foe).accuracy;
  }
  return { hits, accuracy };
}

/**
 * Resolve every hit onto one target IN ORDER, so a Focus Sash behaves the way
 * it does in game: it saves the holder from the first lethal hit and from
 * nothing after that.
 */
function resolveTarget(
  mon: MonState,
  hits: { min: number; max: number }[]
): ComboTarget {
  const sashWasLive =
    mon.set.item === "Focus Sash" && mon.itemActive && mon.curHP === mon.maxHP;
  // Would any ONE of these hits have been stopped by the Sash on its own? That
  // is the whole question. If no single hit was lethal from full the Sash was
  // never going to matter, and claiming to have played through it would be a
  // boast about beating something that was not there.
  const singleHitWouldSash = sashWasLive && hits.some((h) => h.min >= mon.curHP);

  let sashLive = sashWasLive;
  let hp = mon.curHP;
  let totalMin = 0;
  let totalMax = 0;
  let sashHeld = false;

  for (const h of hits) {
    totalMin += h.min;
    totalMax += h.max;
    if (sashLive && hp === mon.maxHP && h.min >= hp) {
      hp = 1;
      sashLive = false;
      sashHeld = true;
      continue;
    }
    hp -= h.min;
    if (hp <= 0) break;
  }

  // Killed a Sash holder that a single one of these moves could not have
  // killed. This is the read that no per-move calc can produce, and it is
  // exactly why the second attack goes into the same target.
  const brokeSash = singleHitWouldSash && hp <= 0;
  if (brokeSash) sashHeld = false;

  return {
    uid: mon.uid,
    name: nameOf(mon),
    minPct: mon.curHP > 0 ? (totalMin / mon.curHP) * 100 : 0,
    maxPct: mon.curHP > 0 ? (totalMax / mon.curHP) * 100 : 0,
    ko: hp <= 0,
    sashHeld,
    brokeSash,
  };
}

/** Every action one of my Pokemon could contribute to a joint play. */
function optionsFor(mon: MonState, state: BattleState): ComboAction[] {
  const out: ComboAction[] = [];
  const foes = activeMons(state, mon.side === "me" ? "opp" : "me");

  for (const moveName of mon.set.moves) {
    if (!moveName) continue;
    if (moveName === "Helping Hand") {
      out.push({
        attackerUid: mon.uid,
        attackerName: nameOf(mon),
        moveName,
        isHelpingHand: true,
      });
      continue;
    }
    const data = getMoveData(moveName);
    if (!data) {
      // Non-damaging moves are real plays, but they contribute no damage and
      // would fill the list with pairs that threaten nothing. Protect is the
      // exception worth keeping - see the caller.
      continue;
    }
    if (data.firstTurnOnly && mon.turnsOnField > 0) continue;
    if (data.spread) {
      out.push({ attackerUid: mon.uid, attackerName: nameOf(mon), moveName, isHelpingHand: false });
      continue;
    }
    for (const foe of foes) {
      out.push({
        attackerUid: mon.uid,
        attackerName: nameOf(mon),
        moveName,
        targetUid: foe.uid,
        isHelpingHand: false,
      });
    }
  }
  return out;
}

function labelOf(a: ComboAction, state: BattleState): string {
  if (a.isHelpingHand) return `${a.attackerName}: Helping Hand`;
  const t = a.targetUid ? state.mons[a.targetUid] : null;
  return t ? `${a.attackerName}: ${a.moveName} -> ${nameOf(t)}` : `${a.attackerName}: ${a.moveName}`;
}

/**
 * Every joint play my two actives have, scored on what it removes.
 *
 * Capped, because two Pokemon with four moves each into two targets is already
 * a few hundred pairs and the tail is all noise.
 */
export function comboPlays(state: BattleState, limit = 8): ComboPlay[] {
  const mine = activeMons(state, "me");
  const foes = activeMons(state, "opp");
  if (mine.length < 2 || foes.length === 0) return [];

  const [a, b] = mine;
  const optsA = optionsFor(a, state);
  const optsB = optionsFor(b, state);
  const plays: ComboPlay[] = [];

  for (const oa of optsA) {
    for (const ob of optsB) {
      // Two Helping Hands boost nothing.
      if (oa.isHelpingHand && ob.isHelpingHand) continue;

      // Helping Hand is +5 - the highest priority bracket in the game, above
      // even Protect at +4. It therefore resolves before the partner's move
      // whatever the Speed stats say, and Trick Room does not touch it either,
      // because Trick Room reorders WITHIN a bracket and never across one.
      //
      // This was written as a Speed check, which happened to give the right
      // answer only because the priority data is correct - but it framed a
      // certainty as a race, and the "too slow" branch it carried could never
      // fire. The one thing that could genuinely stop the boost is the partner
      // moving in a HIGHER bracket, so that is what gets checked.
      const helper = oa.isHelpingHand ? a : ob.isHelpingHand ? b : null;
      const helped = oa.isHelpingHand ? b : ob.isHelpingHand ? a : null;
      let boostLands = false;
      if (helper && helped) {
        const hMove = oa.isHelpingHand ? ob.moveName : oa.moveName;
        boostLands =
          effectivePriority("Helping Hand", helper) >= effectivePriority(hMove, helped);
      }

      const byTarget = new Map<string, { min: number; max: number }[]>();
      let reliability = 1;

      for (const opt of [oa, ob]) {
        if (opt.isHelpingHand) continue;
        const boosted = Boolean(helper) && boostLands && !opt.isHelpingHand;
        const { hits, accuracy } = contributionsOf(
          state.mons[opt.attackerUid],
          opt.moveName,
          opt.targetUid,
          state,
          boosted
        );
        if (hits.length === 0) continue;
        reliability *= accuracy / 100;
        for (const h of hits) {
          const list = byTarget.get(h.targetUid) ?? [];
          list.push({ min: h.min, max: h.max });
          byTarget.set(h.targetUid, list);
        }
      }
      if (byTarget.size === 0) continue;

      const targets: ComboTarget[] = [];
      let boardMin = 0;
      for (const foe of foes) {
        const hits = byTarget.get(foe.uid);
        if (!hits) continue;
        const t = resolveTarget(foe, hits);
        targets.push(t);
        boardMin += Math.min(100, (t.minPct * foe.curHP) / foe.maxHP);
      }

      const koNames = targets.filter((t) => t.ko).map((t) => t.name);
      const label = `${labelOf(oa, state)} + ${labelOf(ob, state)}`;

      const bits: string[] = [];
      if (koNames.length) bits.push(`KOs ${koNames.join(" and ")}`);
      for (const s of targets) {
        if (s.ko) continue;
        // A Sash survivor is on 1 HP, not on the negative number you get from
        // subtracting overkill damage from a full bar.
        if (s.sashHeld) bits.push(`${s.name} survives on 1 (Focus Sash)`);
        else bits.push(`${s.name} to ${Math.max(0, Math.round(100 - s.minPct))}%`);
      }
      const broke = targets.find((t) => t.brokeSash);
      if (broke) bits.push(`plays through ${broke.name}'s Sash`);
      if (reliability < 1) bits.push(`${Math.round(reliability * 100)}% to connect`);
      if (helper && !boostLands) bits.push(`the partner outpriorities the Helping Hand`);

      plays.push({
        actions: [oa, ob],
        label,
        targets,
        kos: koNames.length,
        koNames,
        reliability,
        boardMin,
        text: bits.join(", ") + ".",
      });
    }
  }

  // KOs first, then reliability, then raw board damage. A play that removes a
  // Pokemon 70% of the time is not better than one that removes it every time,
  // which is why accuracy outranks damage rather than being a footnote.
  plays.sort(
    (x, y) =>
      y.kos - x.kos ||
      y.reliability - x.reliability ||
      y.boardMin - x.boardMin
  );

  // Deduped on move AND target.
  //
  // Keying on the moves alone collapsed "Psychic into Whimsicott" and "Psychic
  // into Incineroar" into one entry - and which one you aim at is the decision,
  // not a detail. It is also precisely what makes a Sash break: two hits into
  // the SAME target. Folding those together hid the play entirely.
  const seen = new Set<string>();
  const out: ComboPlay[] = [];
  for (const p of plays) {
    const key = p.actions
      .map((x) => `${x.attackerUid}:${x.moveName}:${x.targetUid ?? "*"}`)
      .sort()
      .join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Does either of my actives have Helping Hand right now? */
export function hasHelpingHand(state: BattleState): boolean {
  return activeMons(state, "me").some((m) => m.set.moves.includes("Helping Hand"));
}

/** Re-export for the UI, which shows the move name on Protect lines. */
export const PROTECT_NAMES = Object.keys(STATUS_MOVES).filter(
  (k) => STATUS_MOVES[k].protects
);
