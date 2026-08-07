// Resource preservation - run: node test-resources.mjs
//
// "Keep your Charizard answer alive." The tool could already say Sylveon
// answers Basculegion; what it could not say was that trading Sylveon into a
// Whimsicott loses the game, because Basculegion is still in the back and
// Sylveon was the only thing that beat it.
//
// A Pokemon is worth the threats it is holding shut, not its HP bar.
import { newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { runCommand } from "./src/app/input/command.ts";
import {
  answerDuties, dutyValue, resourceWarnings, unansweredThreats,
  SOLE_ANSWER_VALUE, SHARED_ANSWER_VALUE,
} from "./src/app/battle/resources.ts";
import { evaluate, DEFAULT_WEIGHTS } from "./src/app/search/evaluate.ts";
import { briefFor } from "./src/app/battle/brief.ts";
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

function play(scripts) {
  let s = newBattleState();
  for (const t of scripts) {
    const r = runCommand(t, s);
    for (const a of r.actions) s = reduce(s, a);
  }
  return s;
}

const BOARD = [
  "zard, incin, gambit, chomp, bascu, whims",
  "they lead whims and incin",
  "we lead sylveon and arcanine",
];

// ===========================================================================
console.log("-- who is holding what shut --");
{
  const s = play(BOARD);
  const duties = answerDuties(s);

  for (const [uid, d] of Object.entries(duties)) {
    if (!d.answers.length) continue;
    console.log(
      `      ${nameOf(s.mons[uid]).padEnd(16)} answers ${d.answers.length}` +
      `${d.soleFor.length ? ` [SOLE for ${d.soleFor.map((u) => nameOf(s.mons[u])).join(", ")}]` : ""}` +
      `  value ${dutyValue(d)}`
    );
  }

  const syl = duties[mine(s, "Sylveon").uid];
  check(syl.answers.length > 0, `Sylveon is answering ${syl.answers.length} of their live Pokemon`);
  check(syl.soleFor.length > 0 && syl.irreplaceable,
    `  and is the ONLY answer to ${syl.soleFor.map((u) => nameOf(s.mons[u])).join(", ")}`);

  // A Pokemon nothing depends on is cheap; a sole answer is expensive.
  const cheap = Object.values(duties).find((d) => d.answers.length === 0);
  if (cheap) check(dutyValue(cheap) === 0, "a Pokemon holding nothing shut is worth no duty bonus");
  check(dutyValue(syl) > SOLE_ANSWER_VALUE, "a sole answer is worth more than a shared one");
  check(SOLE_ANSWER_VALUE > SHARED_ANSWER_VALUE * 4,
    "being the ONLY answer is worth far more than being one of several");
}

// ===========================================================================
console.log("\n-- an answer to something already dead is not a resource --");
{
  let s = play(BOARD);
  const chomp = opp(s, "garchomp");
  const before = answerDuties(s)[mine(s, "Sylveon").uid];
  check(before.soleFor.includes(chomp.uid), "Sylveon is the sole answer to Garchomp");

  // Once Garchomp is gone, Sylveon stops being irreplaceable on its account.
  s = reduce(s, { type: "SET_FAINTED", uid: chomp.uid, fainted: true });
  const after = answerDuties(s)[mine(s, "Sylveon").uid];
  check(!after.soleFor.includes(chomp.uid),
    "  once Garchomp faints, Sylveon is no longer held back on its account");
  check(dutyValue(after) < dutyValue(before),
    `  and its duty value drops (${dutyValue(before)} -> ${dutyValue(after)})`);

  // Same for a Pokemon proved not to have been brought.
  let t = play(BOARD);
  t = reduce(t, { type: "SET_BROUGHT", uid: opp(t, "garchomp").uid, brought: "out" });
  check(!answerDuties(t)[mine(t, "Sylveon").uid].soleFor.includes(opp(t, "garchomp").uid),
    "a Pokemon proved NOT brought is not a threat to hold an answer back for");
}

// ===========================================================================
// The part that actually changes decisions: the SEARCH has to see it.
// ===========================================================================
console.log("\n-- the evaluation prices the resource --");
{
  const s = play(BOARD);
  const duties = answerDuties(s);
  const syl = mine(s, "Sylveon");

  const withDuties = evaluate(s, DEFAULT_WEIGHTS, duties);
  const without = evaluate(s, DEFAULT_WEIGHTS);
  check(withDuties > without,
    `holding threats shut is worth points (${Math.round(without)} -> ${Math.round(withDuties)})`);

  // Losing the sole answer must cost more than losing an equivalent Pokemon
  // that is holding nothing shut. That is the whole claim.
  const idle = Object.values(duties).find((d) => d.answers.length === 0 && d.uid !== syl.uid);
  const loseSylveon = reduce(s, { type: "SET_FAINTED", uid: syl.uid, fainted: true });
  const costOfSylveon = withDuties - evaluate(loseSylveon, DEFAULT_WEIGHTS, answerDuties(loseSylveon));

  if (idle) {
    const loseIdle = reduce(s, { type: "SET_FAINTED", uid: idle.uid, fainted: true });
    const costOfIdle = withDuties - evaluate(loseIdle, DEFAULT_WEIGHTS, answerDuties(loseIdle));
    console.log(`      losing Sylveon costs ${Math.round(costOfSylveon)}, ` +
      `losing ${nameOf(s.mons[idle.uid])} costs ${Math.round(costOfIdle)}`);
    check(costOfSylveon > costOfIdle,
      "losing the sole answer costs more than losing a Pokemon holding nothing shut");
  } else {
    check(costOfSylveon > DEFAULT_WEIGHTS.monAlive,
      "losing the sole answer costs more than a bare Pokemon");
  }

  // But never so much that the planner refuses to trade it to actually win.
  check(SOLE_ANSWER_VALUE < DEFAULT_WEIGHTS.monAlive,
    `a sole answer is worth less than a whole Pokemon (${SOLE_ANSWER_VALUE} < ${DEFAULT_WEIGHTS.monAlive}) ` +
    `- it must still be spendable to win`);

  // Omitting the map turns the term off entirely rather than crashing: the
  // search calls evaluate hundreds of thousands of times and some paths do not
  // have a map to hand.
  check(Number.isFinite(evaluate(s)), "evaluate still works with no duty map");
}

// ===========================================================================
console.log("\n-- the warning, in words --");
{
  const s = play(BOARD);
  const warns = resourceWarnings(s);
  check(warns.length > 0, `${warns.length} resource warning(s)`);
  for (const w of warns) console.log(`      [${w.severity}] ${w.text}`);

  const high = warns.find((w) => w.severity === "high");
  check(high, "a sole answer to something still in the BACK is high severity");
  check(/ONLY answer/.test(high.text), "  it says it is the only answer");
  check(/still in the back/.test(high.text),
    "  and that the threat has not even appeared yet - which is why it is easy to get wrong");
  check(/Do not trade it off/.test(high.text), "  and it says what to actually do");

  // It only fires for Pokemon genuinely at risk. A healthy benched sole answer
  // is not something you need warning about this turn.
  const benched = Object.values(s.mons).filter(
    (m) => m.side === "me" && !s.sides.me.active.includes(m.uid) && m.curHP === m.maxHP
  );
  const noisy = warns.filter((w) => benched.some((b) => b.uid === w.uid));
  check(noisy.length === 0,
    "a healthy Pokemon safely on the bench does not generate a warning every turn");

  // And it reaches the console reply.
  const brief = briefFor(s);
  check(brief.urgent.some((u) => /ONLY answer/.test(u)),
    "the warning appears in the console brief as urgent");
}

// ===========================================================================
console.log("\n-- when there is no answer left at all --");
{
  let s = play(BOARD);
  check(unansweredThreats(s).length === 0, "with the full team, everything they have is answered");

  // Kill every one of mine that answers Garchomp.
  const chompUid = opp(s, "garchomp").uid;
  for (const [uid, d] of Object.entries(answerDuties(s))) {
    if (d.answers.includes(chompUid)) s = reduce(s, { type: "SET_FAINTED", uid, fainted: true });
  }
  const orphans = unansweredThreats(s);
  console.log("      unanswered:", orphans.map(nameOf).join(", ") || "(none)");
  check(orphans.some((m) => m.uid === chompUid),
    "once every answer is dead, Garchomp is reported as unanswered");

  const brief = briefFor(s);
  check(brief.urgent.some((u) => /Nothing left on your side answers/.test(u)),
    "and the console says so rather than quietly recommending the next-best attack");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
