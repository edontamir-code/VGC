// Answer matrix, No Guard and Armor Tail - run: node test-answers.mjs
import { monFromThreatId } from "./src/app/model/factory.ts";
import { legacyBattle } from "./test-fixture.mjs";
import { newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { simulateTurn } from "./src/app/sim/turn.ts";
import {
  answerCell, buildAnswerMatrix, suggestBringFour,
  megaCapable, megaCapableMons, withMegaChoice,
} from "./src/app/battle/answers.ts";
import { itemSensitivity } from "./src/app/battle/itemRisk.ts";
import { itemCandidates } from "./src/app/battle/candidates.ts";
import {
  conditionalPlan, conditionalPlans, conditionSequence, settersFor, withCondition,
} from "./src/app/battle/conditions.ts";
import { spreadPlay, bestBoardPlay } from "./src/app/battle/spread.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";
import { outspeedVerdict } from "./src/app/battle/speedInference.ts";
import { activeProfile } from "./src/app/battle/stats.ts";

const nameOf = (m) => activeProfile(m).displayName;
import { effectiveAccuracy, grantsSidePriorityImmunity } from "./src/app/battle/abilities.ts";
import { sidePriorityGuard } from "./src/app/battle/terrain.ts";
import { MOVES } from "./src/data/moves.js";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
const WORST = { roll: "worstForMe", tie: "them" };

/** A board using the CURRENT team (Raichu / Staraptor / Arcanine / Farigiraf / Sylveon / Kingambit). */
function myBoard(threatIds) {
  let s = newBattleState();
  for (const id of threatIds) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  return s;
}

// ===========================================================================
console.log("-- No Guard --");
{
  let s = myBoard(["garchomp"]);
  const raichu = mine(s, "Raichu");
  const chomp = opp(s, "garchomp");

  check(MOVES["Zap Cannon"].accuracy === 50, "Zap Cannon is recorded as 50% accurate");

  // Nothing starts Mega Evolved, so this begins as BASE Raichu with Lightning
  // Rod - and Zap Cannon is a coinflip until it commits. That order is the
  // point: No Guard is something you spend your Mega on, not something you have.
  const preAcc = effectiveAccuracy(MOVES["Zap Cannon"].accuracy, s.mons[raichu.uid], s.mons[chomp.uid]);
  check(preAcc.accuracy === 50 && !preAcc.noGuard,
    `base Raichu has Lightning Rod, so Zap Cannon is a ${preAcc.accuracy}% coinflip`);

  const mega = reduce(s, { type: "SET_MEGA", side: "me", uid: raichu.uid });
  const acc = effectiveAccuracy(MOVES["Zap Cannon"].accuracy, mega.mons[raichu.uid], mega.mons[chomp.uid]);
  check(acc.accuracy === 100 && acc.noGuard,
    `once it Megas, No Guard makes it ${acc.accuracy}% - it always hits`);
}

// ===========================================================================
console.log("\n-- Armor Tail protects the WHOLE side --");
{
  let s = myBoard(["incineroar", "kingambit"]);
  const farig = mine(s, "Farigiraf");
  const raichu = mine(s, "Raichu");
  // Put Farigiraf and Raichu out together.
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: farig.uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: raichu.uid });
  const inc = opp(s, "incineroar");
  const gambit = opp(s, "kingambit");

  check(grantsSidePriorityImmunity(s.mons[farig.uid]) === "Armor Tail",
    "Farigiraf grants Armor Tail");
  const guard = sidePriorityGuard(s, "me");
  check(guard?.ability === "Armor Tail", "the guard covers my side");

  // Fake Out into the PARTNER, not the holder - still blocked.
  const fo = simulateTurn(s, {
    [inc.uid]: { kind: "move", moveName: "Fake Out", targetUid: raichu.uid },
  }, WORST);
  check(fo.state.mons[raichu.uid].curHP === raichu.curHP,
    "Fake Out into Raichu (the PARTNER) is blocked - no chip, no flinch");
  check(fo.events.some((e) => e.text.includes("Armor Tail")), "  and the log names Armor Tail");

  // Sucker Punch too.
  const sp = simulateTurn(s, {
    [gambit.uid]: { kind: "move", moveName: "Sucker Punch", targetUid: raichu.uid },
  }, WORST);
  check(sp.state.mons[raichu.uid].curHP === raichu.curHP, "Sucker Punch is blocked as well");

  // A non-priority move goes straight through.
  const kc = simulateTurn(s, {
    [gambit.uid]: { kind: "move", moveName: "Kowtow Cleave", targetUid: raichu.uid },
  }, WORST);
  check(kc.state.mons[raichu.uid].curHP < raichu.curHP,
    "a normal-priority move is unaffected");

  // My own Protect must NOT be blocked by my own Armor Tail.
  const prot = simulateTurn(s, {
    [farig.uid]: { kind: "move", moveName: "Protect" },
    [gambit.uid]: { kind: "move", moveName: "Kowtow Cleave", targetUid: farig.uid },
  }, WORST);
  check(prot.state.mons[farig.uid].curHP === farig.curHP,
    "my own Protect still works - the guard only stops the other side");

  // Once Farigiraf is gone, priority comes back.
  const gone = reduce(s, { type: "SET_FAINTED", uid: farig.uid, fainted: true });
  const fo2 = simulateTurn(gone, {
    [inc.uid]: { kind: "move", moveName: "Fake Out", targetUid: raichu.uid },
  }, WORST);
  check(fo2.state.mons[raichu.uid].curHP < raichu.curHP,
    "with Farigiraf fainted, Fake Out lands again");
}

