// Back line / switching - run: node test-switch.mjs
//
// The question these answer: does the planner actually know they can switch?
// A "pin" computed against an opponent with no bench is not a pin.
import { newBattleState, monFromThreatId, setFromThreat } from "./src/app/model/factory.ts";
import { legacyBattle } from "./test-fixture.mjs";
import { reduce, makeMonState } from "./src/app/state/reducer.ts";
import { THREATS } from "./src/data/threats.js";
import { legalActions, actionProfiles } from "./src/app/sim/actions.ts";
import { simulateTurn } from "./src/app/sim/turn.ts";
import { searchPlans } from "./src/app/search/plan.ts";
import { possibleSwitchIns, broughtCounts } from "./src/app/battle/roster.ts";
import { parseRoster } from "./src/app/input/parseRoster.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";
import { parseTurn } from "./src/app/input/parseTurn.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function board(activeIds, actives) {
  let s = legacyBattle();
  for (const id of activeIds) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  actives.forEach((n, slot) => {
    const m = mine(s, n);
    if (m) s = reduce(s, { type: "SWITCH_IN", side: "me", slot, uid: m.uid });
  });
  return s;
}
function addRoster(s, ids) {
  const mons = ids.map((id) =>
    makeMonState(setFromThreat(THREATS.find((t) => t.id === id)), "opp", "threat")
  );
  return reduce(s, { type: "ADD_ROSTER", side: "opp", mons });
}

// ===========================================================================
console.log("-- their switches are in the search --");
{
  let s = board(["charizard-y", "incineroar"], ["Garchomp", "Kingambit"]);
  const zard = opp(s, "charizard-y");

  check(possibleSwitchIns(s, "opp").length === 0,
    "with no roster entered, they appear to have no switches (the old blind spot)");
  const before = legalActions(s.mons[zard.uid], s);
  check(before.every((a) => a.kind === "move"),
    "  and none of their legal actions is a switch");

  s = addRoster(s, ["basculegion", "gholdengo", "sylveon", "archaludon"]);
  const after = legalActions(s.mons[zard.uid], s);
  const switches = after.filter((a) => a.kind === "switch");
  check(switches.length > 0, `after team preview they have ${switches.length} switch options`);
  check(possibleSwitchIns(s, "opp").length === 4, "all four back-line mons are live switch targets");

  const profiles = actionProfiles(s, "opp", { allowSwitch: true });
  check(profiles.some((p) => Object.values(p).some((a) => a.kind === "switch")),
    "their action profiles include switching");
}

// ===========================================================================
console.log("-- switching actually resolves --");
{
  let s = board(["charizard-y", "incineroar"], ["Garchomp", "Kingambit"]);
  s = addRoster(s, ["basculegion"]);
  const zard = opp(s, "charizard-y");
  const chomp = mine(s, "Garchomp");
  const bascu = opp(s, "basculegion");

  const r = simulateTurn(s, {
    [zard.uid]: { kind: "switch", toUid: bascu.uid },
    [chomp.uid]: { kind: "move", moveName: "Rock Slide" },
  }, { roll: "worstForMe", tie: "them" });

  check(r.state.sides.opp.active.includes(bascu.uid),
    "the switch-in is now active");
  check(!r.state.sides.opp.active.includes(zard.uid),
    "  and the mon that left is off the field");
  // Rock Slide is a spread move, so it still hits whatever came in.
  check(r.state.mons[bascu.uid].curHP < bascu.maxHP,
    "the incoming mon eats the spread move");
  check(r.state.mons[zard.uid].curHP === zard.maxHP,
    "  while the one that switched out takes nothing");
}

