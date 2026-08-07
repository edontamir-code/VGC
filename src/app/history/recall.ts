// ===========================================================================
// "We were in this exact situation last time, and X happened."
//
// Two different things are built on the game log, and they should not be
// confused with each other:
//
//   RECALL      - find past turns that look like this one and show what you did
//                 and how it went. This is a search over your own history. It
//                 makes no claim about what is correct; it tells you what
//                 happened, and you decide.
//
//   PRIORS      - what the people you actually queue into actually run. Ladder
//                 usage is a stranger's average; if you have seen Garchomp four
//                 times and it had Life Orb four times, that is better evidence
//                 about YOUR next Garchomp than a global 51%.
//
// Both are honest about sample size, because with three games logged the
// answer to almost everything is "not enough data" and saying so is worth more
// than a confident number built on nothing.
// ===========================================================================
import type { GameRecord, Position, TurnRecord } from "./gamelog.ts";

/** Below this many observations, a rate is reported but flagged as thin. */
export const THIN_EVIDENCE = 5;

// ---------------------------------------------------------------------------
// Recall
// ---------------------------------------------------------------------------

export interface PositionMatch {
  game: GameRecord;
  turn: TurnRecord;
  /** 0-1. 1 means the fingerprints are identical. */
  score: number;
  /** Which parts lined up, for the player to judge the match themselves. */
  matched: string[];
  /** How that game ended. */
  result: GameRecord["result"];
}

const sameSet = (a: (string | null)[], b: (string | null)[]) => {
  const x = a.filter(Boolean).sort().join(",");
  const y = b.filter(Boolean).sort().join(",");
  return x.length > 0 && x === y;
};

const overlap = (a: (string | null)[], b: (string | null)[]) => {
  const y = new Set(b.filter(Boolean));
  return a.filter((n) => n && y.has(n)).length;
};

// Weights. They sum to exactly 1 so an identical position scores 100%, and
// they are set so that everything EXCEPT their active pair (0.22 + 0.16 + 0.17
// = 0.55... no: 0.22 + 0.17 = 0.39, since HP only counts on shared Pokemon)
// cannot on its own clear the default 0.45 threshold. Two games where you had
// the same lead out in the same weather are not "the same situation" if the
// Pokemon opposite are different - that is a different problem entirely.
const W_OPP_SAME = 0.45;
const W_OPP_EACH = 0.225;
const W_ME_SAME = 0.22;
const W_ME_EACH = 0.09;
const W_HP_EACH = 0.08;
const W_FIELD_BIT = 0.0425;

/**
 * How alike are two positions?
 *
 * Weighted hard towards THEIR side of the board, because that is the thing you
 * are trying to solve. Your own Pokemon matter less: the same opposing pair is
 * the same problem even if you brought a different partner. A position whose
 * opposing pair shares nothing can never pass the default threshold however
 * well the rest lines up.
 */
export function similarity(a: Position, b: Position): { score: number; matched: string[] } {
  const matched: string[] = [];
  let score = 0;

  if (sameSet(a.opp.active, b.opp.active)) {
    score += W_OPP_SAME;
    matched.push("same two Pokemon out for them");
  } else {
    const n = overlap(a.opp.active, b.opp.active);
    if (n > 0) {
      score += W_OPP_EACH * n;
      matched.push(`${n} of their active Pokemon in common`);
    }
  }

  if (sameSet(a.me.active, b.me.active)) {
    score += W_ME_SAME;
    matched.push("same two of yours out");
  } else {
    const n = overlap(a.me.active, b.me.active);
    if (n > 0) score += W_ME_EACH * n;
  }

  // HP only counts where the Pokemon themselves line up.
  const hpPairs = a.opp.active.filter(
    (n, i) => n && b.opp.active.includes(n) && a.opp.hp[i] === b.opp.hp[b.opp.active.indexOf(n)]
  ).length;
  if (hpPairs > 0) {
    score += W_HP_EACH * hpPairs;
    matched.push("their HP is in the same shape");
  }

  const f1 = a.field;
  const f2 = b.field;
  let fieldBits = 0;
  if (f1.weather === f2.weather) fieldBits++;
  if (f1.trickRoom === f2.trickRoom) fieldBits++;
  if (f1.tailwindMe === f2.tailwindMe) fieldBits++;
  if (f1.tailwindOpp === f2.tailwindOpp) fieldBits++;
  score += W_FIELD_BIT * fieldBits;
  if (f1.trickRoom && f2.trickRoom) matched.push("Trick Room up in both");
  if (f1.tailwindMe && f2.tailwindMe) matched.push("your Tailwind up in both");
  if (f1.weather && f1.weather === f2.weather) matched.push(`${f1.weather} in both`);

  return { score: Math.min(1, score), matched };
}

