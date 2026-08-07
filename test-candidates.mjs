// Usage-weighted candidates - run: node test-candidates.mjs
import { monFromThreatId, newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { USAGE, likely, INCLUSION_CUTOFF } from "./src/data/usage.js";
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
  check(USAGE.sinistcha.moves["Rage Powder"] > 95,
    `Sinistcha Rage Powder at ${USAGE.sinistcha.moves["Rage Powder"]}%`);
  check(USAGE.maushold.moves["Follow Me"] > 95,
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
  check(c0.best === "Chople Berry", `best guess is ${c0.best} (most used)`);

  // Rule out the Chople and the next candidate takes over.
  const ruled = reduce(s, {
    type: "RULE_OUT_ITEM", uid: gambit.uid, item: "Chople Berry",
  });
  const c1 = itemCandidates(ruled.mons[gambit.uid]);
  check(!c1.options.some((o) => o.name === "Chople Berry"), "ruling out Chople removes it");
  check(c1.best === "Black Glasses", `  best guess becomes ${c1.best}`);

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

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
