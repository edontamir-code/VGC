// The chat console and damage-based spread inference - run: node test-console.mjs
//
// Two things here. The console is the whole game in one box: their six, the
// leads, then every turn. The inference is the part that makes the numbers you
// type worth typing - "Heat Wave did 82%" is a MEASUREMENT of their Special
// Attack, and it holds for the rest of the game.
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { runCommand, phaseOf } from "./src/app/input/command.ts";
import { briefFor, plannerBrief } from "./src/app/battle/brief.ts";
import { searchPlans } from "./src/app/search/plan.ts";
import { actionLabel } from "./src/app/sim/actions.ts";
import {
  budgetRead, consistentStats, damageContradiction, narrowFromDamage, possibleStats, SP_TOTAL,
} from "./src/app/battle/damageInference.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";
import { activeProfile } from "./src/app/battle/stats.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const nameOf = (m) => activeProfile(m).displayName;
const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

/** Drive the console the way a player would, returning the final board. */
function play(scripts) {
  let s = newBattleState();
  const results = [];
  for (const t of scripts) {
    const r = runCommand(t, s);
    for (const a of r.actions) s = reduce(s, a);
    results.push(r);
  }
  return { state: s, results };
}

// ===========================================================================
console.log("-- one box, three phases --");
{
  let s = newBattleState();
  check(phaseOf(s) === "roster", "an empty board is waiting for their six");

  const r1 = runCommand("zard, incin, gambit, chomp, bascu, whims", s);
  check(r1.kind === "roster", `a bare list of names is read as their team (${r1.kind})`);
  for (const a of r1.actions) s = reduce(s, a);
  check(Object.values(s.mons).filter((m) => m.side === "opp").length === 6,
    "  all six land on the board");
  check(phaseOf(s) === "leads" || phaseOf(s) === "turn",
    "  and the console moves on from the roster phase");

  const r2 = runCommand("they lead whims and incin", s);
  check(r2.kind === "leads" && /Whimsicott/.test(r2.echo),
    `"they lead X and Y" sets THEIR leads: ${r2.echo}`);
  for (const a of r2.actions) s = reduce(s, a);
  check(s.sides.opp.active.map((u) => s.mons[u].set.speciesId).includes("whimsicott"),
    "  Whimsicott is actually on the field afterwards");

  const r3 = runCommand("we lead staraptor and arcanine", s);
  check(r3.kind === "leads" && /Staraptor/.test(r3.echo),
    `"we lead X and Y" sets MINE, not theirs: ${r3.echo}`);
  for (const a of r3.actions) s = reduce(s, a);
  check(s.sides.me.active.map((u) => s.mons[u].set.speciesId).sort().join(",") === "Arcanine,Staraptor",
    "  and my board matches what I said");

  const r4 = runCommand("whims tailwind, staraptor close combat on incin", s);
  check(r4.kind === "turn", `once both leads are out, the same box takes turns (${r4.kind})`);

  // The echo must name the ACTIVE form. A stone holder that is not this
  // battle's Mega must never be echoed back as its Mega.
  check(!/Mega Staraptor/.test(r4.echo),
    `Staraptor is not the Mega here, so it is not echoed as one: "${r4.echo}"`);
}

// ===========================================================================
console.log("\n-- explicit intent beats the phase guess --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead whims and incin",
    "we lead staraptor and arcanine",
  ]);
  // Mid-game, "they lead X" still means "put X out" - saying what happened
  // should never depend on which screen you are looking at.
  const r = runCommand("they lead zard and gambit", state);
  check(r.kind === "leads" && /Charizard/.test(r.echo),
    `a lead statement works in the turn phase too: ${r.echo}`);

  const bad = runCommand("they lead pikachu and mew", state);
  check(bad.kind === "error" && bad.problems.length === 2,
    "names that are not on their roster are reported, not guessed at");
  check(bad.actions.length === 0, "  and nothing is dispatched");
}

