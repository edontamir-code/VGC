// Usage-weighted candidates - run: node test-candidates.mjs
import { monFromThreatId, newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { USAGE, likely, INCLUSION_CUTOFF, USAGE_SOURCE, spreadsFor } from "./src/data/usage.js";
import { THREATS } from "./src/data/threats.js";
import {
  itemCandidates, abilityCandidates, weightedMovePool, uncertainty,
} from "./src/app/battle/candidates.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
function board(ids) {
  let s = newBattleState();
  for (const id of ids) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  return s;
}

console.log("-- the 5% cutoff --");
{
  check(INCLUSION_CUTOFF === 5, `cutoff is ${INCLUSION_CUTOFF}%`);

  const chomp = likely(USAGE.garchomp.moves);
  const names = chomp.map((o) => o.name);
  check(!names.includes("Scale Shot"), "Garchomp's Scale Shot (3.1%) is cut - ladder noise");
  check(names.includes("Stomping Tantrum"), "  but Stomping Tantrum (40.3%) survives");
  console.log("      Garchomp pool:", names.join(", "));

  const gambit = likely(USAGE.kingambit.moves).map((o) => o.name);
  check(!gambit.includes("Brick Break") && !gambit.includes("Quick Guard"),
    "Kingambit's 1.1% Brick Break and 0.2% Quick Guard are cut");
  check(gambit.includes("Sucker Punch") && gambit.includes("Low Kick"),
    "  Sucker Punch (99.5%) and Low Kick (43.7%) stay");
}

console.log("\n-- this is DOUBLES data --");
{
  // Rage Powder and Follow Me do nothing in a singles battle. Their presence
  // at 95%+ is proof of format.
  // usage.js is GENERATED now, so exact percentages move on every refresh.
  // Pinning them meant a routine import broke the suite while proving nothing.
  // What this test is for is the FORMAT claim, and a redirection move on most
  // of the ladder settles that at 80% as firmly as at 95%.
  check(USAGE.sinistcha.moves["Rage Powder"] > 80,
    `Sinistcha Rage Powder at ${USAGE.sinistcha.moves["Rage Powder"]}%`);
  check(USAGE.maushold.moves["Follow Me"] > 80,
    `Maushold Follow Me at ${USAGE.maushold.moves["Follow Me"]}%`);
  check(USAGE.incineroar.moves["Fake Out"] > 99,
    `Incineroar Fake Out at ${USAGE.incineroar.moves["Fake Out"]}%`);
}

console.log("\n-- item candidates narrow as you observe --");
{
  let s = board(["kingambit"]);
  const gambit = opp(s, "kingambit");

  const c0 = itemCandidates(s.mons[gambit.uid]);
  check(c0.options.length > 1 && !c0.known,
    `unknown: ${c0.options.map((o) => `${o.name} ${o.pct}%`).join(", ")}`);
  // The claim is "best guess = most used", not "= Chople Berry". Which item
  // tops Kingambit is a fact about the meta and changes on every import; that
  // `best` tracks the top of the list is the behaviour worth pinning.
  const topItem = c0.options.reduce((a, b) => (b.pct > a.pct ? b : a));
  check(c0.best === topItem.name, `best guess is ${c0.best}, most used at ${topItem.pct}%`);

  // Rule out the Chople and the next candidate takes over.
  const ruled = reduce(s, {
    type: "RULE_OUT_ITEM", uid: gambit.uid, item: "Chople Berry",
  });
  const c1 = itemCandidates(ruled.mons[gambit.uid]);
  check(!c1.options.some((o) => o.name === "Chople Berry"), "ruling out Chople removes it");
  const nextBest = c1.options.reduce((a, b) => (b.pct > a.pct ? b : a));
  check(c1.best === nextBest.name, `  best guess becomes ${c1.best}`);

  // Confirming pins it entirely.
  const seen = reduce(s, { type: "SET_REVEALED", uid: gambit.uid, field: "item", value: true });
  const c2 = itemCandidates(seen.mons[gambit.uid]);
  check(c2.known && c2.confirmed === "Chople Berry", `confirmed: ${c2.confirmed}`);
}

console.log("\n-- ability candidates: the Venusaur-style split --");
{
  let s = board(["swampert"]);
  const swamp = opp(s, "swampert");
  const a = abilityCandidates(s.mons[swamp.uid]);
  check(a.options.length === 2 && !a.known,
    `Swampert could be ${a.options.map((o) => `${o.name} ${o.pct}%`).join(" or ")}`);

  // Aerodactyl is the real coin-flip: 61% Mega, 35% Focus Sash.
  let s2 = board(["aerodactyl"]);
  const aero = opp(s2, "aerodactyl");
  const items = itemCandidates(s2.mons[aero.uid]);
  check(items.options.length >= 2,
    `Aerodactyl: ${items.options.map((o) => `${o.name} ${o.pct}%`).join(", ")} - Mega or Sash is genuinely unknown`);
}

console.log("\n-- a move you have SEEN is certain, however rare --");
{
  let s = board(["sneasler"]);
  const sneas = opp(s, "sneasler");

  const before = weightedMovePool(s.mons[sneas.uid]).map((o) => o.name);
  check(!before.includes("Feint"), "Feint (3.5%) is below the cutoff and not planned around");

  const seen = reduce(s, { type: "REVEAL_MOVE", uid: sneas.uid, moveName: "Feint" });
  const after = weightedMovePool(seen.mons[sneas.uid]);
  const feint = after.find((o) => o.name === "Feint");
  check(feint && feint.pct === 100,
    "once you SEE the Feint it is certain, and it stays in the pool for the rest of the game");
}

console.log("\n-- uncertainty shrinks as you scout --");
{
  let s = board(["garchomp"]);
  const chomp = opp(s, "garchomp");
  const u0 = uncertainty(s.mons[chomp.uid]);

  let known = s;
  for (const mv of ["Dragon Claw", "Rock Slide", "Earthquake", "Protect"]) {
    known = reduce(known, { type: "REVEAL_MOVE", uid: chomp.uid, moveName: mv });
  }
  known = reduce(known, { type: "SET_REVEALED", uid: chomp.uid, field: "item", value: true });
  known = reduce(known, { type: "SET_REVEALED", uid: chomp.uid, field: "ability", value: true });
  known = reduce(known, { type: "SET_REVEALED", uid: chomp.uid, field: "sp", value: true });
  const u1 = uncertainty(known.mons[chomp.uid]);

  check(u0 > 50, `unscouted Garchomp is ${u0}% unknown`);
  check(u1 === 0, `fully scouted it is ${u1}% unknown`);
  check(u1 < u0, "  scouting monotonically reduces uncertainty");
}

console.log("\n-- usage data lines up with the curated sets --");
{
  let mismatches = 0;
  for (const t of THREATS) {
    const u = USAGE[t.id];
    if (!u) continue;
    // The set's four moves should all be options we plan around.
    const pool = likely(u.moves).map((o) => o.name);
    const missing = t.moves.filter((m) => m && !pool.includes(m));
    if (missing.length) {
      mismatches++;
      console.log(`   ${t.name}: set move(s) below cutoff: ${missing.join(", ")}`);
    }
  }
  check(mismatches === 0, "every curated set move is above the 5% cutoff");
}

// ===========================================================================
// usage.js is GENERATED by scripts/import-usage.mjs.
//
// These check the SHAPE the app depends on, never the numbers - the numbers
// are meant to change, and a test that breaks on a routine data refresh is a
// test that will be deleted rather than read.
// ===========================================================================
console.log("\n-- the generated usage file is well formed --");
{
  check(USAGE_SOURCE && USAGE_SOURCE.format === "Doubles",
    `it records where it came from: ${USAGE_SOURCE?.format} ${USAGE_SOURCE?.season}, fetched ${USAGE_SOURCE?.fetchedAt}`);

  const ids = Object.keys(USAGE);
  check(ids.length === USAGE_SOURCE.species,
    `all ${ids.length} species survived the import - a failed fetch keeps the stale entry rather than dropping the species`);

  const missing = ids.filter((id) =>
    !USAGE[id].moves || !USAGE[id].items || !USAGE[id].abilities || !USAGE[id].natures);
  check(missing.length === 0,
    `every record carries moves/items/abilities/natures${missing.length ? ": missing " + missing.join(", ") : ""}`);

  // Abilities are the one distribution that has to be near-complete: a missing
  // entry reads as "cannot have it", which silently rules out a real set.
  const badAbility = ids.filter((id) => {
    const t = Object.values(USAGE[id].abilities).reduce((a, b) => a + b, 0);
    return t < 95 || t > 105;
  });
  check(badAbility.length === 0,
    `every ability distribution sums to ~100%${badAbility.length ? ": " + badAbility.join(", ") : ""}`);

  // THE NEW DATA: real SP spreads. Champions gives 66 points, max 32 per stat.
  let count = 0, offBudget = 0, overCap = 0;
  for (const id of ids) {
    const spreads = spreadsFor(id);
    for (const s of spreads) {
      count++;
      const sum = Object.values(s.sp).reduce((a, b) => a + b, 0);
      // Anything not totalling 66 is not a legal build. Those are KEPT, but
      // must carry an explicit total so they can never pass as legal.
      if (sum !== 66) {
        offBudget++;
        if (s.total !== sum) check(false, `${id}: a ${sum}-point spread has no explicit total`);
      }
      if (Object.values(s.sp).some((v) => v > 32)) overCap++;
    }
    // Callers take [0] as the modal spread, so the order is load-bearing.
    const unsorted = spreads.some((x, i) => i > 0 && x.pct > spreads[i - 1].pct);
    if (unsorted) check(false, `${id}: spreads are not sorted most-used first`);
  }
  check(count > 100, `${count} real SP spreads imported (${offBudget} not totalling 66, all flagged)`);
  check(overCap === 0, `no spread exceeds the 32-point per-stat cap`);
  check(spreadsFor("nosuchmon").length === 0,
    "an unknown species returns no spreads rather than throwing");

  const chomp = spreadsFor("garchomp")[0];
  console.log(`      modal Garchomp: ${JSON.stringify(chomp.sp)} at ${chomp.pct}%`);
  check(chomp.pct > 20,
    "  and the modal spread is concentrated enough to be worth inferring against");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
