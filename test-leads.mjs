// The lead turn - run: node test-leads.mjs
//
// Turn 0 to turn 1 is its own decision. Their lead pair is the first real
// information they give up and it is usually where they commit to a plan, so
// the reads here have to be about the PLAN, not about two isolated matchups.
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { openingRead, readLeads, speedRaces, PLAN_CUTOFF } from "./src/app/battle/leads.ts";
import { activeProfile } from "./src/app/battle/stats.ts";
import { fakeOutReads } from "./src/app/battle/protect.ts";
import { moveProbability } from "./src/app/battle/inference.ts";
import { scoreLeadPair, suggestLeads, physicalShare } from "./src/app/battle/leadScore.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const nameOf = (m) => activeProfile(m).displayName;
const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);

function board(theirIds, myLeads) {
  let s = newBattleState();
  for (const id of theirIds) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  myLeads.forEach((n, i) => {
    const m = mine(s, n);
    if (m) s = reduce(s, { type: "SWITCH_IN", side: "me", slot: i, uid: m.uid });
  });
  return s;
}

// ===========================================================================
console.log("-- the lead turn is a distinct phase --");
{
  const s = board(["whimsicott", "incineroar"], ["Staraptor", "Arcanine"]);
  const r = openingRead(s);
  check(r.isLeadTurn, "turn 1 with both leads untouched is the lead turn");

  // Once anything has been on the field a turn, this is no longer the opening.
  const later = reduce(s, { type: "NEXT_TURN" });
  check(!openingRead(later).isLeadTurn,
    "after a turn has passed it is no longer the lead turn");

  // No opponent entered means no read to give.
  const empty = openingRead(newBattleState());
  check(!empty.isLeadTurn && empty.plans.length === 0,
    "with no opponent on the board there is nothing to read");
}

// ===========================================================================
console.log("\n-- their lead is read as a PLAN --");
{
  const tw = openingRead(board(["whimsicott", "incineroar"], ["Staraptor", "Arcanine"]));
  console.log("     ", tw.headline);
  check(/Tailwind/.test(tw.headline),
    "a Whimsicott lead is called a Tailwind lead");
  check(tw.plans.some((p) => p.kind === "tailwind" && p.probability > 0.9),
    "  with the probability taken from usage, not hardcoded");

  // Fake Out and redirection are SUPPORT. They must not take the headline from
  // the setup move, which is the thing you actually have to decide about.
  check(tw.plans.some((p) => p.kind === "fakeOut"),
    "Incineroar's Fake Out is still reported");
  check(!/Fake Out/.test(tw.headline),
    "  but it does not become the headline - it protects the plan, it is not the plan");

  const tr = openingRead(board(["farigiraf", "sinistcha"], ["Raichu", "Sylveon"]));
  console.log("     ", tr.headline);
  check(/Trick Room/.test(tr.headline), "a Farigiraf lead is called a Trick Room lead");
  check(tr.plans.some((p) => p.kind === "redirect"),
    "  and Sinistcha's Rage Powder is flagged alongside it");

  // Weather is an ability, so it is certain rather than probable.
  const sun = openingRead(board(["charizard-y", "garchomp"], ["Arcanine", "Sylveon"]));
  const w = sun.plans.find((p) => p.kind === "weather");
  check(w && w.probability === 1,
    "a Drought lead sets weather with certainty, not with a usage percentage");
  check(/every Fire and Water calc/i.test(w.text),
    "  and it says what that actually changes");

  // Nothing is claimed below the cutoff.
  for (const p of [...tw.plans, ...tr.plans, ...sun.plans]) {
    if (p.probability < PLAN_CUTOFF) {
      check(false, `a plan below the cutoff was reported: ${p.kind} at ${p.probability}`);
    }
  }
  check(true, `nothing below the ${Math.round(PLAN_CUTOFF * 100)}% cutoff is reported as a read`);
}