/**
 * Past turns that look like the one in front of you.
 *
 * The current game is excluded - "you did this two turns ago" is not a lesson.
 */
export function recallSimilar(
  games: GameRecord[],
  now: Position,
  opts: { limit?: number; minScore?: number; excludeGameId?: string } = {}
): PositionMatch[] {
  const { limit = 5, minScore = 0.45, excludeGameId } = opts;
  const out: PositionMatch[] = [];

  for (const game of games) {
    if (game.id === excludeGameId) continue;
    for (const turn of game.turns) {
      const { score, matched } = similarity(now, turn.position);
      if (score < minScore) continue;
      out.push({ game, turn, score, matched, result: game.result });
    }
  }

  return out
    .sort((a, b) => b.score - a.score || Math.abs(b.turn.damageDealt) - Math.abs(a.turn.damageDealt))
    .slice(0, limit);
}

/** One sentence per match, which is all you can read mid-game. */
export function describeMatch(m: PositionMatch): string {
  const swing =
    m.turn.faintsTheirs.length > 0
      ? `KO'd ${m.turn.faintsTheirs.join(" and ")}`
      : m.turn.damageDealt >= 15
        ? `took ${m.turn.damageDealt.toFixed(0)}% off them`
        : "did little";
  const cost =
    m.turn.faintsMine.length > 0
      ? `, lost ${m.turn.faintsMine.join(" and ")}`
      : m.turn.damageTaken >= 15
        ? `, took ${m.turn.damageTaken.toFixed(0)}%`
        : "";
  const ended =
    m.result === "win"
      ? "You won that game."
      : m.result === "loss"
        ? "You LOST that game."
        : "That game has no result recorded.";
  return `You played "${m.turn.script}" - ${swing}${cost}. ${ended}`;
}

// ---------------------------------------------------------------------------
// Priors from your own games
// ---------------------------------------------------------------------------

export interface EmpiricalRate {
  name: string;
  /** Times seen. */
  count: number;
  /** Games in which this species appeared at all. */
  outOf: number;
  pct: number;
  /** True when there is not enough here to lean on. */
  thin: boolean;
}

/**
 * Moves you have actually seen on a species, across your logged games.
 *
 * Counted once per GAME, not once per turn - a Garchomp that clicked Earthquake
 * five times in one game is one observation of "this Garchomp had Earthquake",
 * not five.
 */
export function observedMoves(games: GameRecord[], species: string): EmpiricalRate[] {
  const perMove = new Map<string, number>();
  let appearances = 0;

  for (const game of games) {
    const seenThisGame = new Set<string>();
    let present = game.theirRoster.includes(species);
    for (const turn of game.turns) {
      if (turn.position.opp.active.includes(species)) present = true;
      for (const r of turn.revealed) {
        const [who, move] = r.split(": ");
        if (who === species && move) seenThisGame.add(move);
      }
    }
    if (!present && seenThisGame.size === 0) continue;
    appearances++;
    for (const mv of seenThisGame) perMove.set(mv, (perMove.get(mv) ?? 0) + 1);
  }

  if (appearances === 0) return [];
  return [...perMove.entries()]
    .map(([name, count]) => ({
      name,
      count,
      outOf: appearances,
      pct: Math.round((100 * count) / appearances),
      thin: appearances < THIN_EVIDENCE,
    }))
    .sort((a, b) => b.count - a.count);
}

export interface PriorComparison {
  name: string;
  /** The ladder number the tool has been using. */
  laddderPct: number;
  /** What you have actually seen. */
  yoursPct: number | null;
  count: number;
  outOf: number;
  thin: boolean;
  /** Set when your experience disagrees with the ladder by a lot. */
  note: string | null;
}

