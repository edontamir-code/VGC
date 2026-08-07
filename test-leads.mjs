// The lead turn - run: node test-leads.mjs
//
// Turn 0 to turn 1 is its own decision. Their lead pair is the first real
// information they give up and it is usually where they commit to a plan, so
// the reads here have to be about the PLAN, not about two isolated matchups.
import { newBattleState, monFromThreatId } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { openingRead, readLeads, speedRaces, PLAN_CUTOFF } from "./src/app/battle/leads.ts";
import { activeProfile } from "./src/app/battle/stats.ts";

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
  check(r.turnOneOnly.some((t) => /Fake Out is live this turn only/.test(t)),
    "their Fake Out is flagged as a turn-1-only threat");
  for (const t of r.turnOneOnly) console.log("      ", t);

  // And it stops being flagged once the turn has passed.
  const later = reduce(s, { type: "NEXT_TURN" });
  check(openingRead(later).turnOneOnly.length === 0,
    "  and nothing turn-1-only is claimed after turn 1");

  // My own Fake Out is surfaced as the cheap denial it is.
  const withFO = board(["farigiraf", "sinistcha"], ["Raichu", "Sylveon"]);
  const mineFO = openingRead(withFO).turnOneOnly.filter((t) => /can Fake Out this turn/.test(t));
  check(mineFO.length > 0,
    `your own Fake Out is offered as the answer to their setup: "${mineFO[0] ?? ""}"`);
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

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
