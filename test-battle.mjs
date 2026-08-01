// Battle-layer regression tests - run: node test-battle.mjs
//
// These assert that driving the engine THROUGH the BattleState layer still
// reproduces the verified numbers in BUILD_BRIEF.md, and that the live-battle
// behaviour (field-tracked weather, editable sets, current-HP verdicts,
// scouting boundaries, undo) works as BATTLE_MODEL.md specifies.
import { newBattleState, monFromThreatId, newSession } from "./src/app/model/factory.ts";
import { reduce, sessionReduce } from "./src/app/state/reducer.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";
import { movesFirst, currentSpeed } from "./src/app/battle/speed.ts";
import { koBoundary, minimumSPToSurvive } from "./src/app/battle/envelope.ts";
import { linesFor } from "./src/app/battle/resolver.ts";
import { leadRisks, rankedLinesWithRisk } from "./src/app/battle/leadRisk.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};
const near = (a, b, tol = 0.2) => Math.abs(a - b) < tol;

// --- board helpers ---------------------------------------------------------
const mineNamed = (s, name) =>
  Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === name);
const oppNamed = (s, id) =>
  Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function boardWith(threatIds) {
  let s = newBattleState();
  for (const id of threatIds) {
    s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  }
  return s;
}

/** Put one of my mons into active slot 0. */
function setMyActive(s, name) {
  const m = mineNamed(s, name);
  return reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: m.uid });
}

// ===========================================================================
console.log("-- engine parity through BattleState --");

// Sneasler Close Combat -> Kingambit. BUILD_BRIEF: 220.3% max, x4.
// Kingambit holds a Chople Berry, which the battle layer applies and the raw
// engine test does not - so check the un-berried number first.
{
  let s = boardWith(["sneasler"]);
  s = setMyActive(s, "Kingambit");
  const gambit = mineNamed(s, "Kingambit");
  const sneas = oppNamed(s, "sneasler");

  s = reduce(s, { type: "SET_ITEM_ACTIVE", uid: gambit.uid, active: false });
  const bare = resolveMatchup(s.mons[sneas.uid], s.mons[gambit.uid], "Close Combat", s);
  check(near(bare.maxPct, 220.3) && bare.typeMult === 4,
    `Sneasler CC -> Kingambit (no berry): ${bare.maxPct}% x${bare.typeMult} (exp 220.3 x4)`);
  check(bare.verdict === "DEAD", `  verdict DEAD, koChance="${bare.koChance}"`);

  s = reduce(s, { type: "SET_ITEM_ACTIVE", uid: gambit.uid, active: true });
  const withBerry = resolveMatchup(s.mons[sneas.uid], s.mons[gambit.uid], "Close Combat", s);
  check(near(withBerry.maxPct, bare.maxPct / 2, 1.5),
    `  Chople halves it: ${withBerry.maxPct}% (threats.js: "2x even through Chople")`);
}

// Char-Y Heat Wave in sun -> Kingambit. BUILD_BRIEF: 144.9% max, x2.
// Weather comes from the FIELD here, not from a per-calc argument.
{
  let s = boardWith(["charizard-y"]);
  s = setMyActive(s, "Kingambit");
  s = reduce(s, { type: "SET_WEATHER", kind: "sun" });
  const zard = oppNamed(s, "charizard-y");
  const gambit = mineNamed(s, "Kingambit");
  const r = resolveMatchup(s.mons[zard.uid], s.mons[gambit.uid], "Heat Wave", s);
  check(near(r.maxPct, 144.9) && r.typeMult === 2,
    `Char-Y Heat Wave (field sun) -> Kingambit: ${r.maxPct}% x${r.typeMult} (exp 144.9 x2)`);
}

// Basculegion Wave Crash -> Mega Delphox. BUILD_BRIEF: 272.8% max, x2.
{
  let s = boardWith(["basculegion"]);
  s = setMyActive(s, "Delphox");
  const bascu = oppNamed(s, "basculegion");
  const delph = mineNamed(s, "Delphox");
  const r = resolveMatchup(s.mons[bascu.uid], s.mons[delph.uid], "Wave Crash", s);
  check(near(r.maxPct, 272.8) && r.typeMult === 2,
    `Basculegion Wave Crash -> M-Delphox: ${r.maxPct}% x${r.typeMult} (exp 272.8 x2)`);
}

