// ===========================================================================
// What happens to you BEFORE your move resolves.
//
// The line resolver evaluates your action against a frozen opponent. That is
// wrong on turn 1 and wrong any time they have priority: a Fake Out flinches
// you and your line never happens, and its chip damage takes a Focus Sash mon
// off full HP so the partner's attack goes straight through.
//
// Everything here is deterministic over the same verified engine. No heuristics,
// no guessed play patterns - just "these are their legal actions, this is the
// order they resolve in, this is the arithmetic".
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup } from "./damage.ts";
import { movesFirst } from "./speed.ts";
import { getMoveData } from "./moves.ts";
import { activeMons, rankedLines } from "./resolver.ts";
import type { Line } from "./resolver.ts";
import { simulateTurn } from "../sim/turn.ts";
import type { Plan } from "../sim/actions.ts";
import { blockedByPsychicTerrain } from "./terrain.ts";
import { scout } from "./scouting.ts";
import { activeProfile } from "./stats.ts";

export type RiskKind =
  | "flinch"
  | "ko-before-you"
  | "sash-break"
  | "combo-ko"
  | "speed-tie"
  | "redirect";

export type Severity = "high" | "med" | "low";

export interface LeadRisk {
  kind: RiskKind;
  /** My mon that is at risk. */
  victimUid: string;
  victim: MonState;
  /** Their mon(s) causing it. */
  sourceUids: string[];
  text: string;
  severity: Severity;
  /** True only where every input is confirmed; assumed sets stay conditional. */
  certain: boolean;
}

const name = (m: MonState) =>
  activeProfile(m).displayName;

/** Their damaging moves, resolved onto one of my mons. */
function hitsOn(
  foe: MonState,
  me: MonState,
  state: BattleState
): { moveName: string; r: ResolvedMatchup }[] {
  const out: { moveName: string; r: ResolvedMatchup }[] = [];
  for (const moveName of foe.set.moves) {
    if (!getMoveData(moveName)) continue;
    const r = resolveMatchup(foe, me, moveName, state);
    if (!r || r.verdict === "IMMUNE") continue;
    out.push({ moveName, r });
  }
  return out;
}

/** Their single best hit onto one of my mons, by max damage. */
function bestHit(foe: MonState, me: MonState, state: BattleState) {
  const hits = hitsOn(foe, me, state);
  if (!hits.length) return null;
  return hits.reduce((a, b) => (b.r.max > a.r.max ? b : a));
}

/**
 * Every way you can be disrupted or removed before you act, given the current
 * board and the opponent's (possibly assumed) sets.
 */
