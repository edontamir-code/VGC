// ===========================================================================
// The answer matrix: my six against their six, who beats whom.
//
// This is the team-selection brain, and it answers the question that actually
// decides games at preview: "do I have a way to kill each of those six?"
//
// Bring Sylveon because it answers Garchomp. Do NOT bring Kingambit into a
// Garchomp and lose to one Earthquake. Keep your Charizard answer alive while
// their Charizard is still in the back.
//
// A 1v1 is scored as a RACE, not a single calc:
//   - how many of my best hits does it take to KO them (my worst rolls)
//   - how many of their best hits to KO me (their best rolls)
//   - who moves first, from the Speed range we currently know
// I answer it if I win that race. Anything unreliable - an inaccurate move, an
// unknown Speed - degrades the verdict rather than being quietly ignored.
// ===========================================================================
import type { BattleState, MonState } from "../model/types.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup } from "./damage.ts";
import { getMoveData } from "./moves.ts";
import { scout } from "./scouting.ts";
import { effectiveAccuracy } from "./abilities.ts";
import { outspeedVerdict } from "./speedInference.ts";
import type { SpeedRange } from "./speedInference.ts";
import { SETTER_MOVE, settersFor, withCondition } from "./speedConditions.ts";
import { activeProfile, setMegaForm } from "./stats.ts";

export type AnswerVerdict =
  | "answer" // I win the race AND do it fast enough to matter
  | "slow" // I win the race, but need too many turns for it to be a real answer
  | "trade" // we KO each other in the same window, or it is a speed tie
  | "loses" // they win the race
  | "walled"; // I cannot meaningfully damage it

/**
 * How many hits an "answer" may take.
 *
 * This is a DOUBLES tool, and that changes the bar. A doubles game is decided
 * in a handful of turns with four Pokemon on the field, so a mon that needs
 * four turns to grind something down never actually gets to. Winning a slow
 * 1v1 war of attrition is a singles idea; here it is worth almost nothing.
 *
 * Two hits is a real answer. Three is marginal and reported as "slow" so you
 * can see it without it being counted as coverage.
 */
export const ANSWER_MAX_HITS = 2;

/**
 * What it costs to bring a second Mega Stone holder.
 *
 * Only one Pokemon per team can Mega Evolve, so the second stone holder plays
 * the whole game in its base form AND with a dead item - no Life Orb, no Focus
 * Sash, no Assault Vest, no Sitrus Berry. Every other Pokemon you could have
 * brought instead gets a working one. The base-form STATS were already priced
 * (withMegaChoice demotes it); the empty item slot was free, which is why the
 * tool kept happily recommending both.
 *
 * Sized below one unconditional cover (1000) so it can never argue you out of
 * a four that genuinely beats more of their team - that case is exactly when
 * bringing both really is correct. Sized above two conditional covers (120
 * each) so at equal coverage the four that actually spends its items wins,
 * which is how the rule of thumb behaves in practice.
 */
export const DEAD_STONE_PENALTY = 300;

export interface BestHit {
  moveName: string;
  /** Hits needed at my WORST roll - the honest number. */
  hitsToKO: number;
  /**
   * TURNS the Pokemon is committed for, which is not the same as hits.
   *
   * Hyper Beam KOs Garchomp in one hit and then stands there recharging while
   * their partner hits you for free. That is two turns of your Pokemon to
   * remove one of theirs - the same price as a two-hit spread move that also
   * chipped the other target. Counting hits alone makes the recharge move look
   * strictly best, which is why the tool kept recommending Hyper Beam.
   *
   * This drives which move is RECOMMENDED. It deliberately does not drive the
   * race: Hyper Beam really does remove Garchomp a turn sooner, so it still
   * proves the matchup is winnable even when it is not the move you want.
   */
  turnsToKO: number;
  /**
   * Hits needed by the FASTEST killing move in the arsenal, which may not be
   * this one. The race is scored on this so that preferring a spread move never
   * quietly downgrades a matchup you can actually win.
   */
  fastestHits: number;
  fastestMove: string;
  minPct: number;
  maxPct: number;
  accuracy: number;
  noGuard: boolean;
  typeMult: number;
  /** The user loses its next turn (Hyper Beam) - a real cost, not a detail. */
  recharge: boolean;
  /** Hits BOTH of their Pokemon. In doubles that is most of the value. */
  spread: boolean;
  /** A safer move that also KOs in the same number of turns, if one exists. */
  saferAlternative: string | null;
}

