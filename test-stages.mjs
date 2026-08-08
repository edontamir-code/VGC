// Stat changes, Contrary, Intimidate, Defiant, Helping Hand - node test-stages.mjs
//
// The simulator used to model exactly one stat change (Icy Wind's Speed drop)
// and printed "effect not simulated" for everything else. That made the whole
// tool blind to the things doubles turns are actually decided by:
//
//   - Close Combat drops your defences, and CONTRARY inverts that, so a Mega
//     Staraptor gets BULKIER every time it attacks
//   - Intimidate drops both foes' Attack on entry, which is often worth more
//     than a KO - unless they have DEFIANT, in which case you have just handed
//     them +2 Attack
//   - Helping Hand is a real x1.5 that no evaluation could see
import { newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { runCommand } from "./src/app/input/command.ts";
import { simulateTurn } from "./src/app/sim/turn.ts";
import { applyStages, applyIntimidate, hasIntimidate } from "./src/app/battle/stages.ts";
import { activeProfile, battleStats } from "./src/app/battle/stats.ts";
import { MOVES } from "./src/data/moves.js";
import { searchPlans } from "./src/app/search/plan.ts";
import { evaluate, DEFAULT_WEIGHTS } from "./src/app/search/evaluate.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const nameOf = (m) => activeProfile(m).displayName;
const W = { roll: "worstForMe", tie: "them" };
const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function play(scripts) {
  let s = newBattleState();
  for (const t of scripts) {
    const r = runCommand(t, s);
    for (const a of r.actions) s = reduce(s, a);
  }
  return s;
}

// ===========================================================================
console.log("-- the move data knows its own side effects --");
{
  check(MOVES["Close Combat"].selfStages?.def === -1 &&
        MOVES["Close Combat"].selfStages?.spd === -1,
    "Close Combat drops the user's Def and SpD");
  check(MOVES["Overheat"].selfStages?.spa === -2, "Overheat drops the user's SpA by 2");
  check(MOVES["Draco Meteor"].selfStages?.spa === -2, "Draco Meteor does too");
  check(MOVES["Rock Tomb"].targetStages?.spe === -1, "Rock Tomb drops the target's Speed");
  check(MOVES["Kowtow Cleave"].neverMisses === true,
    "Kowtow Cleave is flagged as ignoring accuracy entirely");
}

// ===========================================================================
// THE READ: Contrary turns a drawback into a boost.
// ===========================================================================
console.log("\n-- Contrary: Close Combat makes Mega Staraptor BULKIER --");
{
  let s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin",
    "we lead staraptor and arcanine",
  ]);
  const star = mine(s, "Staraptor");
  const chomp = opp(s, "garchomp");

  // Base Staraptor has Intimidate; Contrary is the MEGA ability, so the Mega
  // has to actually be assigned for this to be the Contrary case at all.
  check(activeProfile(s.mons[star.uid]).ability === "Intimidate",
    "base-form Staraptor has Intimidate, not Contrary");
  const base = simulateTurn(s, {
    [star.uid]: { kind: "move", moveName: "Close Combat", targetUid: chomp.uid },
  }, W);
  check(base.state.mons[star.uid].stages.def === -1,
    "  so ITS Close Combat drops Def normally (-1)");

  s = reduce(s, { type: "SET_MEGA", side: "me", uid: star.uid });
  check(activeProfile(s.mons[star.uid]).ability === "Contrary",
    "Mega Staraptor has Contrary");

  const defBefore = battleStats(s.mons[star.uid], s).def;
  const r = simulateTurn(s, {
    [star.uid]: { kind: "move", moveName: "Close Combat", targetUid: chomp.uid },
  }, W);
  const after = r.state.mons[star.uid];
  const defAfter = battleStats(after, r.state).def;

  check(after.stages.def === 1 && after.stages.spd === 1,
    `Contrary INVERTS it: +1 Def, +1 SpD (was -1/-1)`);
  check(defAfter > defBefore,
    `  and that is a real defensive gain: Def ${defBefore} -> ${defAfter}`);
  check(r.events.some((e) => /\+1 Def, \+1 SpD/.test(e.text)),
    "  the event log says so rather than staying silent");

  // It only fires if the move CONNECTED. A Protected Close Combat gives a
  // Contrary user nothing - claiming the boost anyway would invent free bulk.
  const blocked = simulateTurn(s, {
    [star.uid]: { kind: "move", moveName: "Close Combat", targetUid: chomp.uid },
    [chomp.uid]: { kind: "move", moveName: "Protect" },
  }, W);
  check(blocked.state.mons[star.uid].stages.def === 0,
    "a Protected Close Combat gives no boost - it never connected");

  // Repeated use keeps stacking, which is what makes it a win condition.
  const twice = simulateTurn(r.state, {
    [star.uid]: { kind: "move", moveName: "Close Combat", targetUid: chomp.uid },
  }, W);
  check(twice.state.mons[star.uid].stages.def === 2,
    `clicking it again stacks to +2 Def`);
}