export function leadRisks(state: BattleState): LeadRisk[] {
  const mine = activeMons(state, "me");
  const foes = activeMons(state, "opp");
  const risks: LeadRisk[] = [];
  if (!foes.length || !mine.length) return risks;

  // --- 0. Redirection ------------------------------------------------------
  // This belongs at the top because it invalidates the Lines panel wholesale:
  // every single-target KO shown there may land on the wrong Pokemon.
  for (const foe of foes) {
    const pullMoves = ["Rage Powder", "Follow Me"].filter((m) =>
      scout(foe).arsenal.includes(m)
    );
    const pullAbility = ["Lightning Rod", "Storm Drain"].includes(
      activeProfile(foe).ability
    )
      ? activeProfile(foe).ability
      : null;
    if (!pullMoves.length && !pullAbility) continue;

    const other = foes.find((f) => f.uid !== foe.uid);
    const seen = pullMoves.some((m) => foe.revealed.moves.includes(m));

    risks.push({
      kind: "redirect",
      victimUid: mine[0].uid,
      victim: mine[0],
      sourceUids: [foe.uid],
      severity: "high",
      certain: seen || Boolean(pullAbility),
      text: pullAbility
        ? `${name(foe)}'s ${pullAbility} pulls every ${
            pullAbility === "Lightning Rod" ? "Electric" : "Water"
          } move on the field onto it.`
        : `${name(foe)} can ${pullMoves.join("/")} - your SINGLE-TARGET attacks get ` +
          `pulled onto it${other ? `, not ${name(other)}` : ""}. Spread moves are unaffected, ` +
          `and a redirected move into a type it is immune to does nothing at all ` +
          `(no damage, and no Contrary/secondary effect either).` +
          (seen ? "" : " Assumed from the common set, not yet seen."),
    });
  }

  for (const me of mine) {
    const sashLive =
      me.set.item === "Focus Sash" && me.itemActive && me.curHP === me.maxHP;

    // --- 1. Fake Out: +3 priority, always flinches. Your action does not happen.
    // Grouped per victim: which of them has it matters far less than the fact
    // that one of them does.
    // Psychic Terrain blocks the whole priority bracket against a grounded
    // target, so under it there is simply no Fake Out to worry about.
    const priorityBlocked = blockedByPsychicTerrain(state, me, 3);

    const fakeOutters = priorityBlocked
      ? []
      : foes
          // Fake Out only works on the turn its user switched in (moves.js
          // firstTurnOnly). Warning every turn would be noise, and a plan built
          // around dodging a Fake Out that cannot happen is worse than noise.
          .filter((f) => f.set.moves.includes("Fake Out") && f.turnsOnField === 0)
          .map((f) => ({ foe: f, r: resolveMatchup(f, me, "Fake Out", state) }))
          .filter((x) => x.r !== null && x.r.verdict !== "IMMUNE");

    if (fakeOutters.length > 0) {
      const seen = fakeOutters.some((x) => x.foe.revealed.moves.includes("Fake Out"));
      const lo = Math.min(...fakeOutters.map((x) => x.r!.min));
      const hi = Math.max(...fakeOutters.map((x) => x.r!.max));
      const who = fakeOutters.map((x) => name(x.foe)).join(" or ");

      // "Always flinches" is only true from a LOWER priority bracket.
      //
      // Two Fake Outs are both +3, so they resolve against each other on
      // Speed - and a flinch does nothing to a Pokemon that has already
      // moved. If this mon has its own Fake Out and outspeeds every one of
      // theirs, their Fake Out is reduced to chip damage: it lands, but the
      // turn it was supposed to take away has already happened.
      //
      // Calling that "your move does not happen" is not a small overstatement.
      // It is the difference between a Pokemon that is answered and one that
      // is the answer.
      const iHaveFakeOut =
        me.set.moves.includes("Fake Out") && me.turnsOnField === 0;
      const outspeedsAll =
        iHaveFakeOut &&
        fakeOutters.every(
          (x) => movesFirst(me, x.foe, state, "Fake Out", "Fake Out").first === "a"
        );

      risks.push({
        kind: "flinch",
        victimUid: me.uid,
        victim: me,
        sourceUids: fakeOutters.map((x) => x.foe.uid),
        // Still worth stating - it is chip damage on a Focus Sash mon, and it
        // costs your PARTNER nothing to know - but it no longer costs a turn.
        severity: outspeedsAll ? "low" : "high",
        certain: seen,
        text: outspeedsAll
          ? `${who} can Fake Out ${name(me)}, but ${name(me)} has Fake Out too and is ` +
            `faster - yours resolves first, so theirs only chips for ${lo}-${hi} and ` +
            `flinches nothing. Your turn still happens.` +
            (seen ? "" : " Assumed from the common set, not yet seen.")
          : `${who} can Fake Out ${name(me)} (+3 priority, always flinches) - whatever ` +
            `you click on it this turn does not happen. ${lo}-${hi} damage.` +
            (seen ? "" : " Assumed from the common set, not yet seen."),
      });

      if (sashLive) {
        risks.push({
          kind: "sash-break",
          victimUid: me.uid,
          victim: me,
          sourceUids: fakeOutters.map((x) => x.foe.uid),
          severity: "high",
          certain: seen,
          text:
            `That Fake Out also takes ${name(me)} off full HP, so its Focus Sash ` +
            `stops applying. Anything ${name(me)} "survives on Sash" this turn, it ` +
            `does not actually survive.`,
        });
      }
    }

    // --- 2. Straight KO before you get to move.
    for (const foe of foes) {
      for (const { moveName, r } of hitsOn(foe, me, state)) {
        if (r.verdict !== "DEAD") continue;
        const sp = movesFirst(foe, me, state, moveName, null);
        if (sp.first === "b") continue; // you move first, so this is not pre-emptive
        const seen = foe.revealed.moves.includes(moveName);
        risks.push({
          kind: sp.tie ? "speed-tie" : "ko-before-you",
          victimUid: me.uid,
          victim: me,
          sourceUids: [foe.uid],
          severity: sp.tie ? "med" : "high",
          certain: seen && foe.revealed.sp,
          text: sp.tie
            ? `SPEED TIE at ${sp.aSpeed} with ${name(foe)} - if you lose the flip, ` +
              `${moveName} KOs ${name(me)} before you act.`
            : `${name(foe)} ${moveName} KOs ${name(me)} before you act ` +
              `(${sp.aSpeed} vs ${sp.bSpeed}, min ${r.minPctCur}%).`,
        });
      }
    }

    // --- 3. Both of them focusing one target.
    // This is SIMULATED rather than reasoned about, so the Focus Sash, the
    // ordering and the faint are whatever actually happens - not what a
    // hand-written rule assumes happens.
    if (foes.length >= 2) {
      const a = bestHit(foes[0], me, state);
      const b = bestHit(foes[1], me, state);
      if (a && b) {
        const plan: Plan = {
          [foes[0].uid]: { kind: "move", moveName: a.moveName, targetUid: me.uid },
          [foes[1].uid]: { kind: "move", moveName: b.moveName, targetUid: me.uid },
        };
        // Their max rolls -> can it happen at all. Their min rolls -> is it forced.
        const high = simulateTurn(state, plan, { roll: "worstForMe", tie: "them" });
        const low = simulateTurn(state, plan, { roll: "bestForMe", tie: "me" });
        const diesAtWorst = high.state.mons[me.uid].fainted;
        const diesAlways = low.state.mons[me.uid].fainted;

        if (diesAtWorst) {
          const sashSpent = high.events.some((e) => e.text.includes("Focus Sash"));
          const certain =
            foes.every((f) => f.revealed.sp) &&
            foes[0].revealed.moves.includes(a.moveName) &&
            foes[1].revealed.moves.includes(b.moveName);

          risks.push({
            kind: "combo-ko",
            victimUid: me.uid,
            victim: me,
            sourceUids: [foes[0].uid, foes[1].uid],
            severity: diesAlways ? "high" : "med",
            certain,
            text:
              `${name(foes[0])} ${a.moveName} + ${name(foes[1])} ${b.moveName} ` +
              `${diesAlways ? "is a guaranteed" : "can be a"} combined KO on ` +
              `${name(me)} (${me.curHP} HP).` +
              (sashSpent
                ? ` The Focus Sash absorbs the first hit and the second one finishes it - a Sash never survives two attackers.`
                : sashLive
                  ? ` Neither hit alone would KO, so the Sash never triggers; the chip simply adds up.`
                  : ""),
          });
        }
      }
    }
  }

  const order: Record<Severity, number> = { high: 0, med: 1, low: 2 };
  return risks.sort((x, y) => order[x.severity] - order[y.severity]);
}

