// Redirection, ability modifiers and Mega rules - run: node test-abilities.mjs
import { newBattleState, monFromThreatId, setFromThreat } from "./src/app/model/factory.ts";
import { legacyBattle } from "./test-fixture.mjs";
import { reduce, makeMonState } from "./src/app/state/reducer.ts";
import { THREATS } from "./src/data/threats.js";
import { simulateTurn } from "./src/app/sim/turn.ts";
import { resolveMatchup } from "./src/app/battle/damage.ts";
import { battleStats, rawStats, stagedStats } from "./src/app/battle/stats.ts";
import { leadRisks } from "./src/app/battle/leadRisk.ts";
import { canMega, megaRead, holdsMegaStone } from "./src/app/battle/mega.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const mine = (s, n) => Object.values(s.mons).find((m) => m.side === "me" && m.set.speciesId === n);
const opp = (s, id) => Object.values(s.mons).find((m) => m.side === "opp" && m.set.speciesId === id);

function board(oppIds, actives) {
  let s = legacyBattle();
  for (const id of oppIds) s = reduce(s, { type: "ADD_MON", side: "opp", mon: monFromThreatId(id) });
  actives.forEach((n, slot) => {
    const m = mine(s, n);
    if (m) s = reduce(s, { type: "SWITCH_IN", side: "me", slot, uid: m.uid });
  });
  return s;
}
const WORST = { roll: "worstForMe", tie: "them" };

// ===========================================================================
console.log("-- redirection: the Close Combat case --");
{
  // Sinistcha (Grass/GHOST) + Charizard Y. Mega Staraptor's Close Combat would
  // hurt Charizard, but Rage Powder pulls it onto the Ghost, where Fighting
  // does literally nothing.
  let s = board(["sinistcha", "charizard-y"], ["Staraptor", "Garchomp"]);
  const star = mine(s, "Staraptor");
  const sin = opp(s, "sinistcha");
  const zard = opp(s, "charizard-y");

  const direct = resolveMatchup(s.mons[star.uid], s.mons[zard.uid], "Close Combat", s);
  check(direct.max > 0, `Close Combat into Charizard Y would do ${direct.min}-${direct.max}`);
  const onGhost = resolveMatchup(s.mons[star.uid], s.mons[sin.uid], "Close Combat", s);
  check(onGhost.typeMult === 0, "Close Combat into Sinistcha is a straight immunity (Ghost)");

  const r = simulateTurn(s, {
    [sin.uid]: { kind: "move", moveName: "Rage Powder" },
    [star.uid]: { kind: "move", moveName: "Close Combat", targetUid: zard.uid },
  }, WORST);

  check(r.events.some((e) => e.text.includes("redirected")),
    "the attack is redirected, and the log says so");
  check(r.state.mons[zard.uid].curHP === zard.maxHP,
    "Charizard Y takes nothing - the KO never happened");
  check(r.state.mons[sin.uid].curHP === sin.maxHP,
    "and Sinistcha takes nothing either, because it is immune");

  // Spread moves ignore redirection entirely.
  const chomp = mine(s, "Garchomp");
  const spread = simulateTurn(s, {
    [sin.uid]: { kind: "move", moveName: "Rage Powder" },
    [chomp.uid]: { kind: "move", moveName: "Rock Slide" },
  }, WORST);
  check(spread.state.mons[zard.uid].curHP < zard.maxHP,
    "a SPREAD move still hits Charizard Y through Rage Powder");
  check(!spread.events.some((e) => e.text.includes("redirected")),
    "  and is not reported as redirected");

  // The Lines panel must warn about it.
  check(leadRisks(s).some((x) => x.kind === "redirect"),
    "the risk panel warns that single-target attacks will be pulled");
}

