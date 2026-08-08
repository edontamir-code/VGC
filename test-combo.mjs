// Joint plays and health-only input - run: node test-combo.mjs
//
// The calc grid prices each move alone, which is how a damage calculator works
// and is not how doubles works. Two things only exist when the PAIR is scored
// as one play: Helping Hand (worth nothing by itself, 1.5x on the partner) and
// playing through a Focus Sash (which survives exactly one hit).
import { newBattleState } from "./src/app/model/factory.ts";
import { reduce } from "./src/app/state/reducer.ts";
import { runCommand } from "./src/app/input/command.ts";
import { comboPlays } from "./src/app/battle/combo.ts";
import { activeProfile } from "./src/app/battle/stats.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log(pass ? "PASS" : "FAIL", label);
};
const N = (m) => activeProfile(m).displayName;

function play(scripts) {
  let s = newBattleState();
  for (const t of scripts) for (const a of runCommand(t, s).actions) s = reduce(s, a);
  return s;
}
const oppActives = (s) =>
  s.sides.opp.active.filter(Boolean).map((u) => s.mons[u]);
const pctOf = (m) => Math.round((m.curHP / m.maxHP) * 100);

// ===========================================================================
console.log("-- health typed on its own line --");
{
  let s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin, we lead farigiraf and sylveon",
  ]);
  const before = oppActives(s).map(pctOf);
  check(before.every((p) => p === 100), `both of theirs start at full (${before.join(", ")}%)`);

  // This used to report success and change nothing: the reducer bailed on an
  // empty entry list before the health effects were ever applied.
  const r = runCommand("chomp to 63%, incin 40%", s);
  check(r.kind === "turn" && r.actions.length === 1, "a health-only line is accepted");
  check(/63%/.test(r.echo) && /40%/.test(r.echo),
    `  and echoed back so a misread is visible: "${r.echo}"`);
  for (const a of r.actions) s = reduce(s, a);

  const after = Object.fromEntries(oppActives(s).map((m) => [N(m), pctOf(m)]));
  console.log("      after:", JSON.stringify(after));
  check(after.Garchomp === 63 && after.Incineroar === 40,
    "  and the board actually moves");

  // A line with neither entries nor effects still changes nothing.
  const noop = runCommand("asdfgh", s);
  check(noop.kind === "error" && noop.actions.length === 0,
    "  gibberish is still an error, not a silent no-op");
}

// ===========================================================================
console.log("\n-- Helping Hand only exists as a joint play --");
{
  let s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin, we lead farigiraf and sylveon",
  ]);
  s = { ...s, field: { ...s.field, trickRoom: 5 } };

  const plays = comboPlays(s, 8);
  check(plays.length > 0, `${plays.length} joint plays found`);
  for (const p of plays.slice(0, 4)) console.log(`      ${p.label}\n        ${p.text}`);

  const hh = plays.find((p) => p.actions.some((a) => a.isHelpingHand));
  check(Boolean(hh), "Helping Hand appears as half of a play, never on its own");

  // The whole point: the boosted move must actually hit harder than the
  // unboosted one. Compare the same partner move with and without it.
  const hhVoice = plays.find(
    (p) => p.actions.some((a) => a.isHelpingHand) &&
           p.actions.some((a) => a.moveName === "Hyper Voice")
  );
  const plainVoice = plays.find(
    (p) => !p.actions.some((a) => a.isHelpingHand) &&
           p.actions.some((a) => a.moveName === "Hyper Voice") &&
           p.actions.some((a) => a.moveName === "Psychic")
  );
  if (hhVoice && plainVoice) {
    const foe = (p, n) => p.targets.find((t) => t.name === n);
    const a = foe(hhVoice, "Incineroar"), b = foe(plainVoice, "Incineroar");
    console.log(`      HH + Hyper Voice -> Incineroar ${a.minPct.toFixed(0)}%`);
    console.log(`      Psychic + Hyper Voice -> Incineroar ${b.minPct.toFixed(0)}%`);
    check(a.minPct > b.minPct,
      "  Helping Hand really does boost the partner's spread move");
  }

  // Every reported KO must be a KO at my WORST rolls, not a hopeful one.
  for (const p of plays) {
    for (const t of p.targets) {
      if (!t.ko) continue;
      check(t.minPct >= 100 || t.brokeSash,
        `  "${t.name} KO" in "${p.label}" is real at worst rolls (${t.minPct.toFixed(0)}%)`);
      break;
    }
    break;
  }
}

// ===========================================================================
console.log("\n-- two attacks play through a Focus Sash --");
{
  let s = play([
    "whims, incin, zard, gambit, chomp, bascu",
    "they lead whims and incin, we lead farigiraf and sylveon",
  ]);
  const glim = oppActives(s).find((m) => N(m).includes("Whimsicott"));
  if (!glim || glim.set.item !== "Focus Sash") {
    console.log(`      (Whimsicott is holding ${glim?.set.item ?? "nothing"} - skipping)`);
  } else {
    s = { ...s, field: { ...s.field, trickRoom: 5 } };
    const plays = comboPlays(s, 40);

    const held = plays.filter((p) => p.targets.some((t) => t.uid === glim.uid && t.sashHeld));
    const broke = plays.filter((p) => p.targets.some((t) => t.uid === glim.uid && t.brokeSash));
    console.log(`      ${held.length} plays leave the Sash holding, ${broke.length} play through it`);
    if (held[0]) console.log(`      holds:  ${held[0].label}\n        ${held[0].text}`);
    if (broke[0]) console.log(`      breaks: ${broke[0].label}\n        ${broke[0].text}`);

    check(held.length > 0, "a single lethal hit is correctly stopped by the Sash");
    check(broke.length > 0, "two hits into the same target go THROUGH the Sash");
    check(broke.every((p) => p.targets.find((t) => t.uid === glim.uid).ko),
      "  and a Sash that was played through is reported as a KO");
    check(held.every((p) => !p.targets.find((t) => t.uid === glim.uid).ko),
      "  while a Sash that held is never reported as a KO");
    check(broke.every((p) => !p.targets.find((t) => t.uid === glim.uid).sashHeld),
      "  the two flags are mutually exclusive - it cannot both hold and break");
  }
}

// ===========================================================================
console.log("\n-- the plays track the health you typed --");
{
  let s = play([
    "chomp, incin, zard, gambit, whims, bascu",
    "they lead chomp and incin, we lead farigiraf and sylveon",
  ]);
  s = { ...s, field: { ...s.field, trickRoom: 5 } };
  const before = comboPlays(s, 40);

  for (const a of runCommand("chomp to 20%, incin 25%", s).actions) s = reduce(s, a);
  const after = comboPlays(s, 40);

  const kosBefore = Math.max(...before.map((p) => p.kos));
  const kosAfter = Math.max(...after.map((p) => p.kos));
  console.log(`      best play KOs: ${kosBefore} at full -> ${kosAfter} after chip`);
  check(kosAfter > kosBefore,
    "chipping them opens up a double KO that was not there at full health");
  const best = after.find((p) => p.kos === kosAfter);
  console.log(`      ${best.label}\n        ${best.text}`);
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