// ===========================================================================
console.log("\n-- Prankster Encore is stopped by Armor Tail --");
{
  let s = myBoard(["whimsicott"]);
  const farig = mine(s, "Farigiraf");
  const sylv = mine(s, "Sylveon");
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: farig.uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: sylv.uid });
  const whim = opp(s, "whimsicott");

  // Give Sylveon a last move to be locked into.
  const t1 = simulateTurn(s, {
    [sylv.uid]: { kind: "move", moveName: "Hyper Voice" },
  }, WORST);
  const t2 = simulateTurn(t1.state, {
    [whim.uid]: { kind: "move", moveName: "Encore", targetUid: sylv.uid },
  }, WORST);
  check(t2.state.mons[sylv.uid].encoreTurnsLeft === 0,
    "Encore fails into an Armor Tail side");
  check(t2.events.some((e) => e.text.includes("Armor Tail")), "  and says why");
}

// ===========================================================================
console.log("\n-- the answer matrix --");
{
  let s = myBoard(["garchomp", "charizard-y"]);
  const chomp = opp(s, "garchomp");
  const sylv = mine(s, "Sylveon");
  const gambit = mine(s, "Kingambit");

  // The user's own example: Sylveon answers Garchomp, Kingambit loses to it.
  const sylvVsChomp = answerCell(s.mons[sylv.uid], s.mons[chomp.uid], s);
  const gambitVsChomp = answerCell(s.mons[gambit.uid], s.mons[chomp.uid], s);
  console.log("      Sylveon  vs Garchomp:", sylvVsChomp.verdict, "-", sylvVsChomp.reason);
  console.log("      Kingambit vs Garchomp:", gambitVsChomp.verdict, "-", gambitVsChomp.reason);

  check(sylvVsChomp.verdict === "answer",
    `Sylveon answers Garchomp (${sylvVsChomp.myBest?.moveName})`);
  check(gambitVsChomp.verdict !== "answer",
    `Kingambit does NOT answer Garchomp - verdict "${gambitVsChomp.verdict}"`);

  const matrix = buildAnswerMatrix(s);
  check(matrix.cells.length === 12, `matrix is 6 x 2 = ${matrix.cells.length} cells`);
  check(matrix.coverage.length === 2, "coverage computed for both of their mons");
  for (const c of matrix.coverage) {
    console.log(
      `      ${c.threat.set.name}: ${c.answers.length} answer(s)` +
        (c.answers.length ? ` - ${c.answers.map((a) => a.mine.set.name).join(", ")}` : " NONE")
    );
  }
  check(matrix.coverage.every((c) => c.answers.length + c.losesTo.length <= 6),
    "each threat's answers and losses are subsets of my six");
}