// ===========================================================================
console.log("\n-- ability redirection --");
{
  let s = board(["raichu", "charizard-y"], ["Glimmora", "Garchomp"]);
  const glim = mine(s, "Glimmora");
  const raichu = opp(s, "raichu");
  const zard = opp(s, "charizard-y");
  // Raichu only has Lightning Rod BEFORE it Megas - Mega Raichu Y has No Guard.
  // Drop it to the base form so the redirection ability is actually live.
  s = reduce(s, { type: "TOGGLE_MEGA", uid: raichu.uid });
  // Lightning Rod pulls Electric moves even with no Rage Powder in play.
  s = reduce(s, { type: "EDIT_SET", uid: glim.uid, patch: { moves: ["Thunderbolt", "Power Gem", "Sludge Bomb", "Earth Power"] } });
  const r = simulateTurn(s, {
    [glim.uid]: { kind: "move", moveName: "Thunderbolt", targetUid: zard.uid },
  }, WORST);
  check(r.events.some((e) => e.text.includes("redirected") && e.text.includes("Raichu")),
    "Lightning Rod pulls the Electric move onto Raichu");
  check(r.state.mons[zard.uid].curHP === zard.maxHP, "  Charizard Y is untouched");

  // A non-Electric move is unaffected.
  const gem = simulateTurn(s, {
    [glim.uid]: { kind: "move", moveName: "Power Gem", targetUid: zard.uid },
  }, WORST);
  check(gem.state.mons[zard.uid].curHP < zard.maxHP,
    "  a Rock move goes where it was aimed");
}

// ===========================================================================
console.log("\n-- Huge Power --");
{
  let s = board(["mawile"], ["Kingambit", "Garchomp"]);
  const maw = opp(s, "mawile");

  const raw = rawStats(s.mons[maw.uid]);
  const staged = stagedStats(s.mons[maw.uid]);
  const battle = battleStats(s.mons[maw.uid], s);
  check(battle.atk === staged.atk * 2,
    `Huge Power doubles Attack: ${staged.atk} -> ${battle.atk}`);
  check(battle.def === staged.def && battle.spa === staged.spa,
    "  and leaves every other stat alone");
  void raw;

  // The damage difference must be real, not cosmetic.
  const gambit = mine(s, "Kingambit");
  const withHP = resolveMatchup(s.mons[maw.uid], s.mons[gambit.uid], "Play Rough", s);
  const noHP = reduce(s, { type: "EDIT_SET", uid: maw.uid, patch: { ability: "Intimidate" } });
  const without = resolveMatchup(noHP.mons[maw.uid], noHP.mons[gambit.uid], "Play Rough", noHP);
  check(withHP.max > without.max * 1.8,
    `Play Rough with Huge Power hits far harder: ${without.max} -> ${withHP.max}`);

  // Pre-Mega Mawile has Intimidate and normal Attack.
  const preMega = reduce(s, { type: "TOGGLE_MEGA", uid: maw.uid });
  check(!preMega.mons[maw.uid].hasMega, "toggled to the pre-Mega form");
  const pre = battleStats(preMega.mons[maw.uid], preMega);
  check(pre.atk < battle.atk,
    `pre-Mega Mawile does NOT have Huge Power (${pre.atk} vs ${battle.atk} Atk)`);
}

// ===========================================================================
console.log("\n-- other ability modifiers --");
{
  let s = board(["incineroar"], ["Kingambit", "Delphox"]);
  const inc = opp(s, "incineroar");
  const delph = mine(s, "Delphox");

  // Delphox has to be the side's Mega for its Mega-form ability to be live at
  // all: un-Mega'd, the active profile comes from the PRE-Mega line and editing
  // set.ability changes an ability that is not on the field.
  s = reduce(s, { type: "SET_MEGA", side: "me", uid: delph.uid });
  check(s.mons[delph.uid].hasMega, "Delphox is the designated Mega for this board");

  const base = resolveMatchup(s.mons[inc.uid], s.mons[delph.uid], "Flare Blitz", s);
  const thick = reduce(s, { type: "EDIT_SET", uid: delph.uid, patch: { ability: "Thick Fat" } });
  const halved = resolveMatchup(thick.mons[inc.uid], thick.mons[delph.uid], "Flare Blitz", thick);
  check(halved.max < base.max,
    `Thick Fat halves the incoming Fire hit (${base.max} -> ${halved.max})`);

  const multi = reduce(s, { type: "EDIT_SET", uid: delph.uid, patch: { ability: "Multiscale" } });
  const full = resolveMatchup(multi.mons[inc.uid], multi.mons[delph.uid], "Flare Blitz", multi);
  check(full.max < base.max, `Multiscale halves it at full HP (${base.max} -> ${full.max})`);
  const hurt = reduce(multi, { type: "SET_HP_PCT", uid: delph.uid, pct: 50 });
  const notFull = resolveMatchup(hurt.mons[inc.uid], hurt.mons[delph.uid], "Flare Blitz", hurt);
  check(notFull.max > full.max, "  but not once it has taken damage");

  // Guts ignores its own burn.
  const burned = reduce(s, { type: "SET_STATUS", uid: inc.uid, status: "brn" });
  const withBurn = resolveMatchup(burned.mons[inc.uid], burned.mons[delph.uid], "Flare Blitz", burned);
  const guts = reduce(burned, { type: "EDIT_SET", uid: inc.uid, patch: { ability: "Guts" } });
  const withGuts = resolveMatchup(guts.mons[inc.uid], guts.mons[delph.uid], "Flare Blitz", guts);
  check(withGuts.max > withBurn.max,
    `Guts ignores the burn and adds 1.5x (${withBurn.max} -> ${withGuts.max})`);
}