// ===========================================================================
console.log("\n-- Intimidate, and the Kingambit that punishes it --");
{
  let s = play([
    "gambit, incin, zard, chomp, whims, bascu",
    "they lead gambit and incin",
    "we lead sylveon and arcanine",
  ]);
  const gam = opp(s, "kingambit");
  const inc = opp(s, "incineroar");
  const syl = mine(s, "Sylveon");
  const star = mine(s, "Staraptor");

  check(hasIntimidate(s.mons[star.uid]), "base Staraptor has Intimidate");
  check(activeProfile(s.mons[gam.uid]).ability === "Defiant",
    "their Kingambit has Defiant");

  const r = simulateTurn(s, { [syl.uid]: { kind: "switch", toUid: star.uid } }, W);
  for (const e of r.events) console.log("      ", e.text);

  check(r.state.mons[inc.uid].stages.atk === -1,
    "Intimidate drops Incineroar's Attack on entry");
  check(r.state.mons[gam.uid].stages.atk > 0,
    `but Kingambit's Defiant turns it into +${r.state.mons[gam.uid].stages.atk} Attack`);
  check(r.events.some((e) => /Defiant/.test(e.text)),
    "  and the log names Defiant, so the backfire is visible");

  // The whole point: leading Intimidate into Defiant is a LOSS, and the
  // numbers have to show it.
  const gamBefore = battleStats(s.mons[gam.uid], s).atk;
  const gamAfter = battleStats(r.state.mons[gam.uid], r.state).atk;
  check(gamAfter > gamBefore,
    `  Kingambit's real Attack went UP: ${gamBefore} -> ${gamAfter}`);

  // Immunities are per-target, not all-or-nothing.
  const out = applyStages(
    { ...s.mons[inc.uid], set: { ...s.mons[inc.uid].set, ability: "Clear Body" } },
    { atk: -1 },
    true
  );
  check(Object.keys(out.applied).length === 0 && /Clear Body/.test(out.text ?? ""),
    "Clear Body blocks the drop and says why");

  // Self-inflicted drops are NOT blocked by drop-immunity, and do not anger
  // Defiant - getting that flag wrong is how a tool invents free stats.
  const selfDrop = applyStages(
    { ...s.mons[gam.uid], stages: { ...s.mons[gam.uid].stages } },
    { def: -1 },
    false
  );
  check(selfDrop.applied.def === -1 && !("atk" in selfDrop.applied),
    "a self-inflicted drop lands normally and does NOT trigger Defiant");
}

// ===========================================================================
console.log("\n-- Helping Hand is a real x1.5, not a printed apology --");
{
  const s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin",
    "we lead farigiraf and sylveon",
  ]);
  const far = mine(s, "Farigiraf");
  const syl = mine(s, "Sylveon");
  const inc = opp(s, "incineroar");

  const plain = simulateTurn(s, { [syl.uid]: { kind: "move", moveName: "Hyper Voice" } }, W);
  const helped = simulateTurn(s, {
    [far.uid]: { kind: "move", moveName: "Helping Hand" },
    [syl.uid]: { kind: "move", moveName: "Hyper Voice" },
  }, W);

  // Measured on a target that SURVIVES both, so the number is not clipped by
  // its remaining HP.
  const a = s.mons[inc.uid].curHP - plain.state.mons[inc.uid].curHP;
  const b = s.mons[inc.uid].curHP - helped.state.mons[inc.uid].curHP;
  console.log(`      Hyper Voice into Incineroar: ${a} -> ${b}`);
  check(b > a, "Helping Hand increases the partner's damage");
  check(Math.abs(b / a - 1.5) < 0.05,
    `  by about x1.5 (measured x${(b / a).toFixed(3)})`);
  check(helped.events.some((e) => /Helping Hand/.test(e.text) && !/not simulated/.test(e.text)),
    "  and it is no longer reported as unsimulated");

  // With no living partner it simply fails.
  const alone = simulateTurn(
    { ...s, sides: { ...s.sides, me: { ...s.sides.me, active: [far.uid, null] } } },
    { [far.uid]: { kind: "move", moveName: "Helping Hand" } },
    W
  );
  check(alone.events.some((e) => /failed - no partner/.test(e.text)),
    "with no partner out, Helping Hand fails rather than boosting nothing");
}