// ===========================================================================
console.log("\n-- the brief changes with the phase --");
{
  let s = newBattleState();
  check(/their six/i.test(briefFor(s).headline), "empty board asks for their six");

  const r = runCommand("zard, incin, gambit, chomp, bascu, whims", s);
  for (const a of r.actions) s = reduce(s, a);
  const b = briefFor(s);
  check(b.advice.some((a) => /^Bring /.test(a)), `after the roster it recommends a four: ${b.advice[0]}`);
  check(b.advice.some((a) => /is your Mega/.test(a)), "  and names which Pokemon Mega Evolves");
}

// ===========================================================================
// THE MEASUREMENT: their damage tells you their spread.
// ===========================================================================
console.log("\n-- 'Heat Wave did 82%' is a measurement of Special Attack --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
  ]);
  const zard = state.mons[opp(state, "charizard-y").uid];
  const raichu = state.mons[mine(state, "Raichu").uid];

  const all = possibleStats(zard, "spa");
  check(all.length > 50, `${all.length} Special Attack values are legal before any evidence`);
  const spread = { min: Math.min(...all.map((o) => o.stat)), max: Math.max(...all.map((o) => o.stat)) };
  console.log(`      SpA could be ${spread.min}-${spread.max}`);

  // A hard hit proves a high stat; a weaker one proves a lower one. The band
  // has to sit inside what SOME legal spread can actually do - Heat Wave in
  // sun into an Electric type is a big hit even from a minimal Charizard.
  const band = resolveMatchup(zard, raichu, "Heat Wave", state);
  console.log(`      the assumed spread does ${band.minPct}-${band.maxPct}%`);
  for (const pct of [84, 88, 96]) {
    const damage = Math.round((raichu.maxHP * pct) / 100);
    const kept = consistentStats(
      { attackerUid: zard.uid, defenderUid: raichu.uid, moveName: "Heat Wave", damage, defenderMaxHP: raichu.maxHP },
      "attacker", "spa", state
    );
    const lo = Math.min(...kept.map((o) => o.stat));
    const hi = Math.max(...kept.map((o) => o.stat));
    console.log(`      ${pct}% -> SpA ${lo}-${hi} (${kept.length} of ${all.length} still possible)`);
    check(kept.length > 0 && kept.length < all.length,
      `  ${pct}% rules out some spreads but never all of them`);
  }

  // Harder hit => strictly higher floor. If this ever inverts, the inference
  // is backwards and every downstream claim is wrong.
  const floorFor = (pct) => {
    const damage = Math.round((raichu.maxHP * pct) / 100);
    const kept = consistentStats(
      { attackerUid: zard.uid, defenderUid: raichu.uid, moveName: "Heat Wave", damage, defenderMaxHP: raichu.maxHP },
      "attacker", "spa", state
    );
    return Math.min(...kept.map((o) => o.stat));
  };
  check(floorFor(96) > floorFor(88) && floorFor(88) >= floorFor(84),
    `a harder hit always implies a higher floor (${floorFor(84)} <= ${floorFor(88)} < ${floorFor(96)})`);

  // Soundness: the TRUE stat must always survive its own damage roll.
  const truth = resolveMatchup(zard, raichu, "Heat Wave", state);
  for (const damage of [truth.min, Math.round((truth.min + truth.max) / 2), truth.max]) {
    const kept = consistentStats(
      { attackerUid: zard.uid, defenderUid: raichu.uid, moveName: "Heat Wave", damage, defenderMaxHP: raichu.maxHP },
      "attacker", "spa", state
    );
    const trueStat = activeProfile(zard).base.spa;
    if (!kept.some((o) => o.sp === (zard.set.sp.spa ?? 0))) {
      check(false, `the assumed spread was ruled out by its OWN damage roll (${damage}), base ${trueStat}`);
    }
  }
  check(true, "the true spread is never ruled out by damage it could actually have dealt");
}