// ===========================================================================
console.log("\n-- Mega rules --");
{
  let s = board(["mawile", "metagross"], ["Kingambit", "Garchomp"]);
  const maw = opp(s, "mawile");
  const meta = opp(s, "metagross");

  check(holdsMegaStone(s.mons[maw.uid]) && holdsMegaStone(s.mons[meta.uid]),
    "both are holding Mega stones");

  const read = megaRead(s, "opp");
  check(read.holders.length === 2 && read.text && /usually bring only one/i.test(read.text),
    "the two-stone team-selection read is surfaced");

  // Both start Mega'd by default, so drop one back first.
  let one = reduce(s, { type: "TOGGLE_MEGA", uid: meta.uid });
  check(!one.mons[meta.uid].hasMega, "Metagross reverted to base form");
  const blocked = canMega(one, one.mons[meta.uid]);
  check(!blocked.ok && /already Mega Evolved/i.test(blocked.reason ?? ""),
    `it cannot Mega back while Mawile has: "${blocked.reason}"`);

  const attempt = reduce(one, { type: "TOGGLE_MEGA", uid: meta.uid });
  check(!attempt.mons[meta.uid].hasMega,
    "the reducer refuses the second Mega Evolution");
  check(attempt.log[attempt.log.length - 1].text.includes("cannot Mega Evolve"),
    "  and logs why");

  // Once Mawile drops back, Metagross may Mega.
  let freed = reduce(one, { type: "TOGGLE_MEGA", uid: maw.uid });
  const now = canMega(freed, freed.mons[meta.uid]);
  check(now.ok, "with Mawile un-Mega'd, Metagross can Mega Evolve");
}

// ===========================================================================
console.log("\n-- database integrity --");
{
  const ids = new Set();
  let bad = 0;
  for (const t of THREATS) {
    if (ids.has(t.id)) bad++;
    ids.add(t.id);
    const total = ["hp", "atk", "def", "spa", "spd", "spe"].reduce((n, k) => n + (t.sp[k] ?? 0), 0);
    if (total > 66) {
      bad++;
      console.log(`   OVER BUDGET: ${t.name} uses ${total} SP`);
    }
    for (const k of ["hp", "atk", "def", "spa", "spd", "spe"]) {
      if ((t.sp[k] ?? 0) > 32) { bad++; console.log(`   OVER CAP: ${t.name} ${k}`); }
    }
    if (t.movePool && !t.moves.every((m) => t.movePool.includes(m))) {
      bad++;
      console.log(`   POOL MISSING A SET MOVE: ${t.name}`);
    }
  }
  check(bad === 0, `all ${THREATS.length} threats are legal 66-SP builds with consistent pools`);

  const megas = THREATS.filter((t) => holdsMegaStone(makeMonState(setFromThreat(t), "opp", "threat")));
  check(megas.length > 0, `${megas.length} Mega-stone holders in the database`);
  check(megas.every((t) => t.baseForm),
    "every Mega entry also carries its pre-Mega stat line");
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