export interface AnswerCell {
  mine: MonState;
  theirs: MonState;
  myBest: BestHit | null;
  theirBest: BestHit | null;
  outspeed: "always" | "never" | "unknown";
  theirSpeed: SpeedRange;
  verdict: AnswerVerdict;
  /** 0-100. Drops for inaccurate moves and unknown speed. */
  confidence: number;
  reason: string;
}

const nameOf = (m: MonState) =>
  activeProfile(m).displayName;

/** The hardest a mon can hit a target, using only moves it could actually have. */
function bestHitOf(
  attacker: MonState,
  defender: MonState,
  state: BattleState
): BestHit | null {
  const arsenal = scout(attacker).arsenal;
  let best: BestHit | null = null;
  const all: BestHit[] = [];

  for (const moveName of arsenal) {
    const data = getMoveData(moveName);
    if (!data) continue;
    const r: ResolvedMatchup | null = resolveMatchup(attacker, defender, moveName, state);
    if (!r || r.typeMult === 0 || r.max <= 0) continue;

    const { accuracy, noGuard } = effectiveAccuracy(data.accuracy, attacker, defender);
    // Hits needed at the MINIMUM roll. If the min roll cannot even dent it,
    // fall back to the max so the number stays finite.
    const perHit = r.min > 0 ? r.min : r.max;
    const hitsToKO = Math.ceil(defender.maxHP / perHit);

    const recharge = Boolean(data.recharge);
    const candidate: BestHit = {
      moveName,
      hitsToKO,
      // A recharge move costs a turn after EVERY use, including the one that
      // lands the KO - you are still standing there while their partner hits
      // you. One-hit Hyper Beam is two turns of your Pokemon, not one.
      turnsToKO: recharge ? hitsToKO * 2 : hitsToKO,
      fastestHits: hitsToKO,
      fastestMove: moveName,
      minPct: r.minPct,
      maxPct: r.maxPct,
      accuracy,
      noGuard,
      typeMult: r.typeMult,
      recharge,
      spread: r.spread,
      saferAlternative: null,
    };
    all.push(candidate);

    // Fewest TURNS wins - not fewest hits, or a recharge move always looks best.
    // Then spread, because hitting both of them is the whole point of doubles:
    // the same number of turns that removes one Pokemon and chips the other is
    // strictly better than the one that only removes one. Accuracy last.
    const better =
      !best ||
      candidate.turnsToKO < best.turnsToKO ||
      (candidate.turnsToKO === best.turnsToKO && candidate.spread && !best.spread) ||
      (candidate.turnsToKO === best.turnsToKO &&
        candidate.spread === best.spread &&
        candidate.accuracy > best.accuracy);
    if (better) best = candidate;
  }

  // The race is scored on the fastest kill available, whichever move that is.
  if (best) {
    const quickest = all.reduce((a, b) => (b.hitsToKO < a.hitsToKO ? b : a));
    best.fastestHits = quickest.hitsToKO;
    best.fastestMove = quickest.moveName;
  }

  // If the chosen move costs a turn or can miss, name a clean move that gets
  // there in the same number of turns - the player should see the trade.
  if (best && (best.recharge || best.accuracy < 100)) {
    const clean = all.find(
      (c) =>
        c.moveName !== best!.moveName &&
        c.turnsToKO <= best!.turnsToKO &&
        c.accuracy === 100 &&
        !c.recharge
    );
    if (clean) best.saferAlternative = clean.moveName;
  }
  return best;
}