// ===========================================================================
console.log("\n-- typing the HP numbers narrows them, live --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
    "zard heat wave, raichu to 18%, staraptor to 64%",
  ]);
  const zard = state.mons[opp(state, "charizard-y").uid];

  check(zard.statBounds.spa, "recording the turn wrote a Special Attack bound onto Charizard");
  console.log(`      SpA now ${zard.statBounds.spa.min}-${zard.statBounds.spa.max}`);
  const full = possibleStats(zard, "spa");
  check(zard.statBounds.spa.min > Math.min(...full.map((o) => o.stat)),
    "  and it is genuinely narrower than the prior");

  check(state.log.some((l) => l.kind === "scout" && /SPA is/.test(l.text)),
    "  the deduction is written to the log in words");

  // A KO teaches almost nothing - "at least lethal" is far weaker than a
  // number - so it must not be used to narrow anything.
  const koed = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
    "zard heat wave, raichu fainted",
  ]).state;
  const zardKO = koed.mons[opp(koed, "charizard-y").uid];
  check(!zardKO.statBounds.spa,
    "a KO does not narrow anything - it only proves 'at least lethal'");
}

// ===========================================================================
console.log("\n-- the budget deduction --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
  ]);
  const zard = state.mons[opp(state, "charizard-y").uid];

  check(SP_TOTAL === 66, "the budget is 66 SP across all six stats");

  const none = budgetRead(zard, {});
  check(none.committed === 0 && none.remaining === 66 && none.text === null,
    "with nothing measured, no claim is made about their spread");

  const heavy = budgetRead(zard, { spa: 28 });
  check(heavy.committed === 28 && heavy.remaining === 38,
    `28 SP proved in SpA leaves at most ${heavy.remaining} for everything else`);
  check(/leaving at most 38/.test(heavy.text),
    `  and the remainder is stated: "${heavy.text}"`);

  // The strong claim - "it cannot ALSO be bulky" - is only made when the
  // remainder genuinely cannot buy bulk. 38 left still buys 32 HP and change,
  // so it must NOT fire there.
  check(!/cannot be both this offensive and bulky/.test(heavy.text),
    "  38 SP left still buys real bulk, so no 'cannot be both' claim is made");

  const proven = budgetRead(zard, { spa: 30, atk: 8 });
  check(proven.remaining === 28 && /cannot be both this offensive and bulky/.test(proven.text),
    `once only ${proven.remaining} SP remain, the tool does say it cannot also be bulky`);

  const light = budgetRead(zard, { spa: 4 });
  check(!/cannot be both/.test(light.text ?? ""),
    "a small commitment does NOT claim they cannot also be bulky");

  // A boosting nature is free, so a stat reachable without SP proves nothing.
  const n = narrowFromDamage(
    {
      attackerUid: zard.uid,
      defenderUid: state.mons[mine(state, "Raichu").uid].uid,
      moveName: "Heat Wave",
      damage: Math.round(state.mons[mine(state, "Raichu").uid].maxHP * 0.82),
      defenderMaxHP: state.mons[mine(state, "Raichu").uid].maxHP,
    },
    state
  );
  const spa = n.find((x) => x.key === "spa");
  if (spa && Math.min(...spa.sp) === 0) {
    check(/no investment is proved yet/.test(spa.text),
      "when a boosting nature explains the damage, no SP is claimed");
  } else {
    check(/at least \d+ SP/.test(spa.text), "otherwise a real SP floor is stated");
  }
}

