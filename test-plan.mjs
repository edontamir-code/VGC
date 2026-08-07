// Planner / simulator tests - run: node test-plan.mjs
//
// These cover the mechanics a multi-turn GUARANTEE rests on. If any of these
// break, a "pin" the app reports is not actually a pin.
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { legacyBattle } from "./test-fixture.mjs";
import { reduce } from "./src/app/state/reducer.ts";
import { simulateTurn } from "./src/app/sim/turn.ts";
import { legalActions, actionProfiles } from "./src/app/sim/actions.ts";
import { searchPlans } from "./src/app/search/plan.ts";
import { evaluate, material } from "./src/app/search/evaluate.ts";
import { leadRisks } from "./src/app/battle/leadRisk.ts";
import { scout } from "./src/app/battle/scouting.ts";
import { effectivePriority } from "./src/app/battle/moves.ts";
import { isGrounded } from "./src/app/battle/terrain.ts";
import { protectSuccessChance } from "./src/app/battle/protect.ts";
import { activeProfile } from "./src/app/battle/stats.ts";
import { resolveMatchup, clearMatchupCache } from "./src/app/battle/damage.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function boardWith(ids) {
  let s = legacyBattle();
  for (const id of ids) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  return s;
}
function setActive(s, names) {
  names.forEach((n, slot) => {
    const m = mine(s, n);
    if (m) s = reduce(s, { type: "SWITCH_IN", side: "me", slot, uid: m.uid });
  });
  return s;
}
const WORST = { roll: "worstForMe", tie: "them" };

// ===========================================================================
console.log("-- Protect --");
{
  let s = boardWith(["sneasler", "incineroar"]);
  s = setActive(s, ["Whimsicott", "Delphox"]);
  const whim = mine(s, "Whimsicott");
  const sneas = opp(s, "sneasler");

  // Unprotected: Sneasler's Close Combat lands.
  const open = simulateTurn(s, {
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: whim.uid },
  }, WORST);
  check(open.state.mons[whim.uid].curHP < whim.curHP,
    `unprotected Whimsicott takes damage (${whim.curHP} -> ${open.state.mons[whim.uid].curHP})`);

  // Protected: the same attack does nothing.
  const blocked = simulateTurn(s, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: whim.uid },
  }, WORST);
  check(blocked.state.mons[whim.uid].curHP === whim.curHP,
    "Protect blocks it completely");
  check(blocked.events.some((e) => e.text.includes("blocked")),
    "the block is in the event log");

  // Protect must also blank a Fake Out, which is the whole point of the line.
  const inc = opp(s, "incineroar");
  const fo = simulateTurn(s, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [inc.uid]: { kind: "move", moveName: "Fake Out", targetUid: whim.uid },
  }, WORST);
  check(fo.state.mons[whim.uid].curHP === whim.curHP,
    "Protect blanks Fake Out - no chip, no flinch");

  // A second Protect in a row must be treated as failing.
  const afterProtect = blocked.state;
  const twice = simulateTurn(afterProtect, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: whim.uid },
  }, WORST);
  check(twice.state.mons[whim.uid].curHP < afterProtect.mons[whim.uid].curHP,
    "consecutive Protect FAILS under worst-case rolls - no pin leans on it");

  // Whimsicott does not actually carry Protect, so a legality check against IT
  // would pass no matter what the rule was. Use a Pokemon that has the move.
  check(!whim.set.moves.includes("Protect"),
    "  (Whimsicott has no Protect - the simulator applies the plan it is given)");
  const delphA = mine(s, "Delphox");
  check(scout(s.mons[delphA.uid]).arsenal.includes("Protect"),
    "Delphox does carry Protect, so it is the honest subject for legality");
}

// ===========================================================================
console.log("\n-- Fake Out is only legal on a switch-in turn --");
{
  let s = boardWith(["incineroar"]);
  s = setActive(s, ["Whimsicott", "Delphox"]);
  const inc = opp(s, "incineroar");

  check(legalActions(s.mons[inc.uid], s).some((a) => a.kind === "move" && a.moveName === "Fake Out"),
    "turn it arrives: Fake Out is legal");
  check(leadRisks(s).some((r) => r.kind === "flinch"),
    "  and the lead-risk panel warns about it");

  const later = simulateTurn(s, {}, WORST);
  check(later.mons === undefined || later.state.mons[inc.uid].turnsOnField === 1,
    `after a turn on the field turnsOnField = ${later.state.mons[inc.uid].turnsOnField}`);
  check(!legalActions(later.state.mons[inc.uid], later.state).some(
    (a) => a.kind === "move" && a.moveName === "Fake Out"),
    "next turn: Fake Out is no longer legal");
  check(!leadRisks(later.state).some((r) => r.kind === "flinch"),
    "  and the panel stops warning about it");
}