/** Score one of my mons against one of theirs. */
export function answerCell(
  mine: MonState,
  theirs: MonState,
  state: BattleState
): AnswerCell {
  const myBest = bestHitOf(mine, theirs, state);
  const theirBest = bestHitOf(theirs, mine, state);
  const speed = outspeedVerdict(mine, theirs, state);

  let verdict: AnswerVerdict;
  let reason: string;
  let confidence = 100;

  if (!myBest) {
    verdict = "walled";
    reason = `${nameOf(mine)} cannot damage ${nameOf(theirs)} at all`;
  } else {
    // The race uses the FASTEST kill either side has. What each side would
    // rather click is a separate question, handled in bestHitOf.
    const myHits = myBest.fastestHits;
    const theirHits = theirBest?.fastestHits ?? Infinity;

    // Moving first means you can afford to need the same number of hits.
    const iMoveFirst = speed.verdict === "always";
    const iWin = iMoveFirst ? myHits <= theirHits : myHits < theirHits;
    const theyWin = iMoveFirst ? theirHits < myHits : theirHits <= myHits;

    if (iWin && !theyWin) {
      const fastEnough = myHits <= ANSWER_MAX_HITS;
      verdict = fastEnough ? "answer" : "slow";
      reason =
        `${nameOf(mine)} ${myBest.moveName} KOs in ${myBest.hitsToKO} ` +
        `(${myBest.minPct}-${myBest.maxPct}%)` +
        (myBest.spread ? `, and it hits both of them` : "") +
        (theirHits === Infinity
          ? `, and ${nameOf(theirs)} cannot hurt it`
          : `, they need ${theirHits}`);
      if (myBest.moveName !== myBest.fastestMove) {
        reason +=
          `. ${myBest.fastestMove} kills it faster (${myBest.fastestHits}) but costs you the ` +
          `following turn, and spreading the damage is worth more than removing this one sooner`;
      }
      if (!fastEnough) {
        reason +=
          `. That is ${myHits} turns of your Pokemon - it wins the 1v1 on paper but ` +
          `in doubles the game is decided long before that, so it does not count as coverage`;
      }
    } else if (theyWin && !iWin) {
      verdict = "loses";
      reason =
        `${nameOf(theirs)} KOs in ${theirHits}` +
        (theirBest ? ` with ${theirBest.fastestMove}` : "") +
        `, ${nameOf(mine)} needs ${myHits}`;
    } else {
      verdict = "trade";
      reason = `both need ${myHits} hit${myHits === 1 ? "" : "s"} - the Speed roll decides it`;
    }

    // Honesty adjustments.
    if (myBest.accuracy < 100) {
      confidence -= (100 - myBest.accuracy);
      reason += `. ${myBest.moveName} is ${myBest.accuracy}% accurate`;
    }
    if (myBest.noGuard) reason += " (No Guard - always hits)";
    if (myBest.recharge) {
      confidence -= 15;
      reason += `. ${myBest.moveName} costs you the FOLLOWING turn entirely`;
    }
    if (myBest.saferAlternative) {
      reason += `. ${myBest.saferAlternative} gets there just as fast with no downside`;
    }
    if (speed.verdict === "unknown") {
      confidence -= 25;
      reason += `. Their Speed is only known to ${speed.theirRange.min}-${speed.theirRange.max}`;
    }
  }

  return {
    mine,
    theirs,
    myBest,
    theirBest,
    outspeed: speed.verdict,
    theirSpeed: speed.theirRange,
    verdict,
    confidence: Math.max(0, Math.min(100, confidence)),
    reason,
  };
}

export interface ThreatCoverage {
  threat: MonState;
  /** My mons that beat it, best first. */
  answers: AnswerCell[];
  /** My mons that lose to it. */
  losesTo: AnswerCell[];
  covered: boolean;
}