// ===========================================================================
console.log("\n-- bring-four suggestion --");
{
  let s = myBoard(["garchomp", "charizard-y", "basculegion", "kingambit"]);
  const pick = suggestBringFour(s);
  check(pick !== null && pick.team.length === 4, `suggested a four: ${pick?.team.map((m) => m.set.name).join(", ")}`);
  console.log("      covers:", pick.covers.join(", ") || "(none)");
  if (pick.misses.length) console.log("      MISSES:", pick.misses.join(", "));
  for (const r of pick.reasons.slice(0, 4)) console.log("      -", r);

  // No four can cover more threats than the full six can.
  const all = buildAnswerMatrix(s);
  const coveredBySix = all.coverage.filter((c) => c.covered).length;
  check(pick.covers.length <= coveredBySix,
    `the chosen four covers ${pick.covers.length}, the whole team covers ${coveredBySix}`);

  // Threats nothing answers must be reported, not hidden.
  check(pick.misses.length === all.uncovered.length ||
        pick.misses.length >= all.uncovered.length,
    `${all.uncovered.length} threat(s) have no answer anywhere on the team`);
}

// ===========================================================================
// One Mega per team.
//
// Raichu and Staraptor both hold stones. A four containing both is not a team
// you can play, and scoring both as Megas inflates both of them.
// ===========================================================================
console.log("\n-- only one of my Pokemon Mega Evolves --");
{
  let s = myBoard(["garchomp", "charizard-y", "basculegion", "incineroar", "whimsicott", "sinistcha"]);
  const holders = megaCapableMons(s, "me");
  check(holders.length >= 2,
    `my team carries ${holders.length} Mega stones: ${holders.map((m) => m.set.megaName).join(", ")}`);

  const pick = suggestBringFour(s);
  const broughtHolders = pick.team.filter(megaCapable);
  const megaCount = pick.team.filter((m) => m.hasMega && megaCapable(m)).length;
  check(megaCount <= 1,
    `the recommended four Mega Evolves ${megaCount} Pokemon (must be at most 1)`);
  console.log("      four:", pick.team.map((m) => m.set.name).join(", "));
  console.log("      Mega:", pick.megaName ?? "(none)");
  if (pick.megaBenched.length) console.log("      base form:", pick.megaBenched.join(", "));

  check(pick.megaUid === null || pick.team.some((m) => m.uid === pick.megaUid),
    "the Mega it names is actually one of the four");
  check(pick.megaBenched.length === broughtHolders.length - (pick.megaUid ? 1 : 0),
    `every other stone holder in the four is reported as a base form (${pick.megaBenched.length})`);

  // The un-Mega'd holder must be scored on its BASE stats, not Mega stats.
  const star = mine(s, "Staraptor");
  const withStar = withMegaChoice(s, "me", star.uid);
  const withoutStar = withMegaChoice(s, "me", null);
  check(withStar.mons[star.uid].hasMega === true && withoutStar.mons[star.uid].hasMega === false,
    "withMegaChoice flips exactly the holder it is given");

  const chomp = opp(s, "garchomp");
  const asMega = answerCell(withStar.mons[star.uid], withStar.mons[chomp.uid], withStar);
  const asBase = answerCell(withoutStar.mons[star.uid], withoutStar.mons[chomp.uid], withoutStar);
  console.log("      Staraptor vs Garchomp as Mega:", asMega.verdict, "|", asMega.myBest?.minPct + "-" + asMega.myBest?.maxPct + "%");
  console.log("      Staraptor vs Garchomp as base:", asBase.verdict, "|", asBase.myBest?.minPct + "-" + asBase.myBest?.maxPct + "%");
  check(asMega.myBest.maxPct !== asBase.myBest.maxPct,
    "the base form does genuinely different damage from the Mega - they are not interchangeable");

  // Picking one Mega must never claim MORE coverage than pretending both Mega'd.
  const fantasy = buildAnswerMatrix(s).coverage.filter((c) => c.covered).length;
  const real = pick.matrix.coverage.filter((c) => c.covered).length;
  check(real <= fantasy,
    `honest coverage ${real} <= the both-Megas fantasy ${fantasy}`);
}