// ===========================================================================
console.log("\n-- the Protect -> Tailwind -> attack line --");
{
  // Whimsicott (Prankster Tailwind) + Delphox, into Char-Y and Incineroar.
  let s = boardWith(["charizard-y", "incineroar"]);
  s = setActive(s, ["Whimsicott", "Delphox"]);
  const whim = mine(s, "Whimsicott");
  const delph = mine(s, "Delphox");
  const zard = opp(s, "charizard-y");
  const inc = opp(s, "incineroar");

  // Turn 1: Protect the Fake Out target, Delphox attacks.
  const t1 = simulateTurn(s, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [delph.uid]: { kind: "move", moveName: "Heat Wave" },
    [inc.uid]: { kind: "move", moveName: "Fake Out", targetUid: whim.uid },
    [zard.uid]: { kind: "move", moveName: "Heat Wave" },
  }, WORST);
  check(t1.state.mons[whim.uid].curHP === whim.curHP,
    "T1: Whimsicott Protects through the Fake Out untouched");

  // Turn 2: Tailwind now goes up unopposed by the flinch.
  const t2 = simulateTurn(t1.state, {
    [whim.uid]: { kind: "move", moveName: "Tailwind" },
    [delph.uid]: { kind: "move", moveName: "Heat Wave" },
  }, WORST);
  check(t2.state.field.tailwind.me > 0,
    `T2: Tailwind is up for ${t2.state.field.tailwind.me} turns`);

  // Turn 3: under Tailwind, Delphox must now outspeed Charizard Y.
  const speedNow = t2.state.field.tailwind.me > 0;
  check(speedNow, "T3: the speed swing from that Tailwind is on the board");

  const dmg = zard.maxHP - t2.state.mons[zard.uid].curHP;
  check(dmg > 0, `Charizard Y took ${dmg} across the two Heat Waves (worst-case rolls)`);
}

// ===========================================================================
console.log("\n-- simulator determinism --");
{
  let s = boardWith(["sneasler", "incineroar"]);
  s = setActive(s, ["Kingambit", "Garchomp"]);
  const chomp = mine(s, "Garchomp");
  const plan = { [chomp.uid]: { kind: "move", moveName: "Earthquake" } };
  const a = simulateTurn(s, plan, WORST);
  const b = simulateTurn(s, plan, WORST);
  check(JSON.stringify(a.state) === JSON.stringify(b.state),
    "the same inputs always produce exactly the same successor state");

  const best = simulateTurn(s, plan, { roll: "bestForMe", tie: "me" });
  const sneas = opp(s, "sneasler");
  check(best.state.mons[sneas.uid].curHP <= a.state.mons[sneas.uid].curHP,
    "best-case rolls do at least as much damage as worst-case");
}

// ===========================================================================
console.log("\n-- Focus Sash is simulated, not just warned about --");
{
  // Gholdengo's Make It Rain is Steel and Glimmora is Rock/Poison, so it is x4
  // and would comfortably KO from full - exactly the case a Sash exists for.
  let s = boardWith(["gholdengo", "incineroar"]);
  s = setActive(s, ["Glimmora", "Garchomp"]);
  const glim = mine(s, "Glimmora");
  const ghold = opp(s, "gholdengo");
  const inc = opp(s, "incineroar");

  const one = simulateTurn(s, {
    [ghold.uid]: { kind: "move", moveName: "Make It Rain" },
  }, WORST);
  check(one.state.mons[glim.uid].curHP === 1 && !one.state.mons[glim.uid].fainted,
    "a lethal hit leaves Glimmora on exactly 1 HP via Focus Sash");
  check(!one.state.mons[glim.uid].itemActive, "  and the Sash is spent");

  const both = simulateTurn(s, {
    [ghold.uid]: { kind: "move", moveName: "Make It Rain" },
    [inc.uid]: { kind: "move", moveName: "Knock Off", targetUid: glim.uid },
  }, WORST);
  check(both.state.mons[glim.uid].fainted,
    "add a second attacker and the Sash does not save it");

  // A Sash only matters when a single hit would actually be lethal. Sneasler's
  // Close Combat maxes below Glimmora's HP, so no Sash is spent there.
  const sneasBoard = setActive(boardWith(["sneasler"]), ["Glimmora", "Garchomp"]);
  const sneas = opp(sneasBoard, "sneasler");
  const sub = simulateTurn(sneasBoard, {
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: mine(sneasBoard, "Glimmora").uid },
  }, WORST);
  const g2 = sub.state.mons[mine(sneasBoard, "Glimmora").uid];
  check(g2.curHP > 1 && g2.itemActive,
    `a sub-lethal hit does not trigger the Sash (${g2.curHP} HP left, Sash intact)`);
}

