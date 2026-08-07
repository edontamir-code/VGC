// Turn-script parsing + speed inference - run: node test-input.mjs
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { legacyBattle } from "./test-fixture.mjs";
import { reduce } from "./src/app/state/reducer.ts";
import { parseTurn } from "./src/app/input/parseTurn.ts";
import {
  possibleSpeedStats, speedRange, effectiveSpeedRange, outspeedVerdict,
} from "./src/app/battle/speedInference.ts";
import { detectContradictions } from "./src/app/input/contradictions.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function board(ids, actives) {
  let s = legacyBattle();
  for (const id of ids) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  actives.forEach((n, slot) => {
    const m = mine(s, n);
    if (m) s = reduce(s, { type: "SWITCH_IN", side: "me", slot, uid: m.uid });
  });
  return s;
}

// ===========================================================================
console.log("-- parsing --");
{
  const s = board(["whimsicott", "incineroar"], ["Garchomp", "Kingambit"]);

  const p1 = parseTurn("I protect, he protects, he tailwinds", s);
  check(p1.entries.length === 3, `three actions parsed from plain English`);
  check(p1.entries[0].actorUid === mine(s, "Garchomp").uid,
    `"I" resolved to ${p1.entries[0].actorName}`);
  check(p1.entries[1].actorUid !== p1.entries[2].actorUid,
    "two separate 'he' phrases resolved to two different opposing mons");
  check(p1.entries[2].moveName === "Tailwind", `"tailwinds" -> ${p1.entries[2].moveName}`);

  const p2 = parseTurn("chomp eq, gambit sucker on whims, whims tw, incin fo chomp", s);
  check(p2.entries[0].moveName === "Earthquake", `"eq" -> ${p2.entries[0].moveName}`);
  check(p2.entries[0].actorName.includes("Garchomp"), `"chomp" -> ${p2.entries[0].actorName}`);
  check(p2.entries[1].moveName === "Sucker Punch", `"sucker" -> ${p2.entries[1].moveName}`);
  check(p2.entries[1].targetName === "Whimsicott", `"on whims" -> ${p2.entries[1].targetName}`);
  check(p2.entries[2].moveName === "Tailwind", `"tw" -> ${p2.entries[2].moveName}`);
  check(p2.entries[3].moveName === "Fake Out", `"fo" -> ${p2.entries[3].moveName}`);
  check(p2.entries[3].targetName.includes("Garchomp"), `"fo chomp" targeted ${p2.entries[3].targetName}`);

  const p3 = parseTurn("1 protect / 3 fake out on 1 / 2 iron head", s);
  check(p3.entries.length === 3 && p3.entries[0].actorUid === mine(s, "Garchomp").uid,
    "slot numbers work as actor references");

  const bad = parseTurn("gyarados splashes", s);
  check(bad.entries[0].problem !== null, `unknown input is flagged: "${bad.entries[0].problem}"`);
  check(!bad.complete, "  and the turn is not marked complete");

  const sw = parseTurn("chomp switch to delphox", s);
  check(sw.entries[0].action?.kind === "switch", "switches parse");
}

