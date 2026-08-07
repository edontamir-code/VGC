// ===========================================================================
// What actually happened, so the tool stops being amnesiac.
//
// Every prior in this app comes from ladder usage data - a stranger's average.
// Your games are better evidence about the games you are going to play: the
// people you queue into, the sets they actually run, the lines that actually
// worked. None of that was being kept.
//
// This records one row per turn and one row per game, in a shape that is
// USEFUL later rather than merely complete:
//
//   - a POSITION FINGERPRINT, coarse enough that two similar boards match
//     (species on the field, HP in buckets, field conditions) but specific
//     enough that a match means something
//   - what you did, what they did, and what it cost each side
//   - the result, so a line can be scored rather than just remembered
//
// Deliberately NOT machine learning. There is no model here and no training.
// It is a searchable record: "you have been here before, here is what you did
// and here is how it went." That is the thing that is actually hard to
// remember mid-game, and it is honest about where its evidence comes from.
//
// Storage is local (localStorage, exportable as JSON). Nothing leaves the
// device - the log contains your team, your opponents and your results.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { activeProfile } from "../battle/stats.ts";

export const GAMELOG_VERSION = 1;

/** HP buckets. Exact HP never repeats; "about half" repeats constantly. */
export type HPBucket = "full" | "high" | "half" | "low" | "red" | "dead";

export function hpBucket(cur: number, max: number): HPBucket {
  if (cur <= 0) return "dead";
  // EXACTLY full, not "about full". Focus Sash and Multiscale both check for
  // an untouched bar, so a Pokemon at 99% is in a materially different position
  // from one at 100% and must not fingerprint the same.
  if (cur >= max) return "full";
  const p = (100 * cur) / max;
  if (p > 66) return "high";
  if (p > 40) return "half";
  if (p > 15) return "low";
  return "red";
}

export interface SideSnapshot {
  /** Display names of the two active Pokemon, in slot order. */
  active: (string | null)[];
  hp: (HPBucket | null)[];
  /** Names still available behind them. */
  bench: string[];
}

export interface FieldSnapshot {
  weather: string | null;
  terrain: string | null;
  trickRoom: boolean;
  tailwindMe: boolean;
  tailwindOpp: boolean;
}

/**
 * A position, reduced to what makes two turns "the same situation".
 *
 * Speed control and weather are in because they change every calc. Screens and
 * stat stages are out: they matter, but including them fragments the log so
 * badly that nothing ever matches anything.
 */
export interface Position {
  turn: number;
  me: SideSnapshot;
  opp: SideSnapshot;
  field: FieldSnapshot;
  /** Order-insensitive key for fast bucketing. */
  key: string;
}

export interface TurnRecord {
  turn: number;
  position: Position;
  /** Exactly what you typed, so nothing is lost in translation. */
  script: string;
  /** What the tool recommended at the time. Null when it had not answered. */
  advice: string | null;
  /** Whether you followed it. Null when there was no advice. */
  followedAdvice: boolean | null;
  /**
   * Which recommender produced it. The multi-turn planner and the single-turn
   * line ranker are not equally good, so a rate computed over both without
   * distinguishing them would be measuring nothing in particular.
   */
  adviceSource: "planner" | "lines" | null;
  /** Search depth for planner advice. */
  adviceDepth: number | null;
  /** True when the planner verified the line against every reply. */
  adviceProven: boolean;
  /** 0-1: the share of my advised Pokemon that did the advised thing. */
  adviceMatch: number | null;
  /** "Raichu: advised Zap Cannon, played Protect" */
  adviceDiverged: string[];
  /** HP swing across the turn, in percent of max, positive = damage dealt. */
  damageDealt: number;
  damageTaken: number;
  faintsMine: string[];
  faintsTheirs: string[];
  /** Anything the turn revealed - moves, items, abilities. */
  revealed: string[];
  notes: string | null;
}

export type GameResult = "win" | "loss" | "unfinished";

export interface GameRecord {
  id: string;
  version: number;
  startedAt: string;
  endedAt: string | null;
  result: GameResult;
  /** Their six from team preview. */
  theirRoster: string[];
  /** The four they actually brought, as far as you saw. */
  theirBrought: string[];
  /** The four you brought. */
  myBrought: string[];
  myMega: string | null;
  turns: TurnRecord[];
  /** Free text - "he led Fake Out into my Trick Room and I lost the game there". */
  lesson: string | null;
}

const nameOf = (m: MonState) => activeProfile(m).displayName;

function sideSnapshot(state: BattleState, side: "me" | "opp"): SideSnapshot {
  const active = state.sides[side].active.map((u) => (u ? nameOf(state.mons[u]) : null));
  const hp = state.sides[side].active.map((u) =>
    u ? hpBucket(state.mons[u].curHP, state.mons[u].maxHP) : null
  );
  const activeSet = new Set(state.sides[side].active.filter(Boolean) as string[]);
  const bench = Object.values(state.mons)
    .filter((m) => m.side === side && !m.fainted && !activeSet.has(m.uid))
    .map(nameOf)
    .sort();
  return { active, hp, bench };
}