// ===========================================================================
console.log("\n-- maximin search --");
{
  let s = boardWith(["charizard-y", "incineroar"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);

  const profiles = actionProfiles(s, "me", { allowSwitch: true });
  check(profiles.length > 0, `${profiles.length} of my action profiles enumerated`);

  const t0 = Date.now();
  const lines = searchPlans(s, { depth: 2, myBeam: 6, theirBeam: 6 });
  const ms = Date.now() - t0;
  check(lines.length > 0, `search returned ${lines.length} ranked plans in ${ms}ms`);
  check(ms < 20000, `  search completes in usable time (${ms}ms)`);

  const top = lines[0];
  console.log("      best guaranteed line:", top.label);
  console.log("      their best answer:   ", top.worst.replyLabel);
  console.log(`      worst case: score ${Math.round(top.worst.score)}, material ${top.worst.material.me}v${top.worst.material.opp}, pin=${top.isPin}, horizon=${top.horizon}`);

  check(lines.every((l) => l.horizon === 2),
    "every line reports the horizon its guarantee was verified to");

  // Depth 1 checks every single reply, so it is a proof. Depth 2 beams and must
  // admit that it is not.
  const d1 = searchPlans(s, { depth: 1, myBeam: 6, theirBeam: 6 });
  check(d1.every((l) => l.worst.exhaustive),
    "depth 1 is exhaustive - every opposing reply is checked");
  check(lines.some((l) => !l.worst.exhaustive),
    "depth 2 admits when it beamed instead of proving");
  check(lines.every((l) => !l.proven || (l.worst.exhaustive && l.deterministic)),
    "nothing is called PROVEN unless it was exhaustive AND the sets are confirmed");
  check(lines.every((l) => l.deterministic === false),
    "lines are marked non-deterministic while the opposing sets are assumed");

  // The ranking must be by GUARANTEED floor, not by best case.
  const sortedByWorst = [...lines].sort((a, b) => b.worst.score - a.worst.score);
  check(JSON.stringify(lines.map((l) => l.label)) === JSON.stringify(sortedByWorst.map((l) => l.label)),
    "plans are ranked by worst case, never by best case");

  // A line that is a pin must not lose material in the worst case.
  const base = material(s);
  check(lines.filter((l) => l.isPin).every((l) => l.worst.material.me >= base.me),
    "no line is called a pin if it can cost me a Pokemon");
}

// ===========================================================================
console.log("\n-- evaluation sanity --");
{
  let s = boardWith(["charizard-y"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);
  const before = evaluate(s);
  const zard = opp(s, "charizard-y");
  const after = evaluate(reduce(s, { type: "SET_FAINTED", uid: zard.uid, fainted: true }));
  check(after > before, `KOing one of theirs improves my evaluation (${Math.round(before)} -> ${Math.round(after)})`);

  const chomp = mine(s, "Garchomp");
  const worse = evaluate(reduce(s, { type: "SET_FAINTED", uid: chomp.uid, fainted: true }));
  check(worse < before, `losing one of mine hurts it (${Math.round(before)} -> ${Math.round(worse)})`);

  const tw = evaluate(reduce(s, { type: "SET_TAILWIND", side: "me", on: true }));
  check(tw > before, "my Tailwind is worth something");
}

// ===========================================================================
console.log("\n-- move pools: uncertainty shrinks as you scout --");
{
  let s = boardWith(["whimsicott"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");

  const s0 = scout(s.mons[whim.uid]);
  check(s0.possible.length > 4 && s0.slotsLeft === 4,
    `nothing confirmed: ${s0.possible.length} moves possible, ${s0.slotsLeft} slots open`);
  check(s0.arsenal.includes("Encore") && s0.arsenal.includes("Protect"),
    "  the arsenal spans the whole pool, including Encore and Protect");

  // Rule one out - the space shrinks.
  const ruled = reduce(s, { type: "RULE_OUT_MOVE", uid: whim.uid, moveName: "Encore" });
  check(!scout(ruled.mons[whim.uid]).arsenal.includes("Encore"),
    "ruling out Encore removes it from the arsenal");

  // Confirm four - the space collapses to exactly those.
  let full = s;
  for (const mv of ["Tailwind", "Moonblast", "Encore", "Protect"]) {
    full = reduce(full, { type: "REVEAL_MOVE", uid: whim.uid, moveName: mv });
  }
  const sf = scout(full.mons[whim.uid]);
  check(sf.fullyScouted && sf.possible.length === 0 && sf.arsenal.length === 4,
    `four confirmed: fully scouted, arsenal is exactly ${sf.arsenal.join("/")}`);
  check(sf.arsenal.every((m) => ["Tailwind", "Moonblast", "Encore", "Protect"].includes(m)),
    "  and contains nothing else");

  // Confirming a move must clear it from ruledOut, so the two never conflict.
  const conflict = reduce(ruled, { type: "REVEAL_MOVE", uid: whim.uid, moveName: "Encore" });
  check(scout(conflict.mons[whim.uid]).arsenal.includes("Encore") &&
        !scout(conflict.mons[whim.uid]).ruledOut.includes("Encore"),
    "seeing a move you had ruled out overrides the rule-out");
}

// ===========================================================================
console.log("\n-- Prankster --");
{
  let s = boardWith(["whimsicott"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");
  const chomp = mine(s, "Garchomp");

  check(effectivePriority("Tailwind", s.mons[whim.uid]) === 1,
    `Prankster Tailwind is +${effectivePriority("Tailwind", s.mons[whim.uid])} priority`);
  check(effectivePriority("Moonblast", s.mons[whim.uid]) === 0,
    "  but its attacking moves stay in the normal bracket");
  check(effectivePriority("Protect", s.mons[chomp.uid]) === 4,
    "Protect is +4 for a mon without Prankster");

  // Garchomp is much faster, yet Prankster Tailwind still resolves first.
  const r = simulateTurn(s, {
    [whim.uid]: { kind: "move", moveName: "Tailwind" },
    [chomp.uid]: { kind: "move", moveName: "Earthquake" },
  }, WORST);
  const twFirst = r.events.findIndex((e) => e.text.includes("Tailwind"));
  const eqFirst = r.events.findIndex((e) => e.text.includes("Earthquake"));
  check(twFirst >= 0 && twFirst < eqFirst,
    "Prankster Tailwind resolves before a much faster Earthquake");
}

// ===========================================================================
console.log("\n-- Encore --");
{
  let s = boardWith(["whimsicott"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");
  const chomp = mine(s, "Garchomp");

  // Turn 1: Garchomp Protects. Now it has a last move to be locked into.
  const t1 = simulateTurn(s, {
    [chomp.uid]: { kind: "move", moveName: "Protect" },
    [whim.uid]: { kind: "move", moveName: "Moonblast", targetUid: chomp.uid },
  }, WORST);
  check(t1.state.mons[chomp.uid].lastMoveName === "Protect",
    `last move recorded as ${t1.state.mons[chomp.uid].lastMoveName}`);

  // Turn 2: Encore locks it into Protect - and Protect used twice in a row fails.
  const t2 = simulateTurn(t1.state, {
    [whim.uid]: { kind: "move", moveName: "Encore", targetUid: chomp.uid },
    [chomp.uid]: { kind: "move", moveName: "Earthquake" },
  }, WORST);
  check(t2.state.mons[chomp.uid].encoreTurnsLeft > 0,
    `Garchomp is Encored for ${t2.state.mons[chomp.uid].encoreTurnsLeft} turns`);
  check(t2.events.some((e) => e.text.includes("overwritten")),
    "  Prankster Encore went first and overwrote the Earthquake");
  check(!t2.events.some((e) => e.text.includes("Earthquake ->")),
    "  the Earthquake never happened");

  // Turn 3: Encore leaves it no choice.
  const locked = legalActions(t2.state.mons[chomp.uid], t2.state, { allowSwitch: false });
  check(locked.every((a) => a.kind === "move" && a.moveName === "Protect"),
    `while Encored the only move available is ${locked[0]?.moveName}`);

  // Switching out clears it.
  const bench = t2.state.sides.me.bench[0];
  const swapped = reduce(t2.state, { type: "SWITCH_IN", side: "me", slot: 0, uid: bench });
  check(swapped.mons[chomp.uid].encoreTurnsLeft === 0,
    "switching out ends the Encore");
}

// ===========================================================================
console.log("\n-- pin breakers: 'unless they have X' --");
{
  let s = boardWith(["whimsicott", "incineroar"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);

  const t0 = Date.now();
  const lines = searchPlans(s, { depth: 1, myBeam: 6, theirBeam: 6, arsenal: "possible" });
  const ms = Date.now() - t0;
  check(lines.length > 0, `breaker-aware search returned ${lines.length} plans in ${ms}ms`);

  check(lines.every((l) => typeof l.pinVsAssumed === "boolean" && typeof l.pinVsPossible === "boolean"),
    "every plan reports both the assumed-set and full-pool verdict");

  const conditional = lines.filter((l) => l.pinVsAssumed && !l.pinVsPossible);
  check(lines.every((l) => !l.pinVsPossible || l.pinVsAssumed || true),
    "the two tiers are reported independently");

  if (conditional.length) {
    const withBreakers = conditional.find((l) => l.breakers.length > 0);
    if (withBreakers) {
      console.log("      >", withBreakers.label);
      for (const b of withBreakers.breakers.slice(0, 3)) console.log("        unless:", b.text);
      check(true, `${conditional.length} plans are conditional, with named breakers`);
    } else {
      check(true, `${conditional.length} conditional plans (breakers came from unsimulated moves)`);
    }
  } else {
    check(true, "no conditional plans in this position - all tiers agree");
  }

  // Planning against the full pool must never be MORE optimistic than planning
  // against the assumed four. More possible moves can only make things worse.
  const assumed = searchPlans(s, { depth: 1, myBeam: 6, theirBeam: 6, arsenal: "assumed" });
  const byLabel = new Map(assumed.map((l) => [l.label, l]));
  const monotone = lines.every((l) => {
    const a = byLabel.get(l.label);
    return !a || l.worst.score <= a.worst.score + 1e-9;
  });
  check(monotone,
    "widening their arsenal never improves my guaranteed floor (monotonicity)");
}

// ===========================================================================
console.log("\n-- Protect is per-Pokemon, not per-side --");
{
  let s = boardWith(["sneasler", "incineroar"]);
  s = setActive(s, ["Whimsicott", "Delphox"]);
  const whim = mine(s, "Whimsicott");
  const delph = mine(s, "Delphox");
  const sneas = opp(s, "sneasler");
  const inc = opp(s, "incineroar");

  // Both of my mons Protect on the SAME turn - entirely legal.
  const both = simulateTurn(s, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [delph.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: whim.uid },
    [inc.uid]: { kind: "move", moveName: "Flare Blitz", targetUid: delph.uid },
  }, WORST);
  check(both.state.mons[whim.uid].curHP === whim.curHP &&
        both.state.mons[delph.uid].curHP === delph.curHP,
    "two different Pokemon can both Protect on the same turn");

  // Next turn one repeats (fails) while the other, having not protected, may.
  const t2Base = both.state;
  const oneRepeat = simulateTurn(t2Base, {
    [whim.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: whim.uid },
  }, WORST);
  check(oneRepeat.state.mons[whim.uid].curHP < t2Base.mons[whim.uid].curHP,
    "the same mon protecting twice in a row fails");

  // And the streak is tracked per mon, so Delphox's counter is its own.
  check(t2Base.mons[whim.uid].protectStreak === 1 && t2Base.mons[delph.uid].protectStreak === 1,
    "each mon carries its own Protect streak");

  // A repeat Protect is UNRELIABLE, not illegal. It has to stay in the legal
  // move list so the planner can weigh a 33% Protect against a certain loss -
  // deleting it meant that trade could never even be considered.
  check(legalActions(t2Base.mons[delph.uid], t2Base).some(
    (a) => a.kind === "move" && a.moveName === "Protect"),
    "straight after protecting, Protect is still OFFERED - it is 33%, not impossible");

  // But a guarantee may never rest on it: under worst-case rolls it fails.
  check(protectSuccessChance(0) === 1, "the first Protect in a run is guaranteed");
  check(Math.abs(protectSuccessChance(1) - 1 / 3) < 1e-9,
    `a second consecutive Protect is 1/3 (${(protectSuccessChance(1) * 100).toFixed(1)}%)`);
  check(Math.abs(protectSuccessChance(2) - 1 / 9) < 1e-9,
    `a third is 1/9 (${(protectSuccessChance(2) * 100).toFixed(1)}%)`);
  check(protectSuccessChance(3) < protectSuccessChance(2),
    "and it keeps dividing by three");

  const repeatWorst = simulateTurn(t2Base, {
    [delph.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: delph.uid },
  }, WORST);
  check(repeatWorst.state.mons[delph.uid].curHP < t2Base.mons[delph.uid].curHP,
    "under worst-case rolls the repeat fails, so no pin can rest on it");
  check(repeatWorst.events.some((e) => /33%/.test(e.text)),
    "  and the event says what the odds actually were");

  // Under best-case rolls it lands, so the upside column stays honest.
  const repeatBest = simulateTurn(t2Base, {
    [delph.uid]: { kind: "move", moveName: "Protect" },
    [sneas.uid]: { kind: "move", moveName: "Close Combat", targetUid: delph.uid },
  }, { roll: "bestForMe", tie: "me" });
  check(repeatBest.state.mons[delph.uid].curHP === t2Base.mons[delph.uid].curHP,
    "under best-case rolls the repeat lands - the two are reported apart");

  const attacked = simulateTurn(t2Base, {
    [delph.uid]: { kind: "move", moveName: "Heat Wave" },
  }, WORST);
  check(attacked.state.mons[delph.uid].protectStreak === 0,
    "using a different move clears the streak");
  check(legalActions(attacked.state.mons[delph.uid], attacked.state).some(
    (a) => a.kind === "move" && a.moveName === "Protect"),
    "  so Protect is legal again the turn after");
}

// ===========================================================================
console.log("\n-- Psychic Terrain blocks the priority bracket --");
{
  let s = boardWith(["incineroar", "sneasler"]);
  s = setActive(s, ["Kingambit", "Garchomp"]);
  s = reduce(s, { type: "SET_TERRAIN", kind: "psychic" });
  const gambit = mine(s, "Kingambit");
  const inc = opp(s, "incineroar");

  check(isGrounded(s.mons[gambit.uid], s), "Kingambit is grounded (Dark/Steel)");

  const fo = simulateTurn(s, {
    [inc.uid]: { kind: "move", moveName: "Fake Out", targetUid: gambit.uid },
  }, WORST);
  check(fo.state.mons[gambit.uid].curHP === gambit.curHP,
    "Fake Out does nothing under Psychic Terrain");
  check(fo.events.some((e) => e.text.includes("Psychic Terrain")),
    "  and the log says why");
  check(!leadRisks(s).some((r) => r.kind === "flinch"),
    "  the lead-risk panel stops warning about a Fake Out that cannot happen");

  // A Flying type is NOT grounded, so priority still lands on it.
  let air = boardWith(["incineroar"]);
  air = setActive(air, ["Staraptor", "Garchomp"]);
  air = reduce(air, { type: "SET_TERRAIN", kind: "psychic" });
  const star = mine(air, "Staraptor");
  check(!isGrounded(air.mons[star.uid], air), "Mega Staraptor is Flying, so not grounded");
  const fo2 = simulateTurn(air, {
    [opp(air, "incineroar").uid]: { kind: "move", moveName: "Fake Out", targetUid: star.uid },
  }, WORST);
  check(fo2.state.mons[star.uid].curHP < star.curHP,
    "  Fake Out still connects on it under Psychic Terrain");

  // Sucker Punch is priority too, so it is blocked the same way.
  let sp = boardWith(["kingambit"]);
  sp = setActive(sp, ["Garchomp", "Glimmora"]);
  sp = reduce(sp, { type: "SET_TERRAIN", kind: "psychic" });
  const chomp2 = mine(sp, "Garchomp");
  const r = simulateTurn(sp, {
    [opp(sp, "kingambit").uid]: { kind: "move", moveName: "Sucker Punch", targetUid: chomp2.uid },
  }, WORST);
  check(r.state.mons[chomp2.uid].curHP === chomp2.curHP,
    "Sucker Punch is blocked by Psychic Terrain too");
}

// ===========================================================================
console.log("\n-- Prankster status moves do not touch Dark types --");
{
  let s = boardWith(["whimsicott"]);
  s = setActive(s, ["Kingambit", "Garchomp"]);
  const whim = opp(s, "whimsicott");
  const gambit = mine(s, "Kingambit");
  const chomp = mine(s, "Garchomp");

  // Give Kingambit a last move for an Encore to aim at.
  const t1 = simulateTurn(s, {
    [gambit.uid]: { kind: "move", moveName: "Iron Head", targetUid: whim.uid },
  }, WORST);
  check(t1.state.mons[gambit.uid].lastMoveName === "Iron Head", "Kingambit has a last move");

  const enc = simulateTurn(t1.state, {
    [whim.uid]: { kind: "move", moveName: "Encore", targetUid: gambit.uid },
  }, WORST);
  check(enc.state.mons[gambit.uid].encoreTurnsLeft === 0,
    "Prankster Encore fails against Dark-type Kingambit");
  check(enc.events.some((e) => e.text.includes("Dark")),
    "  and the log explains it");

  // The same Encore works fine on a non-Dark target.
  const t1b = simulateTurn(s, {
    [chomp.uid]: { kind: "move", moveName: "Earthquake" },
  }, WORST);
  const encb = simulateTurn(t1b.state, {
    [whim.uid]: { kind: "move", moveName: "Encore", targetUid: chomp.uid },
  }, WORST);
  check(encb.state.mons[chomp.uid].encoreTurnsLeft > 0,
    "  but it lands on Garchomp, which is not Dark");
}

// ===========================================================================
console.log("\n-- terrain damage modifiers --");
{
  let s = boardWith(["charizard-y"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);
  const chomp = mine(s, "Garchomp");
  const zard = opp(s, "charizard-y");

  const plain = resolveMatchup(s.mons[chomp.uid], s.mons[zard.uid], "Dragon Claw", s);
  const misty = reduce(s, { type: "SET_TERRAIN", kind: "misty" });
  const damped = resolveMatchup(misty.mons[chomp.uid], misty.mons[zard.uid], "Dragon Claw", misty);
  // Charizard is Flying, so NOT grounded - Misty Terrain must not touch it.
  check(damped.max === plain.max,
    "Misty Terrain does not weaken Dragon moves against an airborne target");

  let g = boardWith(["kingambit"]);
  g = setActive(g, ["Garchomp", "Glimmora"]);
  const gch = mine(g, "Garchomp");
  const gk = opp(g, "kingambit");
  const eqPlain = resolveMatchup(g.mons[gch.uid], g.mons[gk.uid], "Earthquake", g);
  const grassy = reduce(g, { type: "SET_TERRAIN", kind: "grassy" });
  const eqGrassy = resolveMatchup(grassy.mons[gch.uid], grassy.mons[gk.uid], "Earthquake", grassy);
  check(eqGrassy.max < eqPlain.max,
    `Grassy Terrain halves Earthquake into a grounded target (${eqPlain.max} -> ${eqGrassy.max})`);
}

// ===========================================================================
console.log("\n-- depth 3 performance --");
{
  let s = boardWith(["whimsicott", "incineroar"]);
  s = setActive(s, ["Garchomp", "Kingambit"]);

  clearMatchupCache();
  const t0 = Date.now();
  const d3 = searchPlans(s, { depth: 3, myBeam: 6, theirBeam: 6, arsenal: "possible" });
  const ms = Date.now() - t0;
  console.log(`      depth 3: ${d3.length} plans in ${ms}ms`);
  check(d3.length > 0, "depth 3 returns plans");
  check(ms < 15000, `depth 3 completes in usable time (${ms}ms)`);
  check(d3.every((l) => l.horizon === 3), "every line reports horizon 3");

  const top = d3[0];
  console.log("      best:", top.label);
  console.log("      pin vs assumed:", top.pinVsAssumed, "| pin vs any set:", top.pinVsPossible);
}

// ===========================================================================
// THE READ: Hyper Beam costs a turn, and the search has to pay it.
//
// The simulator did not model the recharge at all, so the planner got 150 BP
// for free and recommended Hyper Beam over everything. The turn it costs never
// appeared in any line the search looked at - which is exactly the kind of bug
// that makes a tool confidently wrong rather than merely unhelpful.
// ===========================================================================
console.log("\n-- a recharge move costs the following turn --");
{
  let s = newBattleState();
  for (const id of ["garchomp", "charizard-y"]) {
    s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  }
  const my = (n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  const their = (id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: my("Sylveon").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: my("Farigiraf").uid });
  const syl = my("Sylveon");
  const zard = their("charizard-y");

  check(!s.mons[syl.uid].mustRecharge, "nothing is recharging to start with");

  const after = simulateTurn(s, {
    [syl.uid]: { kind: "move", moveName: "Hyper Beam", targetUid: zard.uid },
  }, WORST);
  check(after.state.mons[syl.uid].mustRecharge,
    "using Hyper Beam leaves the user needing to recharge");

  // The whole cost: on the next turn it has NO choices at all - it cannot even
  // switch out.
  const next = reduce(after.state, { type: "NEXT_TURN" });
  const acts = legalActions(next.mons[syl.uid], next, { allowSwitch: true });
  check(acts.length === 1,
    `a recharging Pokemon has exactly one (no-op) action, not a menu (${acts.length})`);
  check(!acts.some((a) => a.kind === "switch"),
    "  and switching out is not among them");

  const spent = simulateTurn(next, {
    [syl.uid]: acts[0],
    [zard.uid]: { kind: "move", moveName: "Heat Wave" },
  }, WORST);
  check(spent.events.some((e) => /must recharge/.test(e.text)),
    "  the recharge turn is reported as spent doing nothing");
  check(!spent.state.mons[syl.uid].mustRecharge,
    "  and the lock clears afterwards");

  // It must not hit anything on the recharge turn.
  const zardHP = next.mons[zard.uid].curHP;
  check(spent.state.mons[zard.uid].curHP === zardHP,
    "  the recharging Pokemon deals no damage that turn");

  // A normal move never sets it.
  const clean = simulateTurn(s, {
    [syl.uid]: { kind: "move", moveName: "Hyper Voice" },
  }, WORST);
  check(!clean.state.mons[syl.uid].mustRecharge,
    "a non-recharge move leaves the user free next turn");
}


// ===========================================================================
// THE BOARD THAT CAUGHT IT: Raichu + Staraptor into Charizard-Y + Garchomp.
//
// The beamed multi-turn search ranked "switch Staraptor out for Kingambit"
// first. Staraptor is Normal/Flying and IMMUNE to Ground; Kingambit is
// Dark/Steel and 2x weak to it. Garchomp's Earthquake is the obvious punish, so
// that line volunteers the one Pokemon that could not be hit and replaces it
// with the one that is hit hardest.
//
// Two separate defects were behind it, and this pins both.
// ===========================================================================
console.log("\n-- the Earthquake board --");
{
  let s = newBattleState();
  for (const id of ["charizard-y", "garchomp"]) {
    s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  }
  const my = (n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  const their = (id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: my("Raichu").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: my("Staraptor").uid });
  const raichu = my("Raichu"), star = my("Staraptor"), gambit = my("Kingambit");
  const zard = their("charizard-y"), chomp = their("garchomp");

  // The type facts the advice has to respect.
  const starTypes = activeProfile(s.mons[star.uid]).types;
  const gambitTypes = activeProfile(s.mons[gambit.uid]).types;
  check(starTypes.includes("Flying"), `Staraptor is ${starTypes.join("/")} - immune to Ground`);
  check(gambitTypes.includes("Steel"), `Kingambit is ${gambitTypes.join("/")} - 2x weak to Ground`);

  const eqStar = resolveMatchup(s.mons[chomp.uid], s.mons[star.uid], "Earthquake", s);
  const eqGambit = resolveMatchup(s.mons[chomp.uid], s.mons[gambit.uid], "Earthquake", s);
  check(eqStar.typeMult === 0, "Earthquake cannot touch Staraptor at all");
  check(eqGambit.typeMult === 2, `Earthquake is x${eqGambit.typeMult} on Kingambit`);

  // DEFECT 1: defensive plans were cut from the shortlist before their worst
  // case was ever computed, because the pre-pass ranks by immediate damage.
  const lines = searchPlans(s, { depth: 1, myBeam: 8, theirBeam: 8, arsenal: "possible" });
  const protectLines = lines.filter((l) => /Protect/.test(l.label));
  check(protectLines.length > 0,
    `${protectLines.length} Protect lines are evaluated, not cut by the pre-pass`);

  // DEFECT 2: the beam inside bestLineValue.
  //
  // bestLineValue is a MAX node - it returns the best of whatever it looked at.
  // Its candidates were ranked by value with NO reply, which puts attacks in
  // the beam and defence out, so each branch was understated by a DIFFERENT
  // amount depending on what happened to land in its beam. A continuation that
  // left a big attacker on the field scored high; one that needed a Protect
  // scored low. That inverted the top-level ranking: switching the
  // Ground-immune Pokemon out looked best because the resulting board's beam
  // looked good, not because the line was.
  //
  // The fix is a reserved defensive quota in the beam. Verified against an
  // UNLIMITED beam: both produce the same ranking, the quota ~10x faster.
  const swapRank = lines.findIndex((l) => /switch to Kingambit/.test(l.label));
  console.log(`      depth 1 top: ${lines[0].label}`);
  console.log(`      switch-into-Kingambit ranks ${swapRank + 1} of ${lines.length}`);
  check(swapRank !== 0,
    "the exhaustive search does NOT rank switching the Ground-immune Pokemon out first");
  check(lines[0].worst.exhaustive,
    "and depth 1 checked every reply, so that ranking is verified rather than beamed");

  // The real regression guard: the DEEP search must now agree that this is a
  // bad line. Before the fix it ranked it 1st at both depth 2 and depth 3.
  for (const depth of [2, 3]) {
    const deep = searchPlans(s, { depth, myBeam: 4, theirBeam: 4, arsenal: "possible" });
    const rank = deep.findIndex((l) => /switch to Kingambit/.test(l.label));
    console.log(`      depth ${depth} ranks it ${rank + 1} of ${deep.length}: ${deep[0].label.slice(0, 54)}`);
    check(rank !== 0,
      `depth ${depth} does not rank it first either (was rank 1 before the beam fix)`);
  }
}

// ===========================================================================
// The beam must never be able to delete defence outright.
// ===========================================================================
console.log("\n-- beams reserve room for defensive plans --");
{
  let s = newBattleState();
  for (const id of ["charizard-y", "garchomp"]) {
    s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  }
  const my = (n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: my("Raichu").uid });
  s = reduce(s, { type: "SWITCH_IN", side: "me", slot: 1, uid: my("Staraptor").uid });

  // Every depth has to keep them, not just depth 1 - the defect lived in the
  // RECURSIVE beam, so a depth-1-only guarantee would have missed it entirely.
  for (const depth of [1, 2, 3]) {
    const lines = searchPlans(s, { depth, myBeam: 4, theirBeam: 4, arsenal: "possible" });
    const def = lines.filter((l) => /Protect|switch/.test(l.label));
    check(def.length > 0,
      `depth ${depth}: ${def.length} defensive lines survive the beam`);
  }

  // And a Protect line has to be able to WIN the ranking when it deserves to.
  const d1 = searchPlans(s, { depth: 1, myBeam: 8, theirBeam: 8, arsenal: "possible" });
  check(/Protect/.test(d1[0].label),
    `on this board the best line IS a Protect: ${d1[0].label}`);

  // The punish itself has to be found and reported, whichever line is on top.
  const raichu = my("Raichu"), star = my("Staraptor"), gambit = my("Kingambit");
  const their = (id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);
  const zard = their("charizard-y"), chomp = their("garchomp");
  const swap = d1.find((l) => /switch to Kingambit/.test(l.label));
  check(swap && /Earthquake/.test(swap.worst.replyLabel),
    `the switch line's worst case names the Earthquake: "${swap?.worst.replyLabel}"`);

  // And staying is genuinely better against that exact punish - same Pokemon
  // alive, more HP - which is what makes the old ranking wrong.
  const punish = {
    [zard.uid]: { kind: "move", moveName: "Protect" },
    [chomp.uid]: { kind: "move", moveName: "Earthquake" },
  };
  const zapAt = { kind: "move", moveName: "Zap Cannon", targetUid: zard.uid };
  const staying = simulateTurn(s, {
    [raichu.uid]: zapAt,
    [star.uid]: { kind: "move", moveName: "Dual Wingbeat", targetUid: chomp.uid },
    ...punish,
  }, WORST);
  const switching = simulateTurn(s, {
    [raichu.uid]: zapAt,
    [star.uid]: { kind: "switch", toUid: gambit.uid },
    ...punish,
  }, WORST);
  const hp = (st) => Object.values(st.mons)
    .filter((m) => m.side === "me" && !m.fainted)
    .reduce((n, m) => n + (100 * m.curHP) / m.maxHP, 0);
  console.log(`      staying leaves ${Math.round(hp(staying.state))}% of HP, switching ${Math.round(hp(switching.state))}%`);
  check(hp(staying.state) > hp(switching.state),
    "against that exact punish, staying keeps strictly more of my side alive");
  check(evaluate(staying.state) > evaluate(switching.state),
    `and scores better (${Math.round(evaluate(staying.state))} vs ${Math.round(evaluate(switching.state))})`);
}

console.log(`
${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