/** The risks that specifically stop one of my mons from executing its move. */
export function risksForAttacker(risks: LeadRisk[], uid: string): LeadRisk[] {
  return risks.filter(
    (r) =>
      r.victimUid === uid &&
      (r.kind === "flinch" || r.kind === "ko-before-you" || r.kind === "speed-tie")
  );
}

/** True if this mon may well not get to act at all. */
export function mayNotAct(risks: LeadRisk[], uid: string): boolean {
  return risksForAttacker(risks, uid).some((r) => r.severity === "high");
}

export type RankedLine = Line & { risks: LeadRisk[]; discounted: boolean };

/**
 * Your lines, re-ranked with the opponent's pre-emptive actions taken into
 * account. A guaranteed KO you never get to click is not the best line.
 */
export function rankedLinesWithRisk(state: BattleState): {
  lines: RankedLine[];
  risks: LeadRisk[];
} {
  const risks = leadRisks(state);
  const lines = rankedLines(state, "me")
    .map((l) => {
      const own = risksForAttacker(risks, l.attackerUid);
      const discounted = mayNotAct(risks, l.attackerUid);
      return {
        ...l,
        risks: own,
        discounted,
        // Heavy but not fatal: a flinch is only certain once you have SEEN the
        // Fake Out, and the line is still the right click if they do not use it.
        score: discounted ? l.score * 0.55 : l.score,
      };
    })
    .sort((a, b) => b.score - a.score);
  return { lines, risks };
}