// ===========================================================================
// Damage no legal spread could produce means an ASSUMPTION is wrong.
//
// The empty candidate set is the trap here: if you only check "did this narrow
// anything", an impossible observation looks exactly like an uninformative one
// and gets silently dropped - throwing away the single most useful thing that
// happened, which is that the board is not what the tool thinks it is.
// ===========================================================================
console.log("\n-- damage that cannot happen is reported, not swallowed --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
  ]);
  const zard = state.mons[opp(state, "charizard-y").uid];
  const raichu = state.mons[mine(state, "Raichu").uid];
  const band = resolveMatchup(zard, raichu, "Heat Wave", state);

  // Far below what even a zero-investment Charizard can do in sun.
  const tooLittle = Math.round(raichu.maxHP * 0.2);
  const obs = {
    attackerUid: zard.uid, defenderUid: raichu.uid, moveName: "Heat Wave",
    damage: tooLittle, defenderMaxHP: raichu.maxHP,
  };
  check(consistentStats(obs, "attacker", "spa", state).length === 0,
    `20% is below anything a legal Charizard can do here (assumed spread does ${band.minPct}%+)`);

  const msg = damageContradiction(obs, state);
  check(msg !== null, "and that is reported as a contradiction");
  console.log("      ", msg);
  check(/IMPOSSIBLE/.test(msg), "  it is called impossible, not treated as a weak read");
  check(/screen|Intimidate|berry|weather/i.test(msg),
    "  and it lists the assumptions that could actually be wrong");
  check(/Nothing has been deduced/.test(msg),
    "  while making clear nothing was concluded from it");

  check(narrowFromDamage(obs, state).length === 0,
    "no bound is written from an impossible observation");

  // End to end: the log says so, and the Pokemon keeps no bogus bound.
  const after = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
    "zard heat wave, raichu to 80%",
  ]).state;
  const z2 = after.mons[opp(after, "charizard-y").uid];
  check(after.log.some((l) => /IMPOSSIBLE/.test(l.text)),
    "recording that turn puts the contradiction in the log");
  check(!z2.statBounds.spa,
    "  and no Special Attack bound is invented from it");
}

// ===========================================================================
// The deeper answer, and what it means when it disagrees.
//
// The console replies instantly from the SINGLE-TURN ranker and then upgrades
// when the multi-turn search answers. Two things must hold: the upgrade has to
// say how far it actually looked and how strong the claim is, and when the two
// disagree it has to SAY so rather than quietly swapping the recommendation.
// ===========================================================================
console.log("\n-- planner advice upgrades the fast reply --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
  ]);

  const lines = searchPlans(state, { depth: 2, myBeam: 6, theirBeam: 6, arsenal: "possible" });
  check(lines.length > 0, `the search found ${lines.length} lines`);

  const fast = briefFor(state);
  const p = plannerBrief(lines, fast.advice[0] ?? null);
  check(p !== null, "the top line formats into a planner brief");
  console.log("      fast:", fast.advice[0] ?? "(none)");
  console.log("      deep:", p.headline);
  for (const n of p.notes) console.log("        -", n);

  // The claim must be graded honestly, never stated flatly.
  check(/Verified \d+ turns? ahead/.test(p.notes[0]),
    "it says how many turns ahead it verified");
  check(/checking every reply|beaming their replies/.test(p.notes[0]),
    "  and whether that was exhaustive or beamed");
  check(p.exhaustive === lines[0].worst.exhaustive,
    "  the exhaustive flag is carried through, not assumed");
  check(p.pinVsPossible === lines[0].pinVsPossible,
    "  and the strong claim matches what the search actually proved");
  check(/Their best answer:/.test(p.notes[1]),
    "it names their best reply, so the worst case is inspectable");

  // A line with no guarantee must not be dressed up as one.
  if (!p.isPin) {
    check(/no guarantee/.test(p.notes[0]),
      "a line with no guarantee says so in plain words");
  } else {
    check(/holds|comes out ahead/.test(p.notes[0]), "a pin states what it holds against");
  }

  // Disagreement detection: same move = agreement, different move = flagged.
  const agree = plannerBrief(lines, lines[0].label);
  check(!agree.disagrees, "identical advice is not reported as a disagreement");
  const differ = plannerBrief(lines, "Sylveon: Something Else Entirely");
  check(differ.disagrees, "genuinely different advice IS flagged as a disagreement");

  // Target choice is not a disagreement - "Zap Cannon -> Garchomp" and
  // "Zap Cannon" are the same decision.
  const sameMove = plannerBrief(lines, lines[0].label.replace(/\s*->\s*\S.*$/, ""));
  check(!sameMove.disagrees,
    "the same move aimed differently is not treated as a different recommendation");

  // Breakers are the honest caveat and must survive into the brief.
  check(Array.isArray(p.breakers), "unknown moves that would break the line are carried through");
  if (lines[0].breakers.length) {
    check(/Breaks if they have/.test(p.notes.join(" ")),
      `  and named: ${p.breakers.join(", ")}`);
  }

  check(plannerBrief([], null) === null, "no lines means no planner brief, not an empty one");

  // A disagreement warning that fires every turn is a warning nobody reads.
  // The lead brief and the bring-four brief give advice of a different SHAPE
  // ("deny the Tailwind"), so they must never be compared against a move.
  check(fast.phase !== "turn",
    `on the lead turn the fast reply is lead advice, not a move (phase "${fast.phase}")`);
  check(!plannerBrief(lines, null).disagrees,
    "  with no move to compare against, no disagreement is claimed");

  // Later in the game, where the fast reply IS a move, comparison resumes.
  const mid = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
    "zard heat wave, raichu to 40%",
  ]).state;
  const midBrief = briefFor(mid);
  check(midBrief.phase === "turn",
    `after the lead turn the fast reply is a move again (phase "${midBrief.phase}")`);
}