export interface AnswerMatrix {
  cells: AnswerCell[];
  coverage: ThreatCoverage[];
  /** Their Pokemon nothing on my team beats. */
  uncovered: ThreatCoverage[];
}

function sideMons(state: BattleState, side: "me" | "opp"): MonState[] {
  return Object.values(state.mons).filter((m) => m.side === side && !m.fainted);
}

// ---------------------------------------------------------------------------
// One Mega per team.
//
// A roster can carry several Mega stones, but only ONE Pokemon Mega Evolves in
// a battle - so a four containing two Megas is not a team you can actually
// play. Worse, scoring it as though both Mega'd inflates both of them: a base
// Staraptor is 120 Atk and 100 Spe, not the Mega line, and matchups it "wins"
// as a Mega it can lose as the base form.
//
// Every four is therefore scored against a state where exactly one stone holder
// is Mega'd and the rest sit in their base forms. The chosen Mega is part of
// the recommendation, because in practice you build around one.
// ---------------------------------------------------------------------------

/** Can this Pokemon Mega Evolve at all? */
export function megaCapable(m: MonState): boolean {
  return Boolean(m.set.megaName || m.set.baseForm);
}

export function megaCapableMons(state: BattleState, side: "me" | "opp"): MonState[] {
  return sideMons(state, side).filter(megaCapable);
}

/**
 * The board with exactly one of my Mega-capable Pokemon Mega Evolved.
 *
 * Pass null to demote every one of them to its base form. Returns the state
 * unchanged when it already matches, so the damage layer's identity memo is not
 * needlessly invalidated.
 */
export function withMegaChoice(
  state: BattleState,
  side: "me" | "opp",
  megaUid: string | null
): BattleState {
  const holders = megaCapableMons(state, side);
  if (holders.length === 0) return state;

  let changed = false;
  const mons = { ...state.mons };
  for (const h of holders) {
    const want = h.uid === megaUid;
    if (h.hasMega !== want) {
      mons[h.uid] = setMegaForm(h, want);
      changed = true;
    }
  }
  return changed ? { ...state, mons } : state;
}

/**
 * The board with every one of their stone holders projected into its Mega.
 *
 * At team preview nobody has Mega Evolved yet, and the battle state correctly
 * reflects that. But "can I answer this Pokemon?" is a question about the
 * version you will actually face, and a stone holder is going to Mega. Judging
 * their Metagross as base Metagross says you have it covered when you do not.
 *
 * Only one of theirs can Mega in a real game, so this is deliberately
 * pessimistic: it asks whether you have an answer to EACH of them individually,
 * which is the right thing to know before you have seen which one they commit.
 */
function threatsAtFullPower(state: BattleState): BattleState {
  let changed = false;
  const mons = { ...state.mons };
  for (const t of sideMons(state, "opp")) {
    if (!megaCapable(t) || t.hasMega) continue;
    mons[t.uid] = setMegaForm(t, true);
    changed = true;
  }
  return changed ? { ...state, mons } : state;
}

/** The full my-team x their-team grid. */
export function buildAnswerMatrix(state: BattleState): AnswerMatrix {
  const projected = threatsAtFullPower(state);
  const mine = sideMons(projected, "me");
  const theirs = sideMons(projected, "opp");
  const cells: AnswerCell[] = [];

  for (const t of theirs) {
    for (const m of mine) cells.push(answerCell(m, t, projected));
  }

  const coverage: ThreatCoverage[] = theirs.map((t) => {
    const forThreat = cells.filter((c) => c.theirs.uid === t.uid);
    const answers = forThreat
      .filter((c) => c.verdict === "answer")
      .sort((a, b) => b.confidence - a.confidence);
    return {
      threat: t,
      answers,
      losesTo: forThreat.filter((c) => c.verdict === "loses"),
      covered: answers.length > 0,
    };
  });

  return { cells, coverage, uncovered: coverage.filter((c) => !c.covered) };
}