// ===========================================================================
// THE MECHANIC: Tailwind and Trick Room are NOT symmetric.
//
// Tailwind is a SIDE effect - both teams can have one up at once and neither
// replaces the other. Trick Room is a FIELD effect that TOGGLES - setting it
// while it is up switches it off. Treating them the same way produces exactly
// backwards advice, which is worse than no advice at all.
// ===========================================================================
console.log("\n-- Tailwind does not cancel, Trick Room does --");
{
  const twBoard = board(["whimsicott", "incineroar"], ["Staraptor", "Arcanine"]);
  const twRace = speedRaces(twBoard).find((r) => r.kind === "tailwind");
  check(twRace, "a Tailwind-vs-Tailwind situation is detected");
  console.log("      TW:", twRace.text);
  check(!twRace.contested,
    "Tailwind is NOT reported as a contested race - both sides can have one");
  check(/do not cancel|does not cancel/i.test(twRace.text),
    "  the text says explicitly that they do not cancel");
  check(!/overwrit|replaces yours|last.*wins/i.test(twRace.text),
    "  and never claims one Tailwind overwrites the other");

  const trBoard = board(["farigiraf", "sinistcha"], ["Farigiraf", "Sylveon"]);
  const trRace = speedRaces(trBoard).find((r) => r.kind === "trickRoom");
  check(trRace, "a Trick Room mirror is detected");
  console.log("      TR:", trRace.text);
  check(trRace.contested, "Trick Room IS a contested race - the second one cancels");
  check(/switches it (straight )?off|cancels/i.test(trRace.text),
    "  and the text says the second use turns it off");

  // The direction has to be right: in the -7 bracket the field is not yet
  // inverted, so the FASTER setter goes first and the SLOWER one resolves last
  // and therefore decides.
  check(
    trRace.iResolveFirst
      ? /hands them the cancel|Stop them setting it/i.test(trRace.text)
      : /good side of this one|cancels theirs/i.test(trRace.text),
    "  being the SLOWER Trick Room setter is the good side, and the text matches which side I am on"
  );
}

// ===========================================================================
console.log("\n-- what is only true on turn 1 --");
{
  const s = board(["incineroar", "whimsicott"], ["Staraptor", "Arcanine"]);
  const r = openingRead(s);
  for (const t of r.turnOneOnly) console.log("      ", t);

  // "Fake Out only works on turn one" is a rule of the game, not a read on
  // this board. It used to be printed beside every single lead, which is how a
  // panel stops being read at all - by the third game the real warnings are
  // being skipped along with the boilerplate. The probability still reaches
  // the player through the fakeOut plan; only the lecture is gone.
  check(!r.turnOneOnly.some((t) => /only turn it works from|live this turn only/i.test(t)),
    "the Fake Out mechanic is NOT restated on every lead");
  check(readLeads(s).some((p) => p.kind === "fakeOut" && p.probability > 0.5),
    "  but their Fake Out is still reported, with its probability");

  // And nothing turn-1-only is claimed once the turn has passed.
  const later = reduce(s, { type: "NEXT_TURN" });
  check(openingRead(later).turnOneOnly.length === 0,
    "  and nothing turn-1-only is claimed after turn 1");

  // My own Fake Out is surfaced only when there is something specific to stop,
  // and it NAMES that thing - which is the part you cannot see at a glance.
  const withFO = board(["farigiraf", "sinistcha"], ["Raichu", "Sylveon"]);
  const mineFO = openingRead(withFO).turnOneOnly.filter((t) => /Fake Out stops/.test(t));
  check(mineFO.length > 0 && /Farigiraf/.test(mineFO[0]),
    `my Fake Out is offered against the setter by name: "${mineFO[0] ?? ""}"`);

  // With nothing to deny, it stays quiet rather than reminding me I own the move.
  const noSetup = board(["garchomp"], ["Raichu", "Sylveon"]);
  check(!openingRead(noSetup).turnOneOnly.some((t) => /Fake Out stops/.test(t)),
    "  and stays silent when they have no setup to deny");
}

// ===========================================================================
console.log("\n-- every plan comes with what beats it --");
{
  const all = [
    ...readLeads(board(["whimsicott", "incineroar"], ["Staraptor", "Arcanine"])),
    ...readLeads(board(["farigiraf", "sinistcha"], ["Raichu", "Sylveon"])),
    ...readLeads(board(["charizard-y", "garchomp"], ["Arcanine", "Sylveon"])),
  ];
  const setup = all.filter((p) => ["tailwind", "trickRoom", "screens", "weather"].includes(p.kind));
  check(setup.length > 0 && setup.every((p) => p.counter),
    `all ${setup.length} setup reads name a counter, not just a warning`);

  const tr = all.find((p) => p.kind === "trickRoom");
  check(/-7 priority/.test(tr.counter),
    "the Trick Room counter explains WHY denial works (it is -7 priority)");
}