// ===========================================================================
console.log("-- the pivot that dodges a threat --");
{
  // Garchomp threatens Charizard Y with Rock Slide (x4). If they can switch to
  // something that resists it, the "guaranteed KO" evaporates.
  let s = board(["charizard-y", "incineroar"], ["Garchomp", "Kingambit"]);
  const chomp = mine(s, "Garchomp");
  const zard = opp(s, "charizard-y");

  // Their Incineroar is already out, so Garchomp arrived INTO an Intimidate.
  // That is not a footnote: it is the difference between a guaranteed KO and a
  // roll, and the tool used to miss it entirely.
  check(s.mons[chomp.uid].stages.atk === -1,
    "Garchomp came in against Incineroar, so it is Intimidated to -1 Atk");

  const ko = resolveMatchup(s.mons[chomp.uid], s.mons[zard.uid], "Rock Slide", s);
  check(ko.verdict === "ROLL",
    `Rock Slide is now only a ROLL on Charizard Y (${ko.minPct}-${ko.maxPct}%) - Intimidate took the guarantee away`);

  // Without the Intimidate it WOULD be guaranteed, which is what makes the
  // ability worth a whole turn of theirs.
  const unbothered = {
    ...s,
    mons: { ...s.mons, [chomp.uid]: { ...s.mons[chomp.uid], stages: { ...s.mons[chomp.uid].stages, atk: 0 } } },
  };
  const clean = resolveMatchup(unbothered.mons[chomp.uid], unbothered.mons[zard.uid], "Rock Slide", unbothered);
  check(clean.verdict === "DEAD",
    `  at neutral Attack the same Rock Slide IS a guaranteed KO (${clean.minPct}% min)`);

  const blind = searchPlans(s, { depth: 1, myBeam: 6, theirBeam: 6, arsenal: "assumed" });
  const blindTop = blind[0];

  s = addRoster(s, ["archaludon", "gholdengo", "basculegion", "sylveon"]);
  const seeing = searchPlans(s, { depth: 1, myBeam: 6, theirBeam: 6, arsenal: "assumed" });
  const seeingTop = seeing[0];

  check(seeingTop.worst.score <= blindTop.worst.score,
    `knowing their back line can only lower the guaranteed floor ` +
      `(${Math.round(blindTop.worst.score)} -> ${Math.round(seeingTop.worst.score)})`);

  // On turn 1 their best answer is usually Fake Out, not a switch: flinching
  // Garchomp denies the KO *and* costs me the turn, which beats pivoting. That
  // is correct play, and the search finds it on its own.
  const t1Reply = seeingTop.worst.replyLabel;
  check(/Fake Out|switch/i.test(t1Reply),
    `turn 1 their best answer is a denial: "${t1Reply}"`);

  // Once Fake Out is off the table, pivoting out of the threat becomes their
  // best defensive resource - the scenario that matters.
  let later = reduce(s, { type: "NEXT_TURN" });
  const afterFO = searchPlans(later, { depth: 1, myBeam: 6, theirBeam: 6, arsenal: "assumed" });
  const withSwitch = afterFO.filter((l) =>
    Object.values(l.worst.reply).some((a) => a.kind === "switch")
  );
  check(withSwitch.length > 0,
    `with Fake Out expired, ${withSwitch.length} plans have a switch as their worst case`);
  if (withSwitch.length) {
    console.log("      >", withSwitch[0].label);
    console.log("        their best answer:", withSwitch[0].worst.replyLabel);
  }
}

// ===========================================================================
console.log("-- brought-four bookkeeping --");
{
  let s = board(["charizard-y", "incineroar"], ["Garchomp", "Kingambit"]);
  s = addRoster(s, ["basculegion", "gholdengo", "sylveon", "archaludon"]);

  let c = broughtCounts(s, "opp");
  check(c.confirmed === 2 && c.possible === 4,
    `two leads confirmed, ${c.possible} still possible`);

  // Bringing a third in confirms it.
  const bascu = opp(s, "basculegion");
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 0, uid: bascu.uid });
  c = broughtCounts(s, "opp");
  check(s.mons[bascu.uid].brought === "confirmed", "switching one in confirms it was brought");
  check(c.possible === 3, `  ${c.possible} still possible`);

  // A fourth confirmation rules out the rest.
  const ghold = opp(s, "gholdengo");
  s = reduce(s, { type: "SWITCH_IN", side: "opp", slot: 1, uid: ghold.uid });
  c = broughtCounts(s, "opp");
  check(c.confirmed === 4, "four confirmed");
  check(c.possible === 0 && c.out === 2,
    `  the remaining ${c.out} are ruled out automatically`);
  check(possibleSwitchIns(s, "opp").every((m) => m.brought === "confirmed"),
    "  and they are no longer offered as switch targets");
}

