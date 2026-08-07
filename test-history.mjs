// Game log: recording, recall and empirical priors - run: node test-history.mjs
//
// The log is the only data this tool has that nobody else has, so the things
// worth testing are: does it record what actually happened, does recall match
// the RIGHT past positions, and does it refuse to overclaim on a tiny sample.
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { parseTurn } from "./src/app/input/parseTurn.ts";
import { hpBucket, newGameRecord, recordTurn, sideHPPercent, snapshot } from "./src/app/history/gamelog.ts";
import {
  comparePriors, describeMatch, observedMoves, recallSimilar, similarity, summarise, THIN_EVIDENCE,
} from "./src/app/history/recall.ts";
import { adviceFor, compareToAdvice, publishAdvice } from "./src/app/history/advice.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function boardWith(ids) {
  let s = newBattleState();
  for (const id of ids) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  return s;
}
/** Play a script and return { before, after, turn }. */
function playTurn(s, script) {
  const p = parseTurn(script, s);
  const entries = p.entries
    .filter((e) => e.actorUid && e.action)
    .map((e) => ({ actorUid: e.actorUid, moveName: e.moveName, action: e.action }));
  const after = reduce(s, { type: "APPLY_TURN_SCRIPT", entries, effects: p.effects, script });
  return { before: s, after, turn: recordTurn(s, after, script, null, null) };
}

// ===========================================================================
console.log("-- HP buckets --");
{
  check(hpBucket(100, 100) === "full", "a full bar is 'full'");
  check(hpBucket(99, 100) === "high", "  99% is not 'full' - a Sitrus proc matters");
  check(hpBucket(50, 100) === "half", "half is 'half'");
  check(hpBucket(10, 100) === "red", "10% is 'red'");
  check(hpBucket(0, 100) === "dead", "0 is 'dead'");
  // Buckets exist so that similar boards MATCH. Exact HP never repeats.
  check(hpBucket(71, 100) === hpBucket(88, 100),
    "71% and 88% land in the same bucket - that is the point of bucketing");
}

// ===========================================================================
console.log("\n-- a position fingerprint --");
{
  let s = boardWith(["garchomp", "charizard-y"]);
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: opp(s, "garchomp").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 1, uid: opp(s, "charizard-y").uid });

  const a = snapshot(s);
  check(a.opp.active.filter(Boolean).length === 2, `both of theirs are in the snapshot: ${a.opp.active.join(" + ")}`);
  check(a.key.includes("Garchomp"), "the key names the Pokemon on the field");

  // Slot order is not meaningful: the same two in the other slots is the SAME
  // position, and a fingerprint that disagrees would never match anything.
  let flipped = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: opp(s, "charizard-y").uid });
  flipped = reduce(flipped, { type: "SWITCH_IN", side: "opp", slot: 1, uid: opp(s, "garchomp").uid });
  check(snapshot(flipped).key === a.key, "swapping their slots gives the same fingerprint");

  // Trick Room genuinely changes the position.
  const tr = reduce(s, { type: "SET_TRICK_ROOM", on: true });
  check(snapshot(tr).key !== a.key, "Trick Room changes the fingerprint - it changes every calc");
}

// ===========================================================================
console.log("\n-- recording a turn --");
{
  let s = boardWith(["garchomp", "charizard-y"]);
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: opp(s, "garchomp").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 1, uid: opp(s, "charizard-y").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: mine(s, "Farigiraf").uid });

  const hpBefore = sideHPPercent(s, "opp");
  const { after, turn } = playTurn(s, "sylveon hyper voice, chomp earthquake on sylveon");
  const hpAfter = sideHPPercent(after, "opp");

  check(turn.script.includes("hyper voice"), "the script is stored verbatim");
  check(turn.damageDealt > 0, `damage dealt is recorded: ${turn.damageDealt}%`);
  check(Math.abs(turn.damageDealt - (hpBefore - hpAfter)) < 0.2,
    "  and it matches the actual HP swing on their side");
  check(turn.damageTaken > 0, `damage taken is recorded too: ${turn.damageTaken}%`);
  check(turn.revealed.some((r) => /Garchomp: Earthquake/.test(r)),
    `what the turn revealed is captured: ${turn.revealed.join("; ") || "(nothing)"}`);
  check(turn.position.turn === 1, "the position stored is the one BEFORE the turn, not after");

  // advice is null until the planner can be read synchronously - recording a
  // guess would poison the only data the tool has.
  check(turn.advice === null && turn.followedAdvice === null,
    "advice is honestly recorded as absent rather than guessed");
}