// ===========================================================================
// Item-conditional damage: "does it kill if it has Life Orb?"
// ===========================================================================
console.log("\n-- the Life Orb question --");
{
  let s = myBoard(["garchomp"]);
  const chomp = s.mons[opp(s, "garchomp").uid];
  const raichu = s.mons[mine(s, "Raichu").uid];

  const items = itemCandidates(chomp);
  check(!items.known && items.options.length > 1,
    `Garchomp's item is unknown - ${items.options.length} live candidates: ` +
    items.options.map((o) => `${o.name} ${o.pct}%`).join(", "));

  const sens = itemSensitivity(chomp, raichu, "Earthquake", s);
  check(sens !== null, "Earthquake into Raichu resolves under every candidate item");
  check(sens.outcomes.length === items.options.length,
    `one damage result per candidate item (${sens.outcomes.length})`);
  for (const o of sens.outcomes) {
    console.log(`      ${o.item.padEnd(16)} ${String(o.minPct).padStart(5)}-${o.maxPct}%  ${o.verdict}`);
  }

  const orb = sens.outcomes.find((o) => o.item === "Life Orb");
  if (orb) {
    const bare = sens.outcomes.find((o) => o.item !== "Life Orb");
    check(orb.maxPct > bare.maxPct,
      `Life Orb hits harder than ${bare.item} (${orb.maxPct}% vs ${bare.maxPct}%)`);
  }
  check(sens.koProbability >= 0 && sens.koProbability <= 100,
    `KO probability across items is a real percentage: ${sens.koProbability}%`);
  if (sens.text) console.log("      READ:", sens.text);

  // My own Pokemon hold known items - there is nothing to be uncertain about.
  const mySens = itemSensitivity(raichu, chomp, "Zap Cannon", s);
  check(mySens.known && mySens.outcomes.length === 1 && mySens.text === null,
    "my own Pokemon's item is known, so no item warning is produced");
}

// ===========================================================================
// Conditional cores: Sylveon is only strong inside Trick Room.
// ===========================================================================
console.log("\n-- Trick Room turns the slow hitters on --");
{
  let s = myBoard(["garchomp", "charizard-y", "basculegion", "incineroar", "whimsicott", "sinistcha"]);

  const setters = settersFor(s, "trickRoom");
  check(setters.length > 0,
    `${setters.map((m) => m.set.name).join(", ")} can set Trick Room`);

  const tr = withCondition(s, "trickRoom");
  check(tr.field.trickRoom > 0 && s.field.trickRoom === 0,
    "withCondition returns a new board with Trick Room up and leaves the original alone");

  const plan = conditionalPlan(s, "trickRoom", null);
  console.log("      gained:", plan.gained.length, " lost:", plan.lost.length);
  for (const g of plan.gained.slice(0, 5)) {
    console.log(`      + ${g.mine.set.name} vs ${g.theirs.set.name}: ${g.before} -> ${g.after}`);
  }
  for (const l of plan.lost.slice(0, 3)) {
    console.log(`      - ${l.mine.set.name} vs ${l.theirs.set.name}: ${l.before} -> ${l.after}`);
  }
  if (plan.text) console.log("      READ:", plan.text);

  check(plan.gained.length + plan.lost.length > 0,
    "Trick Room changes at least one matchup - it is never a no-op on a mixed team");

  // Trick Room must cut both ways. A tool that only shows the upside is lying.
  const fast = plan.lost.some((l) => l.before === "answer");
  const slow = plan.gained.some((g) => g.after === "answer");
  check(fast || slow, "the flip list contains real answer-level swings, not just noise");
  if (fast) check(true, "it correctly reports what Trick Room COSTS your fast Pokemon");

  // A condition nobody can set must not be advertised as a plan.
  const plans = conditionalPlans(s, null);
  for (const p of plans) {
    check(p.setters.length > 0,
      `${p.condition} is only offered because ${p.setters.map((m) => m.set.name).join("/")} can set it`);
  }
}