// ===========================================================================
// THE FAKE OUT IS TWO BRANCHES, NOT ONE GUESS.
//
// "Either he fakes out that one and goes on, or he fakes out the other one."
// Both are concretely different game states and both matter. What decides which
// he picks is not a heuristic about YOUR side - it is what stopping each of
// your Pokemon is worth to HIM. If your Arcanine would otherwise KO the thing
// in front of it, flinching Arcanine is the call.
// ===========================================================================
console.log("\n-- both Fake Out branches are simulated --");
{
  let s = board(["incineroar", "whimsicott"], ["Staraptor", "Arcanine"]);
  const reads = fakeOutReads(s, moveProbability);
  check(reads.length === 1, `one Fake Out read for their Incineroar (${reads.length})`);
  const r = reads[0];

  check(r.branches.length === 2,
    `BOTH of my actives are scored as targets, not one guessed at (${r.branches.length})`);
  for (const b of r.branches) {
    console.log(`      into ${nameOf(b.target)}: ${b.cost} | score ${Math.round(b.score)} | ` +
      `Protect ${Math.round(b.protectChance * 100)}%`);
  }

  // Worst-for-me first: that is the branch they should take.
  check(r.branches[0].score <= r.branches[1].score,
    "branches are ordered worst-for-me first");
  check(r.theirBest === r.branches[0], "  and that is what it calls their best");

  // The load-bearing claim: it picks on what the flinch COSTS, and a lost KO
  // is the expensive kind of cost.
  const losesKO = r.branches.find((b) => /loses the KO/.test(b.cost));
  if (losesKO) {
    check(r.theirBest === losesKO,
      `the branch that costs a KO is the one to expect (${nameOf(losesKO.target)})`);
    check(losesKO.score < r.branches[1].score,
      "  and it genuinely scores worse for me, from the simulator");
  }
  console.log("      READ:", r.text);
  check(/costs you most|is a guess/.test(r.text),
    "the text either names the expected target or admits it is a guess");

  // Every branch reports what it denies, so the cost is inspectable.
  check(r.branches.every((b) => b.deniedMove !== null || /nothing queued/.test(b.cost)),
    "each branch names the move the flinch takes away");
}

// ===========================================================================
console.log("\n-- a close call is reported as a guess, not a read --");
{
  // Two attackers with nothing to choose between them.
  const s = board(["incineroar", "whimsicott"], ["Raichu", "Sylveon"]);
  const r = fakeOutReads(s, moveProbability)[0];
  if (r && r.closeCall) {
    check(/is a guess/.test(r.text),
      "when the branches are close it says so rather than inventing a read");
    check(!/costs you most/.test(r.text),
      "  and does NOT claim to know which one they will pick");
  } else {
    check(r && /costs you most/.test(r.text),
      "with a clear gap it names the expected target");
  }
}

// ===========================================================================
// Armor Tail blanks it entirely - there is no call to make.
// ===========================================================================
console.log("\n-- a Fake Out that cannot land is not a decision --");
{
  const s = board(["incineroar", "sinistcha"], ["Farigiraf", "Sylveon"]);
  const r = fakeOutReads(s, moveProbability)[0];
  check(r, "their Incineroar still reads as holding Fake Out");
  console.log("      READ:", r.text);

  check(r.blockedBy, `it is blocked side-wide by ${r.blockedBy?.ability}`);
  check(r.branches.length === 0,
    "no branches are offered - there is nothing to choose between");
  check(/cannot land on either of you/.test(r.text),
    "  and the text says it cannot land at all");
  check(/Do not spend a Protect/.test(r.text),
    "  and tells you not to waste a Protect on it - the whole point");
  check(!/is a guess/.test(r.text),
    "  it never calls a blocked Fake Out a coinflip");

  // Without the Armor Tail holder, the same board DOES present a real call.
  const without = board(["incineroar", "sinistcha"], ["Raichu", "Sylveon"]);
  const r2 = fakeOutReads(without, moveProbability)[0];
  check(r2 && !r2.blockedBy && r2.branches.length === 2,
    "swap Farigiraf out and the Fake Out is a live two-branch decision again");
}