// ===========================================================================
// A Pokemon is named by the form it is ACTUALLY in.
//
// `set.name` is the Mega form for anything carrying a stone, so using it
// directly labels a Pokemon that never Mega Evolved as its Mega. That has now
// been wrong in three separate places - the command echo, the planner's plan
// label, and the action label - so it gets a test rather than a third fix.
// ===========================================================================
console.log("\n-- the un-Mega'd stone holder is never called a Mega --");
{
  const { state } = play([
    "zard, incin, gambit, chomp, bascu, whims",
    "they lead zard and incin",
    "we lead raichu and staraptor",
  ]);
  const raichu = state.mons[mine(state, "Raichu").uid];
  const star = state.mons[mine(state, "Staraptor").uid];

  check(raichu.hasMega && !star.hasMega,
    "Raichu holds this battle's Mega; Staraptor carries a stone but is in its base form");
  check(nameOf(star) === "Staraptor" && star.set.name === "Mega Staraptor",
    `the display name is "${nameOf(star)}" even though set.name is "${star.set.name}"`);

  // 1. The command echo.
  const echo = runCommand("staraptor close combat on incin, raichu zap cannon on zard", state).echo;
  check(!/Mega Staraptor/.test(echo), `command echo: "${echo}"`);

  // 2. The action label, including switch targets.
  const arc = mine(state, "Arcanine");
  check(!/Mega Staraptor/.test(actionLabel({ kind: "switch", toUid: star.uid }, state)),
    `switch label: "${actionLabel({ kind: "switch", toUid: star.uid }, state)}"`);
  check(!/Mega Staraptor/.test(actionLabel({ kind: "move", moveName: "Tailwind" }, state)),
    "move label with no target is unaffected");
  void arc;

  // 3. The planner's plan label, which is what the advice log records.
  const lines = searchPlans(state, { depth: 1, myBeam: 8, theirBeam: 8, arsenal: "assumed" });
  const bad = lines.filter((l) => /Mega Staraptor/.test(l.label));
  check(bad.length === 0,
    bad.length ? `planner still says: ${bad[0].label}` : "no planner line calls it Mega Staraptor");

  // And the one that IS the Mega keeps its Mega name - this must not overcorrect.
  check(nameOf(raichu) === "Mega Raichu Y",
    `the actual Mega is still named "${nameOf(raichu)}"`);
  check(lines.some((l) => /Mega Raichu Y/.test(l.label)) || lines.length === 0,
    "  and the planner uses that name for it");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
