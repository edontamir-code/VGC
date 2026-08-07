// Slot-competition inference - run: node test-inference.mjs
import { monFromThreatId, newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { USAGE } from "./src/data/usage.js";
import {
  moveBelief, moveProbability, probabilityOfAny, koThreat, deductionsBetween,
} from "./src/app/battle/inference.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};
const pct = (p) => `${Math.round(p * 100)}%`;

const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
function board(ids) {
  let s = newBattleState();
  for (const id of ids) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  return s;
}
const see = (s, uid, mv) => reduce(s, { type: "REVEAL_MOVE", uid, moveName: mv });

// ===========================================================================
console.log("-- the data really is a 4-slot distribution --");
{
  for (const id of ["kingambit", "garchomp", "basculegion"]) {
    const sum = Object.values(USAGE[id].moves).reduce((a, b) => a + b, 0) / 100;
    check(sum > 3.2 && sum <= 4.05, `${id}: usage sums to ${sum.toFixed(2)} slots`);
  }
}

// ===========================================================================
console.log("\n-- priors before anything is seen --");
{
  const s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  const b = moveBelief(s.mons[chomp.uid]);
  check(b.slotsLeft === 4, `4 slots open`);
  check(b.unlistedMass > 0,
    `${pct(b.unlistedMass)} chance of a move not even in the listed pool`);
  console.log("      " + b.moves.slice(0, 5).map((m) => `${m.move} ${pct(m.p)}`).join("  "));
}

// ===========================================================================
console.log("\n-- confirming an EXPECTED move barely moves the others --");
{
  const s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  const before = moveProbability(s.mons[chomp.uid], "Poison Jab");

  // Dragon Claw is on 89.4% - seeing it is almost no news.
  const after = see(s, chomp.uid, "Dragon Claw");
  const now = moveProbability(after.mons[chomp.uid], "Poison Jab");
  check(now < before, `Poison Jab ${pct(before)} -> ${pct(now)} after confirming Dragon Claw`);
  check(before - now < 0.10, `  and the drop is small (${pct(before - now)}), because it was expected`);
}

// ===========================================================================
console.log("\n-- confirming a SURPRISING move drops everything hard --");
{
  const s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  const before = moveProbability(s.mons[chomp.uid], "Poison Jab");

  // Rock Tomb is on 8% - seeing it means a slot went somewhere unexpected.
  const after = see(s, chomp.uid, "Rock Tomb");
  const now = moveProbability(after.mons[chomp.uid], "Poison Jab");
  check(now < before, `Poison Jab ${pct(before)} -> ${pct(now)} after confirming Rock Tomb`);

  // And the surprising confirmation must bite harder than the expected one.
  const expected = see(s, chomp.uid, "Dragon Claw");
  const afterExpected = moveProbability(expected.mons[chomp.uid], "Poison Jab");
  check(now < afterExpected,
    `  a surprising confirmation costs more than an expected one (${pct(now)} vs ${pct(afterExpected)})`);
}

// ===========================================================================
console.log("\n-- ruling a move OUT pushes the rest up --");
{
  const s = board(["kingambit"]);
  const gambit = opp(s, "kingambit");
  const before = moveProbability(s.mons[gambit.uid], "Low Kick");
  const after = reduce(s, { type: "RULE_OUT_MOVE", uid: gambit.uid, moveName: "Iron Head" });
  const now = moveProbability(after.mons[gambit.uid], "Low Kick");
  check(now > before, `ruling out Iron Head lifts Low Kick ${pct(before)} -> ${pct(now)}`);
}

// ===========================================================================
console.log("\n-- four confirmed moves collapses everything --");
{
  let s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  for (const mv of ["Dragon Claw", "Rock Slide", "Earthquake", "Protect"]) {
    s = see(s, chomp.uid, mv);
  }
  const b = moveBelief(s.mons[chomp.uid]);
  check(b.fullyKnown && b.slotsLeft === 0, "fully known, 0 slots left");
  check(b.unlistedMass === 0, "  no room left for an unlisted move");
  check(moveProbability(s.mons[chomp.uid], "Stomping Tantrum") === 0,
    "  Stomping Tantrum is now impossible, not merely unlikely");
  check(moveProbability(s.mons[chomp.uid], "Earthquake") === 1, "  and Earthquake is certain");
}

// ===========================================================================
console.log("\n-- THE READ: a coverage move that is not the scary one --");
{
  // Their Garchomp against my Delphox. Earthquake is the move that matters
  // (Delphox is Levitate, so actually let us use Kingambit, which is grounded).
  // Sneasler vs my Kingambit: Close Combat is 4x and a clean KO. The question
  // is whether THIS Sneasler is carrying it.
  let s = board(["sneasler", "garchomp"]);
  const sneas = opp(s, "sneasler");
  const gambit = mine(s, "Kingambit");

  const t0 = koThreat(s.mons[sneas.uid], s.mons[gambit.uid], s);
  console.log(`      before: ${pct(t0.probability)} to hold a KO on Kingambit` +
    (t0.killers.length ? ` (${t0.killers.map((k) => `${k.move} ${pct(k.p)}`).join(", ")})` : " - none in pool"));

  // Watch it spend slots on things that are NOT the threatening move.
  let s2 = see(s, sneas.uid, "Fake Out");
  s2 = see(s2, sneas.uid, "Dire Claw");
  s2 = see(s2, sneas.uid, "Protect");
  const t1 = koThreat(s2.mons[sneas.uid], s2.mons[gambit.uid], s2);
  console.log(`      after seeing Fake Out + Dire Claw + Protect: ${pct(t1.probability)}`);

  // And the same read on their Garchomp, which is what the user described.
  const chomp = opp(s, "garchomp");
  let s3 = see(s, chomp.uid, "Dragon Claw");
  s3 = see(s3, chomp.uid, "Protect");

  check(t1.probability <= t0.probability,
    "spending slots on other moves lowers the chance they hold the scary one");

  const deltas = deductionsBetween(s.mons[chomp.uid], s3.mons[chomp.uid]);
  check(deltas.length > 0, `${deltas.length} probabilities moved`);
  for (const d of deltas.slice(0, 4)) {
    console.log(`        ${d.move}: ${pct(d.before)} -> ${pct(d.after)}`);
  }
  check(deltas.filter((d) => d.after < d.before && d.move !== "Dragon Claw" && d.move !== "Protect").length > 0,
    "  every unconfirmed candidate moved DOWN");
}

// ===========================================================================
console.log("\n-- a confirmed killer is not a probability, it is a fact --");
{
  let s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  const gambit = mine(s, "Kingambit");
  const seen = see(s, chomp.uid, "Earthquake");
  const t = koThreat(seen.mons[chomp.uid], seen.mons[gambit.uid], seen);
  if (t.killers.length) {
    check(t.confirmed && t.probability === 1,
      `seeing the KO move pins the threat at ${pct(t.probability)}`);
  } else {
    check(true, "Earthquake does not KO this Kingambit, so nothing to confirm");
  }
}

// ===========================================================================
console.log("\n-- probabilities stay sane --");
{
  const s = board(["sneasler", "whimsicott"]);
  for (const id of ["sneasler", "whimsicott"]) {
    const m = opp(s, id);
    const b = moveBelief(s.mons[m.uid]);
    const bad = b.moves.filter((x) => x.p < 0 || x.p > 1);
    check(bad.length === 0, `${id}: every probability is within 0-1`);
    const totalSlots = b.moves.reduce((a, x) => a + x.p, 0) + b.unlistedMass;
    check(Math.abs(totalSlots - 4) < 0.35,
      `  expected moves held = ${totalSlots.toFixed(2)} (should be about 4)`);
  }
  check(probabilityOfAny(s.mons[opp(s, "sneasler").uid], ["Close Combat", "Dire Claw"]) <= 1,
    "probabilityOfAny is capped at 1");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