export function snapshot(state: BattleState): Position {
  const me = sideSnapshot(state, "me");
  const opp = sideSnapshot(state, "opp");
  const field: FieldSnapshot = {
    weather: state.field.weather?.kind ?? null,
    terrain: state.field.terrain?.kind ?? null,
    trickRoom: state.field.trickRoom > 0,
    tailwindMe: state.field.tailwind.me > 0,
    tailwindOpp: state.field.tailwind.opp > 0,
  };

  // Slot order is not meaningful - the same two Pokemon in the other slots is
  // the same position - so the key sorts them.
  const pair = (s: SideSnapshot) =>
    s.active
      .map((n, i) => (n ? `${n}:${s.hp[i]}` : "-"))
      .sort()
      .join("|");
  const key = [
    pair(me),
    pair(opp),
    field.weather ?? "-",
    field.terrain ?? "-",
    field.trickRoom ? "TR" : "-",
    field.tailwindMe ? "TWme" : "-",
    field.tailwindOpp ? "TWopp" : "-",
  ].join("//");

  return { turn: state.turn, me, opp, field, key };
}

/**
 * Health on a side, counted in PERCENTAGE POINTS OF A BAR.
 *
 * Each Pokemon contributes 0-100 regardless of how big its HP stat is, and the
 * side's total is the sum. So KOing one Pokemon from full is 100 points, and
 * chipping two for half each is also 100 - which is how players actually talk
 * about a turn.
 *
 * The obvious alternative, summing raw HP over the whole roster, is much worse:
 * with six Pokemon entered, a clean KO reads as "16% damage" and every turn
 * looks like it did nothing.
 */
export function sideHPPercent(state: BattleState, side: "me" | "opp"): number {
  const mons = Object.values(state.mons).filter((m) => m.side === side);
  return mons.reduce(
    (s, m) => s + (m.maxHP > 0 ? (100 * Math.max(0, m.curHP)) / m.maxHP : 0),
    0
  );
}

/** Everything about the recommendation beyond "what did it say". */
export interface AdviceDetail {
  adviceSource: "planner" | "lines" | null;
  adviceDepth: number | null;
  adviceProven: boolean;
  adviceMatch: number | null;
  adviceDiverged: string[];
}

const NO_ADVICE: AdviceDetail = {
  adviceSource: null,
  adviceDepth: null,
  adviceProven: false,
  adviceMatch: null,
  adviceDiverged: [],
};

/** Build the record for a turn from the board before and after it. */
export function recordTurn(
  before: BattleState,
  after: BattleState,
  script: string,
  advice: string | null,
  followedAdvice: boolean | null,
  detail: AdviceDetail = NO_ADVICE
): TurnRecord {
  const faintsOf = (side: "me" | "opp") =>
    Object.values(after.mons)
      .filter((m) => m.side === side && m.fainted && !before.mons[m.uid]?.fainted)
      .map(nameOf);

  const revealed: string[] = [];
  for (const m of Object.values(after.mons)) {
    if (m.side !== "opp") continue;
    const was = before.mons[m.uid];
    if (!was) continue;
    for (const mv of m.revealed.moves) {
      if (!was.revealed.moves.includes(mv)) revealed.push(`${nameOf(m)}: ${mv}`);
    }
  }

  return {
    turn: before.turn,
    position: snapshot(before),
    script,
    advice,
    followedAdvice,
    ...detail,
    damageDealt: +(sideHPPercent(before, "opp") - sideHPPercent(after, "opp")).toFixed(1),
    damageTaken: +(sideHPPercent(before, "me") - sideHPPercent(after, "me")).toFixed(1),
    faintsMine: faintsOf("me"),
    faintsTheirs: faintsOf("opp"),
    revealed,
    notes: null,
  };
}

export function newGameRecord(state: BattleState): GameRecord {
  // "Brought" means it was actually on the field. My own six are all flagged
  // `confirmed` from the moment the board loads - that flag means "I know this
  // Pokemon exists", not "I picked it" - so trusting it recorded all six as
  // the four I brought, every game.
  const brought = (side: "me" | "opp") => {
    const active = new Set(state.sides[side].active.filter(Boolean) as string[]);
    return Object.values(state.mons)
      .filter((m) => m.side === side && (active.has(m.uid) || m.turnsOnField > 0 || m.fainted))
      .map(nameOf);
  };
  const mega = Object.values(state.mons).find(
    (m) => m.side === "me" && m.hasMega && (m.set.megaName || m.set.baseForm)
  );

  return {
    id: `g${Date.now().toString(36)}`,
    version: GAMELOG_VERSION,
    startedAt: new Date().toISOString(),
    endedAt: null,
    result: "unfinished",
    theirRoster: Object.values(state.mons).filter((m) => m.side === "opp").map(nameOf),
    theirBrought: brought("opp"),
    myBrought: brought("me"),
    myMega: mega ? mega.set.megaName ?? mega.set.name : null,
    turns: [],
    lesson: null,
  };
}