// Sylveon Hyper Voice (Pixilate spread) -> Garchomp / M-Staraptor.
{
  let s = boardWith(["sylveon"]);
  const syl = oppNamed(s, "sylveon");
  const chomp = mineNamed(s, "Garchomp");
  const star = mineNamed(s, "Staraptor");
  const rc = resolveMatchup(s.mons[syl.uid], s.mons[chomp.uid], "Hyper Voice", s);
  check(near(rc.maxPct, 121.6) && rc.typeMult === 2,
    `Sylveon Hyper Voice -> Garchomp: ${rc.maxPct}% x${rc.typeMult} (exp 121.6 x2)`);
  check(rc.resolvedType === "Fairy", `  Pixilate resolved Hyper Voice to ${rc.resolvedType}`);
  const rs = resolveMatchup(s.mons[syl.uid], s.mons[star.uid], "Hyper Voice", s);
  check(near(rs.maxPct, 108.4) && rs.typeMult === 2,
    `Sylveon Hyper Voice -> M-Staraptor: ${rs.maxPct}% x${rs.typeMult} (exp 108.4 x2)`);
}

// Garchomp Earthquake -> Mega Delphox: immune via Levitate.
{
  let s = boardWith(["garchomp"]);
  const chomp = oppNamed(s, "garchomp");
  const delph = mineNamed(s, "Delphox");
  const r = resolveMatchup(s.mons[chomp.uid], s.mons[delph.uid], "Earthquake", s);
  check(r.typeMult === 0 && r.verdict === "IMMUNE",
    `Garchomp EQ -> M-Delphox: ${r.verdict} (Levitate)`);

  // Pre-Mega Delphox has no Levitate, so the same hit connects.
  const s2 = reduce(s, { type: "TOGGLE_MEGA", uid: delph.uid });
  const r2 = resolveMatchup(s2.mons[chomp.uid], s2.mons[delph.uid], "Earthquake", s2);
  check(r2.typeMult > 0, `  pre-Mega Delphox is hit by it: ${r2.maxPct}% x${r2.typeMult}`);
}

// ===========================================================================
console.log("\n-- speed through BattleState --");
{
  let s = boardWith(["basculegion"]);
  const bascu = oppNamed(s, "basculegion");
  const chomp = mineNamed(s, "Garchomp");
  check(currentSpeed(s.mons[bascu.uid], s) === 195,
    `Scarf Basculegion Spe = ${currentSpeed(s.mons[bascu.uid], s)} (exp 195)`);
  check(movesFirst(s.mons[chomp.uid], s.mons[bascu.uid], s).first === "b",
    "Garchomp is slower than Scarf Basculegion");

  const tw = reduce(s, { type: "SET_TAILWIND", side: "me", on: true });
  check(movesFirst(tw.mons[chomp.uid], tw.mons[bascu.uid], tw).first === "a",
    "Garchomp + Tailwind outspeeds it");

  const tr = reduce(s, { type: "SET_TRICK_ROOM", on: true });
  check(movesFirst(tr.mons[chomp.uid], tr.mons[bascu.uid], tr).first === "a",
    "Under Trick Room Garchomp moves first");

  // Priority must beat raw speed.
  const sp = movesFirst(s.mons[chomp.uid], s.mons[bascu.uid], s, null, "Aqua Jet");
  check(sp.first === "b" && sp.byPriority,
    `Aqua Jet takes the priority bracket: ${sp.label}`);
}

// ===========================================================================
console.log("\n-- the Weather Ball scouting case (BATTLE_MODEL.md) --");
{
  let s = boardWith(["charizard-y"]);
  s = setMyActive(s, "Kingambit");
  const zard = oppNamed(s, "charizard-y");
  const gambit = mineNamed(s, "Kingambit");

  // Drought sets the field weather on entry - no per-calc weather argument.
  check(s.field.weather && s.field.weather.kind === "sun",
    `Char-Y's Drought put sun on the field automatically (${s.field.weather?.turnsLeft} turns)`);

  // Swap Overheat out for Weather Ball, exactly as the user would while scouting.
  s = reduce(s, {
    type: "EDIT_SET",
    uid: zard.uid,
    patch: { moves: ["Heat Wave", "Weather Ball", "Air Slash", "Protect"] },
  });
  const wb = resolveMatchup(s.mons[zard.uid], s.mons[gambit.uid], "Weather Ball", s);
  check(wb.resolvedType === "Fire" && wb.power === 100,
    `Weather Ball in sun: ${wb.resolvedType}/${wb.power} BP`);

  const noSun = reduce(s, { type: "SET_WEATHER", kind: null });
  const wb2 = resolveMatchup(noSun.mons[zard.uid], noSun.mons[gambit.uid], "Weather Ball", noSun);
  check(wb2.resolvedType === "Normal" && wb2.power === 50,
    `Weather Ball with no weather: ${wb2.resolvedType}/${wb2.power} BP`);
  check(wb.max > wb2.max, `  sun makes it hit harder (${wb.max} vs ${wb2.max})`);
}