/**
 * Where your games disagree with the usage data.
 *
 * This does NOT silently rewrite the priors. A disagreement is shown to you and
 * you decide whether it is a real read on your ladder bracket or ten games of
 * noise - which is the honest treatment when the sample is this small.
 */
export function comparePriors(
  games: GameRecord[],
  species: string,
  ladder: Record<string, number> | undefined
): PriorComparison[] {
  const mine = observedMoves(games, species);
  if (mine.length === 0) return [];
  const byName = new Map(mine.map((m) => [m.name, m]));
  const names = new Set([...Object.keys(ladder ?? {}), ...byName.keys()]);

  const out: PriorComparison[] = [];
  for (const name of names) {
    const l = ladder?.[name] ?? 0;
    const m = byName.get(name);
    const yours = m ? m.pct : null;
    let note: string | null = null;
    if (m && !m.thin) {
      if (l < 5 && m.pct >= 40) note = `You keep seeing this; the usage data barely lists it.`;
      else if (l >= 50 && m.pct <= 20) note = `Common on ladder, but rare in your games.`;
    }
    out.push({
      name,
      laddderPct: l,
      yoursPct: yours,
      count: m?.count ?? 0,
      outOf: m?.outOf ?? 0,
      thin: m ? m.thin : true,
      note,
    });
  }
  return out.sort((a, b) => (b.yoursPct ?? -1) - (a.yoursPct ?? -1) || b.laddderPct - a.laddderPct);
}

// ---------------------------------------------------------------------------
// Whole-log summary
// ---------------------------------------------------------------------------

export interface LogSummary {
  games: number;
  wins: number;
  losses: number;
  unfinished: number;
  turns: number;
  /** How often you took the tool's recommendation, where it gave one. */
  adviceOffered: number;
  adviceFollowed: number;
  /** Turns where neither recommender had answered before you moved. */
  adviceMissing: number;
  /** Split by recommender - the two are not equally good and must not be pooled. */
  fromPlanner: number;
  fromLines: number;
  /** Win rate when you followed it vs when you did not. Null below the bar. */
  winRateFollowing: number | null;
  winRateIgnoring: number | null;
  enoughToTrust: boolean;
}

export function summarise(games: GameRecord[]): LogSummary {
  const finished = games.filter((g) => g.result !== "unfinished");
  let turns = 0;
  let adviceOffered = 0;
  let adviceFollowed = 0;
  let adviceMissing = 0;
  let fromPlanner = 0;
  let fromLines = 0;

  // A game "followed the advice" when most of its advised turns did.
  //
  // Only PLANNER advice counts towards the win-rate split. The line ranker is a
  // single-turn heuristic; pooling it with the multi-turn search would produce
  // a number that is the average of two different things and means neither.
  let followWins = 0, followTotal = 0, ignoreWins = 0, ignoreTotal = 0;
  for (const g of games) {
    turns += g.turns.length;
    let offered = 0, followed = 0;
    for (const t of g.turns) {
      if (t.adviceSource === "planner") fromPlanner++;
      else if (t.adviceSource === "lines") fromLines++;
      else adviceMissing++;

      if (t.followedAdvice === null) continue;
      adviceOffered++;
      if (t.followedAdvice) adviceFollowed++;

      if (t.adviceSource !== "planner") continue;
      offered++;
      if (t.followedAdvice) followed++;
    }
    if (g.result === "unfinished" || offered === 0) continue;
    if (followed * 2 >= offered) {
      followTotal++;
      if (g.result === "win") followWins++;
    } else {
      ignoreTotal++;
      if (g.result === "win") ignoreWins++;
    }
  }

  return {
    games: games.length,
    wins: finished.filter((g) => g.result === "win").length,
    losses: finished.filter((g) => g.result === "loss").length,
    unfinished: games.length - finished.length,
    turns,
    adviceOffered,
    adviceFollowed,
    adviceMissing,
    fromPlanner,
    fromLines,
    winRateFollowing: followTotal >= THIN_EVIDENCE ? Math.round((100 * followWins) / followTotal) : null,
    winRateIgnoring: ignoreTotal >= THIN_EVIDENCE ? Math.round((100 * ignoreWins) / ignoreTotal) : null,
    enoughToTrust: finished.length >= THIN_EVIDENCE * 2,
  };
}