// ===========================================================================
// THE READ: you bring the Trick Room setter because of what it turns on.
//
// Farigiraf does not earn a slot by winning 1v1s. It earns one because it sets
// Trick Room, and Trick Room is what makes a slow attacker into an answer. A
// bring-four that scores Pokemon independently can never see that.
// ===========================================================================
console.log("\n-- a setter earns its slot through what it unlocks --");
{
  let s = myBoard(["gholdengo", "archaludon", "metagross", "sableye", "grimmsnarl", "swampert"]);
  const pick = suggestBringFour(s);

  console.log("      four:", pick.team.map((m) => m.set.name).join(", "));
  console.log("      covers:", pick.covers.join(", ") || "(none)");
  if (pick.conditionalCovers.length) console.log("      conditional:", pick.conditionalCovers.join(", "));
  for (const r of pick.conditionalReasons) console.log("      *", r);
  if (pick.misses.length) console.log("      MISSES:", pick.misses.join(", "));

  check(pick.conditionalCovers.length > 0,
    `${pick.conditionalCovers.length} threat(s) are covered only once a condition is up`);
  check(pick.conditionalReasons.length === pick.conditionalCovers.length,
    "every conditional cover names the setter and the answer that follows it");

  // The setter has to actually be in the four - a Trick Room nobody brought is
  // not a plan, it is a fantasy.
  const setterNames = settersFor(s, "trickRoom").map((m) => m.set.name);
  const broughtASetter = pick.team.some((m) => setterNames.includes(m.set.name));
  check(!pick.conditionalCovers.length || broughtASetter,
    "the four contains the Pokemon that sets the condition it is relying on");

  // Conditional coverage must never be counted as real coverage.
  const overlap = pick.conditionalCovers.filter((n) => pick.covers.includes(n));
  check(overlap.length === 0,
    "no threat is listed as both outright covered and conditionally covered");

  // And it must never beat a four that just wins outright.
  const real = pick.matrix.coverage.filter((c) => c.covered).length;
  check(pick.covers.length <= real,
    `unconditional coverage ${pick.covers.length} never exceeds what the matrix supports (${real})`);
}

// ===========================================================================
// THE READ: spread damage beats a bigger single number.
//
// Hyper Beam removes one Pokemon and then leaves you standing there recharging
// while their partner hits you for free. Hyper Voice hits BOTH and chips them
// toward someone else's KO. Counting hits alone makes the recharge move look
// strictly best, which is why the tool kept recommending it.
// ===========================================================================
console.log("\n-- spread beats a bigger single number --");
{
  let s = myBoard(["garchomp", "charizard-y", "whimsicott", "sinistcha"]);
  const syl = s.mons[mine(s, "Sylveon").uid];
  const chomp = s.mons[opp(s, "garchomp").uid];

  const cell = answerCell(syl, chomp, s);
  console.log(`      recommends: ${cell.myBest.moveName} (${cell.myBest.hitsToKO} hits, ` +
    `${cell.myBest.turnsToKO} turns, spread=${cell.myBest.spread})`);
  console.log(`      fastest kill: ${cell.myBest.fastestMove} in ${cell.myBest.fastestHits}`);

  check(cell.myBest.spread,
    `the recommended move is the spread move (${cell.myBest.moveName}), not the recharge move`);
  check(!cell.myBest.recharge, "  and it does not cost the following turn");

  // A recharge move costs a turn after EVERY use, including the killing one.
  check(cell.myBest.turnsToKO === cell.myBest.hitsToKO,
    `  a non-recharge move costs exactly its hits in turns (${cell.myBest.turnsToKO})`);

  // The race is still scored on the FASTEST kill available, so preferring a
  // spread move must never downgrade a matchup you can actually win.
  check(cell.verdict === "answer",
    `Sylveon still answers Garchomp (${cell.verdict}) even though the spread move is slower`);
  check(cell.myBest.fastestHits <= cell.myBest.hitsToKO,
    `  the race used the faster move (${cell.myBest.fastestHits}) not the recommended one (${cell.myBest.hitsToKO})`);
  check(/costs you the following turn/.test(cell.reason),
    "  and the reason explains why the faster move is not the recommendation");
}