// ===========================================================================
console.log("\n-- recall finds the RIGHT past position --");
{
  // Three games: two against Garchomp + Charizard, one against a different pair.
  const build = (ids, script, result) => {
    let s = boardWith(ids);
    s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === ids[0]).uid });
    s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 1, uid: Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === ids[1]).uid });
    s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
    s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: mine(s, "Farigiraf").uid });
    const rec = newGameRecord(s);
    rec.result = result;
    const { turn } = playTurn(s, script);
    rec.turns.push(turn);
    return { rec, state: s };
  };

  const g1 = build(["garchomp", "charizard-y"], "sylveon hyper voice", "win");
  const g2 = build(["garchomp", "charizard-y"], "sylveon hyper beam on chomp", "loss");
  const g3 = build(["incineroar", "whimsicott"], "sylveon hyper voice", "win");
  const games = [g1.rec, g2.rec, g3.rec];

  const now = snapshot(g1.state);
  const matches = recallSimilar(games, now, { limit: 5 });
  console.log(`      ${matches.length} matches for ${now.opp.active.join(" + ")}`);
  for (const m of matches) console.log(`      ${Math.round(m.score * 100)}%  ${describeMatch(m)}`);

  check(matches.length >= 2, "it finds the games against the same pair");
  check(matches.every((m) => m.turn.position.opp.active.includes("Garchomp")),
    "  and does NOT return the game against a different pair");

  // The load-bearing property: everything matching EXCEPT their active pair
  // must not clear the bar. Same lead, same weather, different problem.
  const different = similarity(now, g3.rec.turns[0].position);
  console.log(`      different pair scores ${Math.round(different.score * 100)}% ` +
    `(same two of yours out, same field)`);
  check(different.score < 0.45,
    "a position with a totally different opposing pair cannot reach the default threshold");
  check(matches[0].score > 0.5, `the best match scores ${Math.round(matches[0].score * 100)}%`);
  check(matches.some((m) => m.result === "loss"),
    "  losses are surfaced too - the point is what happened, not what worked");
  check(/won that game|LOST that game/.test(describeMatch(matches[0])),
    "  every recall says how the game ended");

  // The game you are IN is not a lesson.
  const excluded = recallSimilar(games, now, { minScore: 0.3, excludeGameId: g1.rec.id });
  check(!excluded.some((m) => m.game.id === g1.rec.id),
    "the current game is excluded from its own recall");

  // A completely different board recalls nothing.
  const elsewhere = recallSimilar(games, snapshot(boardWith([])), { minScore: 0.45 });
  check(elsewhere.length === 0, "an empty board matches nothing rather than everything");

  // Similarity is symmetric and self-identical.
  check(similarity(now, now).score === 1, "a position is 100% similar to itself");
  check(
    Math.abs(similarity(now, g3.rec.turns[0].position).score -
             similarity(g3.rec.turns[0].position, now).score) < 1e-9,
    "similarity is symmetric");
}

// ===========================================================================
console.log("\n-- priors from your own games, honestly bounded --");
{
  const makeGame = (moves) => {
    let s = boardWith(["garchomp"]);
    const rec = newGameRecord(s);
    rec.result = "win";
    rec.theirRoster = ["Garchomp"];
    rec.turns.push({
      turn: 1, position: snapshot(s), script: "chomp attacks", advice: null,
      followedAdvice: null, damageDealt: 0, damageTaken: 0,
      faintsMine: [], faintsTheirs: [],
      revealed: moves.map((m) => `Garchomp: ${m}`), notes: null,
    });
    return rec;
  };

  const games = [
    makeGame(["Earthquake", "Life Orb Rock Slide"]),
    makeGame(["Earthquake"]),
    makeGame(["Earthquake", "Protect"]),
  ];

  const seen = observedMoves(games, "Garchomp");
  console.log("     ", seen.map((r) => `${r.name} ${r.count}/${r.outOf}`).join(", "));
  check(seen[0].name === "Earthquake" && seen[0].count === 3,
    "Earthquake seen in all three games");
  check(seen.every((r) => r.thin),
    `everything is flagged thin below ${THIN_EVIDENCE} games - a 3-game rate is not a rate`);

  // Counted once per GAME. A Garchomp that clicked Earthquake five times in one
  // game is ONE observation, not five.
  const repeated = makeGame(["Earthquake"]);
  repeated.turns.push({ ...repeated.turns[0], turn: 2 });
  repeated.turns.push({ ...repeated.turns[0], turn: 3 });
  const once = observedMoves([repeated], "Garchomp");
  check(once[0].count === 1 && once[0].outOf === 1,
    "repeating a move within one game counts once, not once per turn");

  const cmp = comparePriors(games, "Garchomp", { Earthquake: 81, "Scale Shot": 40 });
  const eq = cmp.find((c) => c.name === "Earthquake");
  check(eq && eq.laddderPct === 81 && eq.yoursPct === 100,
    `the ladder number and yours are shown side by side (${eq?.laddderPct}% vs ${eq?.yoursPct}%)`);
  check(cmp.every((c) => c.note === null),
    "no 'your ladder is different' claim is made off three games");
}