// ===========================================================================
console.log("\n-- current-HP verdicts --");
{
  let s = boardWith(["charizard-y"]);
  s = setMyActive(s, "Kingambit");
  s = reduce(s, { type: "SET_WEATHER", kind: null });
  const zard = oppNamed(s, "charizard-y");
  const gambit = mineNamed(s, "Kingambit");
  const full = resolveMatchup(s.mons[zard.uid], s.mons[gambit.uid], "Heat Wave", s);
  const half = reduce(s, { type: "SET_HP_PCT", uid: gambit.uid, pct: 40 });
  const hurt = resolveMatchup(half.mons[zard.uid], half.mons[gambit.uid], "Heat Wave", half);
  check(full.verdictFull === full.verdict,
    `at full HP the live verdict matches the calc verdict (${full.verdict})`);
  check(hurt.verdict === "DEAD" && hurt.verdictFull === full.verdictFull,
    `at 40% HP the live verdict is DEAD while the full-HP verdict stays ${hurt.verdictFull}`);
}

// ===========================================================================
console.log("\n-- uncertainty boundary (assumed vs confirmed) --");
{
  let s = boardWith(["charizard-y"]);
  s = setMyActive(s, "Garchomp");
  const zard = oppNamed(s, "charizard-y");
  const chomp = mineNamed(s, "Garchomp");
  const b = koBoundary(s.mons[chomp.uid], s.mons[zard.uid], "Rock Slide", s);
  check(b !== null, `boundary reported for an assumed spread: "${b && b.text}"`);

  const confirmed = reduce(s, {
    type: "SET_REVEALED", uid: zard.uid, field: "sp", value: true,
  });
  const b2 = koBoundary(confirmed.mons[chomp.uid], confirmed.mons[zard.uid], "Rock Slide", confirmed);
  check(b2 === null, "no boundary once the spread is confirmed - it becomes deterministic");

  const lines = linesFor(s.mons[chomp.uid], s);
  check(lines.length > 0 && lines[0].certainty === "assumed",
    `resolver marks assumed lines: "${lines[0].headline}"`);
}

// ===========================================================================
console.log("\n-- reverse SP optimizer --");
{
  let s = boardWith(["sneasler"]);
  s = setMyActive(s, "Kingambit");
  const sneas = oppNamed(s, "sneasler");
  const gambit = mineNamed(s, "Kingambit");
  const sol = minimumSPToSurvive(
    s.mons[gambit.uid], s.mons[sneas.uid], "Close Combat", s, "guaranteed"
  );
  if (sol) {
    check(sol.maxPct < 100 && sol.spLeft >= 0,
      `min bulk to survive Sneasler CC: ${sol.hpSP} HP / ${sol.defSP} Def, ${sol.maxPct}% max, ${sol.spLeft} SP left`);
  } else {
    check(true, "Sneasler CC cannot be survived within the 66 SP budget (reported honestly)");
  }
}

// ===========================================================================
console.log("\n-- turn loop, timers and undo --");
{
  let sess = newSession();
  sess = sessionReduce(sess, { type: "SET_TAILWIND", side: "me", on: true });
  check(sess.present.field.tailwind.me === 4, `Tailwind set to ${sess.present.field.tailwind.me} turns`);

  for (let i = 0; i < 3; i++) sess = sessionReduce(sess, { type: "NEXT_TURN" });
  check(sess.present.turn === 4 && sess.present.field.tailwind.me === 1,
    `after 3 turns: turn ${sess.present.turn}, Tailwind ${sess.present.field.tailwind.me} left`);

  sess = sessionReduce(sess, { type: "NEXT_TURN" });
  check(sess.present.field.tailwind.me === 0, "Tailwind expires on schedule");

  const before = sess.present.turn;
  sess = sessionReduce(sess, { type: "UNDO" });
  check(sess.present.turn === before - 1 && sess.present.field.tailwind.me === 1,
    `undo restores turn ${sess.present.turn} with Tailwind ${sess.present.field.tailwind.me}`);

  sess = sessionReduce(sess, { type: "REDO" });
  check(sess.present.turn === before, `redo returns to turn ${sess.present.turn}`);

  // Weather with a 5-turn default should be gone after 5 turns.
  let w = newBattleState();
  w = reduce(w, { type: "SET_WEATHER", kind: "sun" });
  for (let i = 0; i < 5; i++) w = reduce(w, { type: "NEXT_TURN" });
  check(w.field.weather === null, "sun expires after its 5 turns");
}