// ===========================================================================
console.log("-- team preview parsing --");
{
  const p = parseRoster("zard, incin, gambit, chomp, bascu, whims");
  check(p.matched === 6, `six names matched from shorthand (${p.matched})`);
  check(p.entries[0].species.id === "charizard-y", `"zard" -> ${p.entries[0].species.name}`);
  check(p.entries[4].species.id === "basculegion", `"bascu" -> ${p.entries[4].species.name}`);

  const q = parseRoster("zard, someunknownmon, chomp");
  check(q.matched === 2 && q.unknown.length === 1,
    `unknown names are reported, not guessed: ${q.unknown.join(", ")}`);

  // The same name twice must not map to one entry twice.
  const dup = parseRoster("chomp, chomp");
  check(dup.entries[1].species?.id !== dup.entries[0].species?.id || dup.entries[1].species === null,
    "a repeated name does not silently duplicate the same Pokemon");

  // Anything legal is now enterable, not just the curated 25.
  const wide = parseRoster("weavile, dragapult, snorlax, toxapex, mega gengar, mimikyu");
  check(wide.matched === 6, `six species with no curated set still resolve (${wide.matched}/6)`);
  check(wide.entries.every((e) => e.species), `  ${wide.entries.map((e) => e.species?.name).join(", ")}`);
  check(wide.entries.some((e) => e.statsOnly), "  and they are flagged as stats-only");
}

// ===========================================================================
// Typing a switch has to WORK, in whatever words come out mid-game.
//
// This is the main way the board stays in sync during a real match: you say
// what happened and the tool follows. A phrasing it does not know is a board
// that quietly stops matching the game.
// ===========================================================================
console.log("\n-- 'he switched X for Y', however you phrase it --");
{
  let base = newBattleState();
  for (const id of ["garchomp", "charizard-y", "incineroar", "whimsicott"]) {
    base = reduce(base, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  }
  const activeNames = (s) =>
    s.sides.opp.active.map((u) => (u ? s.mons[u].set.name : "-")).join(" + ");

  const phrasings = [
    ["zard switch incin", "Incineroar"],
    ["zard switches to incin", "Incineroar"],
    ["zard switched for incin", "Incineroar"],
    ["zard goes to whims", "Whimsicott"],
    ["zard out for whims", "Whimsicott"],
    ["zard back to incin", "Incineroar"],
    ["zard subbed incin", "Incineroar"],
    ["zard pivots whims", "Whimsicott"],
    ["zard -> incin", "Incineroar"],
  ];
  for (const [script, expect] of phrasings) {
    const p = parseTurn(script, base);
    const after = reduce(base, {
      type: "APPLY_TURN_SCRIPT", entries: p.entries, effects: p.effects, script,
    });
    check(activeNames(after).includes(expect),
      `"${script}" -> ${activeNames(after)}`);
  }

  // A switch alongside a move: both halves land.
  {
    const script = "chomp earthquake, zard switch incin";
    const p = parseTurn(script, base);
    const after = reduce(base, {
      type: "APPLY_TURN_SCRIPT", entries: p.entries, effects: p.effects, script,
    });
    check(activeNames(after) === "Garchomp + Incineroar",
      `"${script}" -> ${activeNames(after)}`);
    check(after.mons[opp(after, "garchomp").uid].revealed.moves.includes("Earthquake"),
      "  and the move it used is now confirmed on its sheet");
  }

  // A segment the parser cannot resolve must NOT take the rest of the turn
  // down with it. This used to throw and lose everything you had typed.
  {
    const script = "chomp earthquake, blargh flurb";
    const p = parseTurn(script, base);
    check(p.entries.some((e) => !e.actorUid || !e.action),
      "the parser reports the unresolvable segment rather than dropping it");
    let after = null;
    let threw = null;
    try {
      after = reduce(base, {
        type: "APPLY_TURN_SCRIPT", entries: p.entries, effects: p.effects, script,
      });
    } catch (err) {
      threw = err;
    }
    check(threw === null, `applying a partly-unparseable turn does not throw${threw ? ": " + threw.message : ""}`);
    check(after && after.mons[opp(after, "garchomp").uid].revealed.moves.includes("Earthquake"),
      "  the half it DID understand is still applied");
    check(after && after.log.some((l) => /Skipped/.test(l.text)),
      "  and the log says which segment was skipped");
  }
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