// ===========================================================================
console.log("\n-- the summary refuses to overclaim --");
{
  const g = (result) => ({
    id: `x${Math.random()}`, version: 1, startedAt: new Date().toISOString(), endedAt: null,
    result, theirRoster: [], theirBrought: [], myBrought: [], myMega: null,
    // adviceSource matters: only PLANNER advice feeds the win-rate split, so a
    // turn without it is deliberately not counted towards one.
    turns: [{ turn: 1, position: snapshot(newBattleState()), script: "x", advice: "y",
              followedAdvice: true, adviceSource: "planner", adviceDepth: 3,
              adviceProven: false, adviceMatch: 1, adviceDiverged: [],
              damageDealt: 0, damageTaken: 0, faintsMine: [],
              faintsTheirs: [], revealed: [], notes: null }],
    lesson: null,
  });

  const few = summarise([g("win"), g("win"), g("loss")]);
  check(few.wins === 2 && few.losses === 1, "wins and losses are counted");
  check(!few.enoughToTrust, "three games is explicitly not enough to trust");
  check(few.winRateFollowing === null,
    "no 'win rate when following the advice' is reported off three games");

  const many = summarise(Array.from({ length: 12 }, (_, i) => g(i % 3 === 0 ? "loss" : "win")));
  check(many.enoughToTrust, "twelve finished games clears the bar");
  check(many.winRateFollowing !== null,
    `and only then is a rate reported: ${many.winRateFollowing}%`);
}

// ===========================================================================
// Damage has to be measured in something a player recognises.
//
// Summing raw HP across the whole entered roster makes a clean KO read as
// "16% damage" once all six of theirs are on the board, and then every turn in
// the log looks like it did nothing.
// ===========================================================================
console.log("\n-- damage is counted in bars, not in roster fractions --");
{
  const setup = (theirIds) => {
    let s = boardWith(theirIds);
    s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: opp(s, theirIds[0]).uid });
    s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
    return s;
  };

  // Same KO, once with two of theirs entered and once with six.
  const small = setup(["garchomp", "charizard-y"]);
  const big = setup(["garchomp", "charizard-y", "incineroar", "whimsicott", "basculegion", "kingambit"]);

  const koed = (s) => {
    const g = opp(s, "garchomp");
    return reduce(s, { type: "SET_FAINTED", uid: g.uid, fainted: true });
  };
  const dmgSmall = sideHPPercent(small, "opp") - sideHPPercent(koed(small), "opp");
  const dmgBig = sideHPPercent(big, "opp") - sideHPPercent(koed(big), "opp");

  check(Math.abs(dmgSmall - 100) < 0.01,
    `KOing one Pokemon from full is 100 points (${dmgSmall.toFixed(1)})`);
  check(Math.abs(dmgSmall - dmgBig) < 0.01,
    "  and it is the same number whether 2 or 6 of theirs are entered " +
    `(${dmgSmall.toFixed(1)} vs ${dmgBig.toFixed(1)})`);

  // Chipping two for half is worth the same as removing one - which is the
  // whole argument for spread moves.
  const zard = opp(big, "charizard-y");
  let halved = reduce(big, { type: "SWITCH_IN", side: "opp", slot: 1, uid: zard.uid });
  const baseline = sideHPPercent(halved, "opp");
  halved = reduce(halved, { type: "SET_HP_PCT", uid: opp(halved, "garchomp").uid, pct: 50 });
  halved = reduce(halved, { type: "SET_HP_PCT", uid: zard.uid, pct: 50 });
  const chip = baseline - sideHPPercent(halved, "opp");
  check(Math.abs(chip - 100) < 1,
    `chipping two of them to half is also ~100 points (${chip.toFixed(1)})`);
}