// ---------------------------------------------------------------------------
// Bring-four selection.
// ---------------------------------------------------------------------------
export interface BringSuggestion {
  team: MonState[];
  /** Which of the four actually Mega Evolves. Null when none can. */
  megaUid: string | null;
  megaName: string | null;
  /** Mega-capable mons in this four that must be played as their base form. */
  megaBenched: string[];
  /** Threats this four beats. */
  covers: string[];
  /** Threats it beats ONLY once a speed condition this four can set is up. */
  conditionalCovers: string[];
  /** Threats it does not beat at all. */
  misses: string[];
  score: number;
  reasons: string[];
  /** "Farigiraf sets Trick Room, which turns Sylveon into an answer to X." */
  conditionalReasons: string[];
  /** The matrix this four was scored against, i.e. with its Mega assigned. */
  matrix: AnswerMatrix;
}

/** Conditions a four can create for itself, and what they unlock. */
const PLANNABLE = ["trickRoom", "tailwind"] as const;

/**
 * Choose four that cover as much of their six as possible.
 *
 * Coverage first: a four that answers five of their six beats one that answers
 * four, however pretty the second looks. Ties break on REDUNDANCY - having two
 * answers to a threat means losing one does not lose you the game.
 *
 * The four is chosen TOGETHER WITH its Mega, because those are one decision.
 * Each candidate Mega assignment gets its own matrix, so a Pokemon that stays
 * in its base form is scored as the base form and never borrows Mega numbers it
 * will not have.
 */