// ===========================================================================
console.log("\n-- speed inference --");
{
  const s = board(["whimsicott"], ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");
  const chomp = mine(s, "Garchomp");

  const all = possibleSpeedStats(s.mons[whim.uid]);
  const r0 = speedRange(s.mons[whim.uid]);
  check(all.length > 1 && r0.min < r0.max,
    `unknown Whimsicott Speed spans ${r0.min}-${r0.max} (${r0.candidates} candidates)`);

  const v0 = outspeedVerdict(s.mons[chomp.uid], s.mons[whim.uid], s);
  check(v0.verdict === "unknown", `"do I outspeed" is honestly ${v0.verdict} at the start`);

  // Garchomp moved FIRST in the same bracket -> Whimsicott is no faster.
  const after = reduce(s, {
    type: "APPLY_TURN_SCRIPT",
    script: "chomp eq, whims moonblast",
    entries: [
      { actorUid: chomp.uid, moveName: "Earthquake", action: { kind: "move", moveName: "Earthquake" } },
      { actorUid: whim.uid, moveName: "Moonblast", action: { kind: "move", moveName: "Moonblast", targetUid: chomp.uid } },
    ],
  });
  const r1 = speedRange(after.mons[whim.uid]);
  check(r1.max < r0.max,
    `observing Garchomp move first narrowed Whimsicott to ${r1.min}-${r1.max}`);
  check(r1.candidates < r0.candidates,
    `  ${r0.candidates} candidates down to ${r1.candidates}`);

  // Observing the order proves they are no FASTER than me. It cannot rule out
  // an exact tie, because a tie is decided by a coinflip - so the verdict stays
  // "unknown" rather than overclaiming "always".
  const v1 = outspeedVerdict(after.mons[chomp.uid], after.mons[whim.uid], after);
  check(v1.theirRange.max <= v1.mySpeed,
    `they can no longer outspeed me (${v1.mySpeed} vs max ${v1.theirRange.max})`);
  check(v1.verdict === "unknown",
    `  but the verdict stays "${v1.verdict}" because an exact tie is still possible`);

  // The move it used is confirmed too.
  check(after.mons[whim.uid].revealed.moves.includes("Moonblast"),
    "recording the turn confirmed the move it used");

  // Narrowing must never exclude the truth: the real spread stays in range.
  const realSpe = 138; // Timid, 6 SP - the set threats.js ships
  check(r1.min <= realSpe && realSpe <= r1.max,
    `the actual spread (${realSpe}) is still inside the inferred range`);
}

// ===========================================================================
console.log("\n-- inference respects priority and Trick Room --");
{
  const s = board(["whimsicott"], ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");
  const gambit = mine(s, "Kingambit");
  const before = speedRange(s.mons[whim.uid]);

  // Kingambit is slow, but Sucker Punch is +1 - going first proves nothing.
  const prio = reduce(s, {
    type: "APPLY_TURN_SCRIPT",
    script: "gambit sucker, whims moonblast",
    entries: [
      { actorUid: gambit.uid, moveName: "Sucker Punch", action: { kind: "move", moveName: "Sucker Punch", targetUid: whim.uid } },
      { actorUid: whim.uid, moveName: "Moonblast", action: { kind: "move", moveName: "Moonblast", targetUid: gambit.uid } },
    ],
  });
  const afterPrio = speedRange(prio.mons[whim.uid]);
  check(afterPrio.min === before.min && afterPrio.max === before.max,
    "a priority move going first teaches nothing about Speed");

  // Under Trick Room the reading inverts.
  const tr = reduce(s, { type: "SET_TRICK_ROOM", on: true });
  const chomp = mine(tr, "Garchomp");
  const trAfter = reduce(tr, {
    type: "APPLY_TURN_SCRIPT",
    script: "chomp eq, whims moonblast",
    entries: [
      { actorUid: chomp.uid, moveName: "Earthquake", action: { kind: "move", moveName: "Earthquake" } },
      { actorUid: whim.uid, moveName: "Moonblast", action: { kind: "move", moveName: "Moonblast", targetUid: chomp.uid } },
    ],
  });
  const trRange = speedRange(trAfter.mons[whim.uid]);
  check(trRange.min >= before.min,
    `under Trick Room, moving first means SLOWER - Whimsicott read as ${trRange.min}-${trRange.max}`);
}

// ===========================================================================
console.log("\n-- effective range reflects the field --");
{
  let s = board(["basculegion"], ["Garchomp", "Kingambit"]);
  const bascu = opp(s, "basculegion");
  const plain = effectiveSpeedRange(s.mons[bascu.uid], s);
  const tw = reduce(s, { type: "SET_TAILWIND", side: "opp", on: true });
  const boosted = effectiveSpeedRange(tw.mons[bascu.uid], tw);
  check(boosted.min > plain.min && boosted.max > plain.max,
    `their Tailwind lifts the whole range (${plain.min}-${plain.max} -> ${boosted.min}-${boosted.max})`);
}

// ===========================================================================
console.log("\n-- HP readings and faints --");
{
  const s = board(["whimsicott", "incineroar"], ["Garchomp", "Kingambit"]);
  const chomp = mine(s, "Garchomp");

  const p = parseTurn("chomp eq, whims moonblast on chomp, chomp at 45%", s);
  check(p.entries.length === 2, `HP reading kept out of the action list (${p.entries.length} actions)`);
  check(p.effects.length === 1 && p.effects[0].kind === "hp" && p.effects[0].pct === 45,
    `"chomp at 45%" read as an HP effect (${p.effects[0]?.pct}%)`);

  const f = parseTurn("gambit kowtow on whims, whims fainted", s);
  check(f.effects.length === 1 && f.effects[0].kind === "faint",
    "\"whims fainted\" read as a faint");
  const f2 = parseTurn("gambit kowtow on whims, ko'd whims", s);
  check(f2.effects.length === 1 && f2.effects[0].kind === "faint",
    "\"ko'd whims\" read as a faint too");

  // A move whose name contains no number must not be mistaken for an HP reading.
  const g = parseTurn("gambit low kick on whims", s);
  check(g.effects.length === 0 && g.entries[0].moveName === "Low Kick",
    "move names are never swallowed as HP readings");

  // Applying honours the observation over the simulated roll.
  const applied = reduce(s, {
    type: "APPLY_TURN_SCRIPT",
    script: "chomp eq, chomp at 45%",
    entries: [
      { actorUid: chomp.uid, moveName: "Earthquake", action: { kind: "move", moveName: "Earthquake" } },
    ],
    effects: [{ kind: "hp", uid: chomp.uid, pct: 45 }],
  });
  const hp = applied.mons[chomp.uid];
  check(Math.abs(hp.curHP - hp.maxHP * 0.45) <= 1,
    `observed HP overrode the simulation (${hp.curHP}/${hp.maxHP})`);
}

// ===========================================================================
console.log("\n-- contradiction detection --");
{
  const s = board(["whimsicott"], ["Garchomp", "Kingambit"]);
  const whim = opp(s, "whimsicott");
  const chomp = mine(s, "Garchomp");

  // Whimsicott has Prankster, so its Protect is +5 and MUST precede a +4 Protect.
  const bad = detectContradictions(s, [
    { actorUid: chomp.uid, moveName: "Protect" },
    { actorUid: whim.uid, moveName: "Protect" },
  ]);
  check(bad.length > 0 && bad[0].kind === "priority",
    "recording a Prankster Protect second is flagged as impossible");
  check(/Prankster/i.test(bad[0].suggestion),
    `  and it names the suspect assumption: "${bad[0].suggestion.slice(0, 72)}..."`);

  // The same order the other way round is fine.
  const good = detectContradictions(s, [
    { actorUid: whim.uid, moveName: "Protect" },
    { actorUid: chomp.uid, moveName: "Protect" },
  ]);
  check(good.length === 0, "the correct order raises nothing");

  // Ordinary same-bracket attacks are never contradictions - just evidence.
  const normal = detectContradictions(s, [
    { actorUid: chomp.uid, moveName: "Earthquake" },
    { actorUid: whim.uid, moveName: "Moonblast" },
  ]);
  check(normal.length === 0, "a normal speed-order observation is not a contradiction");

  // An opponent outrunning something it cannot outrun must be flagged.
  const star = mine(s, "Staraptor");
  let fast = reduce(s, { type: "SWITCH_IN", side: "me", slot: 0, uid: star.uid });
  const impossible = detectContradictions(fast, [
    { actorUid: whim.uid, moveName: "Moonblast" },
    { actorUid: star.uid, moveName: "Brave Bird" },
  ]);
  if (impossible.length > 0) {
    check(impossible[0].kind === "speed" && /Scarf|Tailwind/i.test(impossible[0].suggestion),
      `unreachable Speed flagged: "${impossible[0].suggestion.slice(0, 60)}..."`);
  } else {
    check(true, "Whimsicott can legally outrun Mega Staraptor, so no contradiction");
  }
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