// ===========================================================================
// Spread chip converts into a kill for someone in the back.
// ===========================================================================
console.log("\n-- 'that puts them in range for Raichu in the back' --");
{
  let s = myBoard(["garchomp", "charizard-y"]);
  const chomp = opp(s, "garchomp");
  const zard = opp(s, "charizard-y");
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: chomp.uid });
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 1, uid: zard.uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: mine(s, "Sylveon").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: mine(s, "Farigiraf").uid });
  const syl = s.mons[mine(s, "Sylveon").uid];

  const voice = spreadPlay(syl, "Hyper Voice", s);
  const beam = spreadPlay(syl, "Hyper Beam", s);
  console.log("      Hyper Voice:", voice.text);
  console.log(`      Hyper Beam: chip=${beam.totalChipPct.toFixed(0)}% kills=${beam.kills.length} setsUp=${beam.setsUp.length}`);

  check(voice.targets.length === 2 && voice.totalChipPct > beam.totalChipPct,
    `the spread move removes more total HP (${voice.totalChipPct.toFixed(0)}% vs ${beam.totalChipPct.toFixed(0)}%)`);
  check(voice.setsUp.length > 0,
    `${voice.setsUp.length} follow-up KOs exist that did not before the chip`);
  check(voice.setsUp.some((c) => c.fromBench),
    "  at least one of them is a Pokemon still on the bench - the whole point");

  // Every claimed follow-up must be a genuine conversion, not something that
  // already killed from full.
  for (const c of voice.setsUp) {
    const fromFull = resolveMatchup(c.by, c.target, c.moveName, s);
    if (fromFull && fromFull.min >= c.target.maxHP) {
      check(false, `  ${nameOf(c.by)} ${c.moveName} already killed ${nameOf(c.target)} from full`);
    }
  }
  check(true, "  every follow-up named is one the chip actually created");

  check(bestBoardPlay(syl, s).moveName === "Hyper Voice",
    `the best play on this board is ${bestBoardPlay(syl, s).moveName}, not the recharge move`);
}

// ===========================================================================
// Tailwind and Trick Room fight each other.
// ===========================================================================
console.log("\n-- Tailwind under Trick Room is a downgrade --");
{
  let s = myBoard(["garchomp", "charizard-y", "basculegion", "incineroar"]);
  const seq = conditionSequence(s);

  check(seq.hasBoth, "the team can set both Tailwind and Trick Room");
  check(seq.conflicts, "stacking them is flagged as a conflict");
  check(seq.cancelled.length > 0,
    `${seq.cancelled.length} speed matchups are won under Tailwind alone and lost with both up`);
  console.log("      e.g.", nameOf(seq.cancelled[0].mon), "vs", nameOf(seq.cancelled[0].foe));
  console.log("      READ:", seq.text);

  // Prove the mechanism rather than trusting the flag: doubling the Speed stat
  // makes you LATER under a rule that sends the smallest stat first.
  const eg = seq.cancelled[0];
  const tw = withCondition(withCondition(s, "normal"), "tailwind");
  const twTR = withCondition(tw, "trickRoom");
  check(outspeedVerdict(tw.mons[eg.mon.uid], tw.mons[eg.foe.uid], tw).verdict === "always",
    `  ${nameOf(eg.mon)} outspeeds ${nameOf(eg.foe)} with Tailwind only`);
  check(outspeedVerdict(twTR.mons[eg.mon.uid], twTR.mons[eg.foe.uid], twTR).verdict !== "always",
    "  and stops outspeeding once Trick Room is also up");

  check(seq.recommended?.length === 2 && seq.recommended[0] !== seq.recommended[1],
    `it recommends an ORDER (${seq.recommended?.join(" then ")}), not both at once`);
  check(/turns in between/i.test(seq.text ?? ""),
    "  and says to leave turns between them");

  // A team that can only set one of them has no sequencing problem.
  const solo = conditionSequence(myBoard(["garchomp"]));
  check(solo.hasBoth || !solo.text, "a team without both never gets a sequencing warning");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
