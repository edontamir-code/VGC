// ===========================================================================
// The decision resolver: "if I click X, do I outspeed and KO - yes or no?"
// Combines speed order + damage over the CURRENT board, ranks the lines, and
// says plainly which parts are guaranteed and which are conditional.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup, Verdict } from "./damage.ts";
import { movesFirst } from "./speed.ts";
import type { SpeedVerdict } from "./speed.ts";
import { koBoundary } from "./envelope.ts";
import type { KOBoundary } from "./envelope.ts";
import { getMoveData } from "./moves.ts";
import { STATUS_MOVES, isStatusMove } from "./statusMoves.ts";

export interface LineTarget {
  uid: string;
  target: MonState;
  result: ResolvedMatchup;
  speed: SpeedVerdict;
  boundary: KOBoundary | null;
  /** True when the KO lands before the target can act. */
  koBeforeTheyAct: boolean;
}

export type LineKind = "attack" | "status" | "unmodelled";

export interface Line {
  attackerUid: string;
  attacker: MonState;
  moveName: string;
  kind: LineKind;
  spread: boolean;
  targets: LineTarget[];
  score: number;
  headline: string;
  notes: string[];
  /** "confirmed" only when every target's spread is confirmed. */
  certainty: "confirmed" | "assumed";
}

export function activeMons(state: BattleState, side: SideId): MonState[] {
  return state.sides[side].active
    .map((uid) => (uid ? state.mons[uid] : null))
    .filter((m): m is MonState => m !== null && !m.fainted);
}

function verdictScore(v: Verdict, r: ResolvedMatchup, first: boolean): number {
  switch (v) {
    case "DEAD":
      return 100 + (first ? 40 : 0);
    case "ROLL": {
      const m = /^(\d+)% to KO$/.exec(r.koChance);
      const pct = m ? Number(m[1]) : 50;
      return 30 + pct * 0.4 + (first ? 10 : 0);
    }
    case "SASH":
      return 12 + r.maxPctCur * 0.05;
    case "LIVES":
      return Math.min(25, r.maxPctCur * 0.15);
    case "IMMUNE":
      return 0;
    default:
      return 0;
  }
}

function targetName(m: MonState): string {
  return m.hasMega || !m.set.baseForm ? m.set.name : m.set.speciesId;
}

function phrase(t: LineTarget): string {
  const r = t.result;
  const name = targetName(t.target);
  if (r.verdict === "IMMUNE") return `no effect on ${name}`;
  const order = t.speed.tie
    ? "SPEED TIE"
    : t.speed.first === "a"
      ? `first (${t.speed.aSpeed} vs ${t.speed.bSpeed})`
      : `second (${t.speed.bSpeed} vs ${t.speed.aSpeed})`;

  switch (r.verdict) {
    case "DEAD":
      return `${order} - guaranteed KO on ${name} (min ${r.minPctCur}%)`;
    case "ROLL":
      return `${order} - ${r.koChance} on ${name} (${r.minPctCur}-${r.maxPctCur}%)`;
    case "SASH":
      return `${order} - ${name} survives on Focus Sash`;
    default:
      return `${order} - ${r.minPctCur}-${r.maxPctCur}% on ${name}, no KO`;
  }
}

function headlineFor(
  attacker: MonState,
  moveName: string,
  targets: LineTarget[],
  spread: boolean
): string {
  const who = targetName(attacker);
  if (spread && targets.length > 1) {
    return `${who} ${moveName} (spread): ` + targets.map(phrase).join(" | ");
  }
  const best = [...targets].sort(
    (a, b) =>
      verdictScore(b.result.verdict, b.result, b.speed.first === "a") -
      verdictScore(a.result.verdict, a.result, a.speed.first === "a")
  )[0];
  return `${who} ${moveName}: ${phrase(best)}`;
}

function dedupe(xs: string[]): string[] {
  return [...new Set(xs)];
}