// ===========================================================================
// LEAD SCORING: a different question from the bring-four.
//
// "Who beats their six over a game" and "who wins turn one" pull in different
// directions. A Pokemon can be the best answer on the team and a poor lead, and
// the reverse is more common - Incineroar leads on Intimidate and Fake Out
// while winning almost no 1v1s. Scoring leads with the answer matrix would
// recommend attackers every time, which is the complaint that prompted this.
// ===========================================================================
console.log("\n-- Intimidate is worth what their team is made of --");
{
  const physical = board(["garchomp", "incineroar", "basculegion", "whimsicott", "sinistcha", "aerodactyl"], []);
  const special = board(["charizard-y", "sinistcha", "whimsicott", "floette-eternal", "gholdengo", "pelipper"], []);

  const pShare = physicalShare(physical);
  const sShare = physicalShare(special);
  console.log(`      physical team: ${Math.round(pShare * 100)}% physical | special team: ${Math.round(sShare * 100)}%`);
  check(pShare > 0.6, "a Garchomp/Incineroar/Basculegion side reads as mostly physical");
  check(sShare < 0.25, "a Charizard-Y/Gholdengo/Pelipper side reads as mostly special");

  const mineOf = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  const starP = physical.mons[mineOf(physical, "Staraptor").uid];
  const starS = special.mons[mineOf(special, "Staraptor").uid];
  check(activeProfile(starP).ability === "Intimidate",
    "base Staraptor has Intimidate (the Mega has Contrary instead)");

  const intoPhys = scoreLeadPair(physical, starP, physical.mons[mineOf(physical, "Arcanine").uid]);
  const intoSpec = scoreLeadPair(special, starS, special.mons[mineOf(special, "Arcanine").uid]);
  const factor = (r) => r.factors.find((f) => f.kind === "intimidate");
  console.log(`      Intimidate scores ${factor(intoPhys)?.points} into physical, ${factor(intoSpec)?.points} into special`);
  check(factor(intoPhys).points > factor(intoSpec).points * 2,
    "Intimidate is worth far more into a physical side than a special one");
  check(/worth much less than usual/.test(factor(intoSpec).text),
    "  and it SAYS so against a special side rather than quietly scoring low");
}

// ===========================================================================
console.log("\n-- leading Intimidate into Defiant is a liability --");
{
  const mineOf = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  const withDefiant = board(["garchomp", "kingambit", "incineroar", "basculegion", "whimsicott", "sinistcha"], []);
  const without = board(["garchomp", "incineroar", "basculegion", "whimsicott", "sinistcha", "aerodactyl"], []);

  const a = scoreLeadPair(withDefiant, withDefiant.mons[mineOf(withDefiant, "Staraptor").uid], withDefiant.mons[mineOf(withDefiant, "Arcanine").uid]);
  const b = scoreLeadPair(without, without.mons[mineOf(without, "Staraptor").uid], without.mons[mineOf(without, "Arcanine").uid]);

  const liability = a.factors.find((f) => f.kind === "liability");
  check(liability && liability.points < 0,
    `a Defiant Kingambit on their side is scored as a liability (${liability?.points})`);
  check(/makes them STRONGER/.test(liability.text),
    `  and says why: "${liability.text.slice(-46)}"`);
  check(a.score < b.score,
    `the same lead scores lower into a Defiant team (${a.score} vs ${b.score})`);
  check(!b.factors.some((f) => f.kind === "liability"),
    "  and no liability is claimed when nothing on their side has Defiant");
}

// ===========================================================================
console.log("\n-- a lead is scored on turn one, not on winning 1v1s --");
{
  const s = board(["charizard-y", "garchomp", "incineroar", "kingambit", "whimsicott", "basculegion"], []);
  const leads = suggestLeads(s);
  check(leads.length > 0, `${leads.length} lead pairs scored`);
  check(leads.every((l, i, arr) => i === 0 || arr[i - 1].score >= l.score),
    "they come back ranked");

  // Every factor has to be one of the things a LEAD does, not a damage race.
  const kinds = new Set(leads.flatMap((l) => l.factors.map((f) => f.kind)));
  console.log("      factors in play:", [...kinds].join(", "));
  check(kinds.has("survives"),
    "surviving turn one is scored - a lead that dies has contributed nothing");
  check(kinds.has("fakeOut") || kinds.has("speedControl") || kinds.has("intimidate"),
    "  and at least one genuinely lead-shaped factor is present");

  // Fake Out only counts because it is turn one. If their side blanks priority,
  // it is worth nothing and must not be counted.
  const guarded = board(["farigiraf", "garchomp", "incineroar", "kingambit", "whimsicott", "basculegion"], []);
  const mineOf = (st, n) => Object.values(st.mons).find((m) => m.side === "me" && m.set.speciesId === n);
  const withFO = scoreLeadPair(guarded, guarded.mons[mineOf(guarded, "Raichu").uid], guarded.mons[mineOf(guarded, "Arcanine").uid]);
  const foFactor = withFO.factors.find((f) => /Fake Out/.test(f.text));
  check(foFactor && foFactor.points === 0,
    "Fake Out scores ZERO when their side blanks the priority bracket");

  // And restricted to the four I am bringing - suggesting a lead you cannot
  // legally send out is worse than saying nothing.
  const four = Object.values(s.mons).filter((m) => m.side === "me").slice(0, 4);
  const restricted = suggestLeads(s, four);
  const allowed = new Set(four.map((m) => m.uid));
  check(restricted.every((l) => l.pair.every((m) => allowed.has(m.uid))),
    "every suggested lead comes from the four being brought");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