export function suggestBringFour(
  state: BattleState,
  size = 4
): BringSuggestion | null {
  const mine = sideMons(state, "me");
  if (mine.length === 0) return null;

  const holders = mine.filter(megaCapable);
  // Which of mine hold a Mega Stone, for the dead-item penalty below.
  const byUidHolder = new Set(holders.map((h) => h.uid));
  // One matrix per Mega assignment - built once, reused across every four.
  const choices: (string | null)[] = [null, ...holders.map((h) => h.uid)];
  const perChoice = new Map<string | null, AnswerMatrix>();
  const monsFor = new Map<string | null, Map<string, MonState>>();
  for (const c of choices) {
    const variant = withMegaChoice(state, "me", c);
    perChoice.set(c, buildAnswerMatrix(variant));
    monsFor.set(c, new Map(sideMons(variant, "me").map((m) => [m.uid, m])));
  }
  const anyMatrix = perChoice.get(null)!;
  if (anyMatrix.coverage.length === 0) return null;

  // ...and one more per Mega assignment x speed condition, so a four that
  // brings its own Trick Room is scored on what Trick Room actually unlocks.
  const setterUids = new Map<(typeof PLANNABLE)[number], Set<string>>();
  const conditional = new Map<string, AnswerMatrix>();
  for (const cond of PLANNABLE) {
    setterUids.set(cond, new Set(settersFor(state, cond).map((m) => m.uid)));
    for (const c of choices) {
      const variant = withCondition(withMegaChoice(state, "me", c), cond);
      conditional.set(`${c}|${cond}`, buildAnswerMatrix(variant));
    }
  }

  const combos: string[][] = [];
  const build = (start: number, acc: string[]) => {
    if (acc.length === Math.min(size, mine.length)) {
      combos.push([...acc]);
      return;
    }
    for (let i = start; i < mine.length; i++) build(i + 1, [...acc, mine[i].uid]);
  };
  build(0, []);
  if (combos.length === 0) return null;

  let best: BringSuggestion | null = null;

  for (const comboUids of combos) {
    const uids = new Set(comboUids);
    // Only Mega assignments that are actually in this four, plus "no Mega".
    const legal: (string | null)[] = [null, ...holders.filter((h) => uids.has(h.uid)).map((h) => h.uid)];

    for (const megaUid of legal) {
      const matrix = perChoice.get(megaUid)!;
      const covers: string[] = [];
      const uncovered: ThreatCoverage[] = [];
      let redundancy = 0;

      for (const c of matrix.coverage) {
        const hits = c.answers.filter((a) => uids.has(a.mine.uid));
        if (hits.length > 0) {
          covers.push(nameOf(c.threat));
          redundancy += hits.length - 1;
        } else {
          uncovered.push(c);
        }
      }

      // What this four could unlock by setting its own speed condition. Only
      // counts when the SETTER is in the four too - a Trick Room nobody brought
      // is not a plan.
      const conditionalCovers: string[] = [];
      const conditionalReasons: string[] = [];
      const stillMissing: string[] = [];
      for (const c of uncovered) {
        let unlocked = false;
        for (const cond of PLANNABLE) {
          const setters = [...(setterUids.get(cond) ?? [])].filter((u) => uids.has(u));
          if (setters.length === 0) continue;
          const alt = conditional.get(`${megaUid}|${cond}`);
          const altCov = alt?.coverage.find((x) => x.threat.uid === c.threat.uid);
          const hit = altCov?.answers.find((a) => uids.has(a.mine.uid));
          if (!hit) continue;
          const byUidCond = monsFor.get(megaUid)!;
          const setterName = nameOf(byUidCond.get(setters[0])!);
          conditionalCovers.push(nameOf(c.threat));
          conditionalReasons.push(
            `${setterName} sets ${SETTER_MOVE[cond]}, and then ${nameOf(hit.mine)} ` +
              `answers ${nameOf(c.threat)} - ${hit.myBest?.moveName}`
          );
          unlocked = true;
          break;
        }
        if (!unlocked) stillMissing.push(nameOf(c.threat));
      }
      const misses = stillMissing;

      // A stone holder that is not THE Mega is carrying a dead item.
      //
      // This is why "don't bring both Megas" is a real rule of thumb, and it
      // is a cost the coverage count cannot see. Only one Pokemon per team can
      // Mega Evolve, so the second stone holder plays the whole game in its
      // base form AND with no working item - no Life Orb, no Focus Sash, no
      // Assault Vest, no Sitrus. Every other Pokemon you could have brought
      // gets one. The base-form stats are already priced (withMegaChoice
      // demotes it), but the empty item slot was free.
      //
      // Deliberately smaller than one unconditional cover, so it can never
      // talk you out of a four that genuinely beats more of their team - the
      // rule of thumb loses to actual coverage, which is exactly when bringing
      // both really is right. It is larger than two conditional covers, so at
      // equal coverage the four that spends its items wins.
      const deadStones = comboUids.filter(
        (u) => u !== megaUid && byUidHolder.has(u)
      ).length;

      const score =
        covers.length * 1000 +
        conditionalCovers.length * 120 +
        redundancy * 10 -
        deadStones * DEAD_STONE_PENALTY -
        (megaUid === null && legal.length > 1 ? 1 : 0);
      if (best && score <= best.score) continue;

      const byUid = monsFor.get(megaUid)!;
      const team = comboUids
        .map((u) => byUid.get(u))
        .filter((m): m is MonState => Boolean(m));
      const megaMon = megaUid ? team.find((m) => m.uid === megaUid) ?? null : null;
      const reasons = matrix.coverage
        .filter((c) => c.answers.some((a) => uids.has(a.mine.uid)))
        .map((c) => {
          const a = c.answers.find((x) => uids.has(x.mine.uid))!;
          return `${nameOf(a.mine)} answers ${nameOf(c.threat)} - ${a.myBest?.moveName}`;
        });

      best = {
        team,
        megaUid,
        megaName: megaMon ? megaMon.set.megaName ?? megaMon.set.name : null,
        megaBenched: team
          .filter((m) => megaCapable(m) && m.uid !== megaUid)
          .map((m) => activeProfile({ ...m, hasMega: false }).displayName),
        covers,
        conditionalCovers,
        misses,
        score,
        reasons,
        conditionalReasons,
        matrix,
      };
    }
  }
  return best;
}