/** Every line the given attacker can take against the current opposing actives. */
export function linesFor(
  attacker: MonState,
  state: BattleState,
  opts: { helpingHand?: boolean } = {}
): Line[] {
  const foes = activeMons(state, attacker.side === "me" ? "opp" : "me");
  const lines: Line[] = [];

  for (const moveName of attacker.set.moves) {
    const data = getMoveData(moveName);

    if (!data) {
      const info = STATUS_MOVES[moveName];
      lines.push({
        attackerUid: attacker.uid,
        attacker,
        moveName,
        kind: isStatusMove(moveName) ? "status" : "unmodelled",
        spread: false,
        targets: [],
        score: info ? 5 : 0,
        headline: info
          ? `${moveName} - ${info.effect}`
          : `${moveName} - not in moves.js, no damage numbers available`,
        notes: info ? [] : ["Add this move to src/data/moves.js to get exact numbers."],
        certainty: "confirmed",
      });
      continue;
    }

    const spread = Boolean(data.spread);
    const targets: LineTarget[] = [];

    for (const foe of foes) {
      const result = resolveMatchup(attacker, foe, moveName, state, opts);
      if (!result) continue;
      const speed = movesFirst(attacker, foe, state, moveName, null);
      const boundary =
        result.verdict === "DEAD" || result.verdict === "ROLL"
          ? koBoundary(attacker, foe, moveName, state, opts)
          : null;
      targets.push({
        uid: foe.uid,
        target: foe,
        result,
        speed,
        boundary,
        koBeforeTheyAct: result.verdict === "DEAD" && speed.first === "a",
      });
    }

    if (targets.length === 0) continue;

    // A single-target move is scored on its BEST target; a spread on the sum.
    const perTarget = targets.map((t) =>
      verdictScore(t.result.verdict, t.result, t.speed.first === "a")
    );
    let score = spread
      ? perTarget.reduce((a, b) => a + b, 0)
      : Math.max(...perTarget);

    // Prefer KOs that hold regardless of what the opponent is really running.
    if (targets.some((t) => t.boundary?.kind === "conditional")) score *= 0.92;

    const assumed = targets.some((t) => t.target.side === "opp" && !t.target.revealed.sp);

    lines.push({
      attackerUid: attacker.uid,
      attacker,
      moveName,
      kind: "attack",
      spread,
      targets,
      score,
      headline: headlineFor(attacker, moveName, targets, spread),
      notes: dedupe(targets.flatMap((t) => t.result.caveats)),
      certainty: assumed ? "assumed" : "confirmed",
    });
  }

  return lines.sort((a, b) => b.score - a.score);
}

/** All of my lines, ranked. */
export function rankedLines(state: BattleState, side: SideId = "me"): Line[] {
  return activeMons(state, side)
    .flatMap((m) => linesFor(m, state))
    .sort((a, b) => b.score - a.score);
}

// ---------------------------------------------------------------------------
// The defensive half: what can the opponent do to me right now.
// ---------------------------------------------------------------------------
export interface IncomingThreat {
  attacker: MonState;
  defender: MonState;
  moveName: string;
  result: ResolvedMatchup;
  speed: SpeedVerdict;
  /** They KO me before I get to act. */
  killsFirst: boolean;
}

export function incomingThreats(state: BattleState): IncomingThreat[] {
  const foes = activeMons(state, "opp");
  const mine = activeMons(state, "me");
  const out: IncomingThreat[] = [];

  for (const foe of foes) {
    for (const moveName of foe.set.moves) {
      if (!getMoveData(moveName)) continue;
      for (const me of mine) {
        const result = resolveMatchup(foe, me, moveName, state);
        if (!result) continue;
        if (result.verdict === "IMMUNE") continue;
        const speed = movesFirst(foe, me, state, moveName, null);
        out.push({
          attacker: foe,
          defender: me,
          moveName,
          result,
          speed,
          killsFirst: result.verdict === "DEAD" && speed.first === "a",
        });
      }
    }
  }

  const rank = (t: IncomingThreat) =>
    (t.result.verdict === "DEAD" ? 100 : t.result.verdict === "ROLL" ? 50 : 0) +
    (t.killsFirst ? 25 : 0) +
    t.result.maxPctCur * 0.1;

  return out.sort((a, b) => rank(b) - rank(a));
}