// ===========================================================================
console.log("\n-- 'brought' means it was on the field --");
{
  // ADD_MON drops the first two into the active slots, so the third of theirs
  // is the one sitting on the bench.
  let s = boardWith(["garchomp", "charizard-y", "incineroar"]);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: mine(s, "Farigiraf").uid });

  const rec = newGameRecord(s);
  console.log("      mine:", rec.myBrought.join(", "), "| theirs:", rec.theirBrought.join(", "));
  check(rec.myBrought.length <= 4,
    `at most four of mine are recorded as brought (${rec.myBrought.length})`);
  check(rec.myBrought.includes("Sylveon") && rec.myBrought.includes("Farigiraf"),
    "  the two actually on the field are in it");
  check(!rec.myBrought.includes("Kingambit"),
    "  a Pokemon that never left the bench is NOT recorded as brought");
  check(rec.theirBrought.includes("Garchomp") && !rec.theirBrought.includes("Incineroar"),
    "  and the same rule applies to their side - the benched one is excluded");

  // Once it comes in, it counts.
  const inc = opp(s, "incineroar");
  const after = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: inc.uid });
  check(newGameRecord(after).theirBrought.includes("Incineroar"),
    "  and it is recorded the moment it actually switches in");
}

// ===========================================================================
console.log("\n-- an unfinished game is not described as a result --");
{
  let s = boardWith(["garchomp"]);
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: opp(s, "garchomp").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  const rec = newGameRecord(s);
  const { turn } = playTurn(s, "sylveon hyper voice");
  rec.turns.push(turn);

  const m = recallSimilar([rec], snapshot(s), { minScore: 0.4 })[0];
  const text = describeMatch(m);
  console.log("     ", text);
  check(!/You unfinished/.test(text), "it does not say 'You unfinished'");
  check(/no result recorded/.test(text),
    "  it says the game has no result rather than inventing one");
}

// ===========================================================================
// The recommendation, and whether you took it.
//
// The advice is computed in a Web Worker and arrives late, so the load-bearing
// property is that it can only ever be attributed to the board it was actually
// computed for. Keying on the BattleState object gives that for free: every
// transition makes a new object, so a stale result simply does not match.
// ===========================================================================
console.log("\n-- advice is pinned to the board it was computed for --");
{
  let s = boardWith(["garchomp", "charizard-y"]);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  const syl = mine(s, "Sylveon");
  const chomp = opp(s, "garchomp");

  const snap = {
    label: "Sylveon: Hyper Voice",
    plan: { [syl.uid]: { kind: "move", moveName: "Hyper Voice", targetUid: chomp.uid } },
    source: "planner", depth: 3, proven: true,
  };
  publishAdvice(s, snap);

  check(adviceFor(s)?.label === "Sylveon: Hyper Voice", "advice comes back for the board it was published against");

  // Any change to the board produces a new object, so the old advice is simply
  // not found rather than being wrongly reused.
  const moved = reduce(s, { type: "SET_HP_PCT", uid: chomp.uid, pct: 50 });
  check(adviceFor(moved) === null,
    "advice for the previous board is NOT returned for the new one");

  // Planner advice outranks the single-turn ranking; never the reverse.
  const s2 = reduce(s, { type: "SET_TRICK_ROOM", on: true });
  publishAdvice(s2, { ...snap, label: "lines say Protect", source: "lines", depth: null, proven: false });
  publishAdvice(s2, { ...snap, label: "planner says Hyper Voice", source: "planner" });
  check(adviceFor(s2)?.label === "planner says Hyper Voice",
    "planner advice replaces line advice for the same board");
  publishAdvice(s2, { ...snap, label: "lines again", source: "lines", depth: null, proven: false });
  check(adviceFor(s2)?.label === "planner says Hyper Voice",
    "  and line advice never replaces the planner's");
}