// ===========================================================================
// SETUP: a free Swords Dance is often the whole game.
//
// Setup moves were invisible to the simulator, so the search could never pick
// one - a Swords Dance scored exactly zero and any attack beat it. But +2
// Attack on a turn they cannot punish turns every later attack into a KO, and
// no damage number THIS turn competes with that.
// ===========================================================================
console.log("\n-- Swords Dance, and when the search should take it --");
{
  let s = play([
    "farigiraf, sinistcha, zard, chomp, bascu, incin",
    "they lead farigiraf and sinistcha",
    "we lead kingambit and arcanine",
  ]);
  const gam = mine(s, "Kingambit");

  const before = battleStats(s.mons[gam.uid], s).atk;
  const r = simulateTurn(s, { [gam.uid]: { kind: "move", moveName: "Swords Dance" } }, W);
  const after = battleStats(r.state.mons[gam.uid], r.state).atk;
  check(r.state.mons[gam.uid].stages.atk === 2, "Swords Dance gives +2 Attack stages");
  check(after === before * 2, `  which doubles the real Attack: ${before} -> ${after}`);
  check(r.events.some((e) => /Swords Dance/.test(e.text) && !/not simulated/.test(e.text)),
    "  and it is no longer reported as unsimulated");

  // The judgement call: on a board where Kingambit cannot GUARANTEE a KO this
  // turn and nothing threatens it, setting up should win - and the search has
  // to reach that on its own, not because anything was hardcoded.
  const kowtow = resolveMatchup(s.mons[gam.uid], s.mons[s.sides.opp.active[0]], "Kowtow Cleave", s);
  check(kowtow.verdict === "ROLL",
    `Kowtow Cleave is only a roll here (${kowtow.minPct}-${kowtow.maxPct}%), so there is no KO to take`);

  const lines = searchPlans(s, { depth: 3, myBeam: 4, theirBeam: 4, arsenal: "possible" });
  const rank = lines.findIndex((l) => /Swords Dance/.test(l.label));
  console.log(`      top line: ${lines[0].label}`);
  check(rank === 0,
    `the search ranks Swords Dance FIRST on this board (rank ${rank + 1} of ${lines.length})`);

  // ...but not when there is a real KO available instead.
  let hot = play([
    "whims, sinistcha, zard, chomp, bascu, incin",
    "they lead whims and sinistcha",
    "we lead kingambit and arcanine",
  ]);
  const hotLines = searchPlans(hot, { depth: 3, myBeam: 4, theirBeam: 4, arsenal: "possible" });
  check(!/Swords Dance/.test(hotLines[0].label),
    `with a KO on the board it attacks instead: ${hotLines[0].label.slice(0, 56)}`);
}

// ===========================================================================
// SPEED CONTROL, priced by what it does to THIS board.
// ===========================================================================
console.log("\n-- speed control is worth what it flips, not a flat constant --");
{
  const s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin",
    "we lead sylveon and farigiraf",
  ]);

  const flat = evaluate(s);
  const withTR = evaluate(reduce(s, { type: "SET_TRICK_ROOM", on: true }));
  console.log(`      Sylveon + Farigiraf (both slow): ${Math.round(flat)} -> ${Math.round(withTR)} under Trick Room`);
  check(withTR > flat,
    "Trick Room is worth points to a SLOW pair - it flips the matchups");

  // The same Trick Room with a FAST pair out is a mistake, and has to score
  // like one. A flat per-turn bonus could never tell these apart.
  const fastBoard = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin",
    "we lead raichu and staraptor",
  ]);
  const fastFlat = evaluate(fastBoard);
  const fastTR = evaluate(reduce(fastBoard, { type: "SET_TRICK_ROOM", on: true }));
  console.log(`      Raichu + Staraptor (both fast): ${Math.round(fastFlat)} -> ${Math.round(fastTR)} under Trick Room`);
  check(fastTR < fastFlat,
    "the SAME Trick Room is a LOSS for a fast pair - it is not a constant");

  // Tailwind is priced the same way, through the speed edge it buys.
  const tw = evaluate(reduce(fastBoard, { type: "SET_TAILWIND", side: "me", on: true }));
  check(tw >= fastFlat, "Tailwind is worth at least as much as no Tailwind for a fast pair");

  // And the weight is calibrated below a Pokemon: a tool that valued speed
  // control at more than a KO would spend the whole game setting it.
  check(DEFAULT_WEIGHTS.speedEdge * 8 < DEFAULT_WEIGHTS.monAlive,
    `a full speed flip (${DEFAULT_WEIGHTS.speedEdge * 8}) is worth less than a Pokemon (${DEFAULT_WEIGHTS.monAlive})`);
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