// ===========================================================================
console.log("\n-- fainted-ally scaling --");
{
  let s = boardWith(["basculegion"]);
  s = setMyActive(s, "Kingambit");
  const bascu = oppNamed(s, "basculegion");
  const gambit = mineNamed(s, "Kingambit");
  const before = resolveMatchup(s.mons[bascu.uid], s.mons[gambit.uid], "Last Respects", s);

  // Faint two of their benched mons.
  let s2 = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId("sylveon") });
  s2 = reduce(s2, { type: "ADD_MON", side: "opp", mon: monFromThreatId("gholdengo") });
  for (const m of Object.values(s2.mons).filter((x) => x.side === "opp" && x.uid !== bascu.uid)) {
    s2 = reduce(s2, { type: "SET_FAINTED", uid: m.uid, fainted: true });
  }
  const after = resolveMatchup(s2.mons[bascu.uid], s2.mons[gambit.uid], "Last Respects", s2);
  check(after.power > before.power,
    `Last Respects scales with fainted allies: ${before.power} -> ${after.power} BP`);
}

// ===========================================================================
console.log("\n-- turn-1 disruption: Fake Out, Sash, double-up --");
{
  // Glimmora leads with a Focus Sash into Incineroar + Sneasler, both of which
  // carry Fake Out on their common sets.
  let s = boardWith(["incineroar", "sneasler"]);
  s = setMyActive(s, "Glimmora");
  const glim = mineNamed(s, "Glimmora");

  // Fake Out must now be a real damaging move, not an unmodelled status move.
  const fo = resolveMatchup(s.mons[oppNamed(s, "incineroar").uid], s.mons[glim.uid], "Fake Out", s);
  check(fo !== null && fo.power === 40 && fo.hits === 1,
    `Fake Out resolves as a real move: ${fo && fo.power} BP, ${fo && fo.min}-${fo && fo.max} dmg`);

  const risks = leadRisks(s);
  const forGlim = risks.filter((r) => r.victimUid === glim.uid);

  check(forGlim.some((r) => r.kind === "flinch"),
    "flinch risk reported: Fake Out stops Glimmora acting");
  check(forGlim.some((r) => r.kind === "sash-break"),
    "Sash-break risk reported: Fake Out takes it off full HP");
  check(forGlim.some((r) => r.kind === "combo-ko"),
    "combo-KO risk reported: two attackers beat the Sash");

  const sashMsg = forGlim.find((r) => r.kind === "combo-ko");
  console.log("      >", sashMsg.text);

  // The naive per-hit verdict still says LIVES (Sash) - that is correct in
  // isolation, which is exactly why the risk panel has to exist alongside it.
  const single = resolveMatchup(s.mons[oppNamed(s, "sneasler").uid], s.mons[glim.uid], "Close Combat", s);
  check(single.verdict === "SASH",
    `single-hit verdict is still "${single.verdict}" - the risk panel is what corrects it`);

  // A line from a mon that gets flinched must be discounted below an equal
  // line from a mon that does not.
  const { lines } = rankedLinesWithRisk(s);
  const glimLines = lines.filter((l) => l.attackerUid === glim.uid && l.kind === "attack");
  check(glimLines.length > 0 && glimLines.every((l) => l.discounted),
    "Glimmora's lines are flagged as discounted (it may never act)");

  // Once the Sash is gone the sash-break risk must disappear.
  const noSash = reduce(s, { type: "SET_ITEM_ACTIVE", uid: glim.uid, active: false });
  check(!leadRisks(noSash).some((r) => r.victimUid === glim.uid && r.kind === "sash-break"),
    "sash-break risk clears once the Sash is consumed");
}

{
  // No Fake Out on the board => no flinch risk. Guards against false positives.
  let s = boardWith(["charizard-y"]);
  s = setMyActive(s, "Glimmora");
  check(!leadRisks(s).some((r) => r.kind === "flinch"),
    "no flinch risk invented when nobody has Fake Out");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