// ===========================================================================
console.log("\n-- did I take it? --");
{
  let s = boardWith(["garchomp", "charizard-y"]);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: mine(s, "Farigiraf").uid });
  const syl = mine(s, "Sylveon");
  const farig = mine(s, "Farigiraf");
  const chomp = opp(s, "garchomp");

  const advice = {
    label: "Sylveon: Hyper Voice + Farigiraf: Trick Room",
    plan: {
      [syl.uid]: { kind: "move", moveName: "Hyper Voice", targetUid: chomp.uid },
      [farig.uid]: { kind: "move", moveName: "Trick Room" },
    },
    source: "planner", depth: 3, proven: true,
  };

  const both = compareToAdvice(s, advice, {
    [syl.uid]: { kind: "move", moveName: "Hyper Voice", targetUid: chomp.uid },
    [farig.uid]: { kind: "move", moveName: "Trick Room" },
  });
  check(both.match === 1 && both.followed && both.diverged.length === 0,
    "playing both advised moves is a full match");

  // A different target for the same move is still the same decision.
  const zard = opp(s, "charizard-y");
  const retarget = compareToAdvice(s, advice, {
    [syl.uid]: { kind: "move", moveName: "Hyper Voice", targetUid: zard.uid },
    [farig.uid]: { kind: "move", moveName: "Trick Room" },
  });
  check(retarget.match === 1,
    "aiming the same move at the other target still counts as following it");

  const half = compareToAdvice(s, advice, {
    [syl.uid]: { kind: "move", moveName: "Hyper Voice", targetUid: chomp.uid },
    [farig.uid]: { kind: "move", moveName: "Protect" },
  });
  check(half.match === 0.5 && half.followed,
    `one of two advised moves is a 50% match and still counts as followed (${half.match})`);
  check(half.diverged.length === 1 && /advised Trick Room, played Protect/.test(half.diverged[0]),
    `  and the divergence is named: "${half.diverged[0]}"`);

  const neither = compareToAdvice(s, advice, {
    [syl.uid]: { kind: "move", moveName: "Moonblast", targetUid: chomp.uid },
    [farig.uid]: { kind: "move", moveName: "Protect" },
  });
  check(neither.match === 0 && !neither.followed, "ignoring both is not 'followed'");

  // Their actions are observations, not my decisions - they must not score me.
  const oppOnly = compareToAdvice(s, {
    ...advice, plan: { [chomp.uid]: { kind: "move", moveName: "Earthquake" } },
  }, {});
  check(oppOnly === null,
    "advice containing only their Pokemon produces no self-score at all");

  // A switch is only followed if it is the SAME switch.
  const gambit = mine(s, "Kingambit");
  const arc = mine(s, "Arcanine");
  const swAdvice = { ...advice, plan: { [syl.uid]: { kind: "switch", toUid: gambit.uid } } };
  check(compareToAdvice(s, swAdvice, { [syl.uid]: { kind: "switch", toUid: gambit.uid } }).match === 1,
    "switching to the advised Pokemon is a match");
  check(compareToAdvice(s, swAdvice, { [syl.uid]: { kind: "switch", toUid: arc.uid } }).match === 0,
    "  switching to a DIFFERENT Pokemon is not");
}

// ===========================================================================
console.log("\n-- the two recommenders are not pooled --");
{
  const turn = (source, followed) => ({
    turn: 1, position: snapshot(newBattleState()), script: "x",
    advice: "y", followedAdvice: followed, adviceSource: source,
    adviceDepth: source === "planner" ? 3 : null, adviceProven: false,
    adviceMatch: followed ? 1 : 0, adviceDiverged: [],
    damageDealt: 0, damageTaken: 0, faintsMine: [], faintsTheirs: [], revealed: [], notes: null,
  });
  const game = (result, turns) => ({
    id: `x${Math.random()}`, version: 1, startedAt: new Date().toISOString(), endedAt: null,
    result, theirRoster: [], theirBrought: [], myBrought: [], myMega: null, turns, lesson: null,
  });

  // Ten games where the PLANNER was followed and all were won, plus line-ranker
  // turns that were ignored. The rate must reflect the planner only.
  const games = Array.from({ length: 10 }, () =>
    game("win", [turn("planner", true), turn("lines", false)])
  );
  const s = summarise(games);
  console.log(`      planner turns ${s.fromPlanner}, line turns ${s.fromLines}, missing ${s.adviceMissing}`);
  check(s.fromPlanner === 10 && s.fromLines === 10, "both sources are counted separately");
  check(s.winRateFollowing === 100,
    `the win rate is computed on planner advice alone (${s.winRateFollowing}%)`);

  // Turns where nothing had answered yet are counted, not silently dropped.
  const quiet = summarise([game("win", [{ ...turn("planner", true), adviceSource: null, followedAdvice: null }])]);
  check(quiet.adviceMissing === 1 && quiet.adviceOffered === 0,
    "a turn with no recommendation is recorded as missing, not as ignored advice");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
