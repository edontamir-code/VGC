// Live damage calc grid + exact field readout.
//
// Covers three mechanics that were silently wrong or missing:
//   - Mega Charizard Y put the sun up on SWITCH-IN, before it had Drought
//   - Light Clay never extended screens past 5 turns
//   - nothing showed every move into every target under the real field
import { legacyBattle, legacyThreat } from "./test-fixture.mjs";
import { reduce } from "./src/app/state/reducer.ts";
import { simulateTurn } from "./src/app/sim/turn.ts";
import { calcGrid, byBoardImpact } from "./src/app/battle/calcGrid.ts";
import { fieldRead, screenLength } from "./src/app/battle/fieldRead.ts";

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  PASS", m); } else { fail++; console.log("  FAIL " + m); } };

const mineNamed = (s, n) =>
  Object.values(s.mons).find((m) => m.side === "me" && m.set.name.includes(n));
const oppNamed = (s, n) =>
  Object.values(s.mons).find((m) => m.side === "opp" && m.set.name.includes(n));

function boardWith(threatIds) {
  let s = legacyBattle();
  for (const id of threatIds) s = reduce(s, { type: "ADD_MON", side: "opp", mon: legacyThreat(id) });
  return s;
}
const sendMe = (s, name, slot) =>
  reduce(s, { type: "SWITCH_IN", side: "me", slot, uid: mineNamed(s, name).uid });
const sendOpp = (s, name, slot) =>
  reduce(s, { type: "SWITCH_IN", side: "opp", slot, uid: oppNamed(s, name).uid });

// ===========================================================================
console.log("\n=== 1. Mega weather is gated on actually Mega Evolving ===");
{
  let s = boardWith(["charizard-y", "garchomp"]);
  s = sendOpp(s, "Charizard", 0);
  s = sendOpp(s, "Garchomp", 1);
  s = sendMe(s, "Delphox", 0);
  s = sendMe(s, "Staraptor", 1);

  const zard = oppNamed(s, "Charizard");
  console.log("  Charizard set:", zard.set.name, "| setsWeather:", zard.set.setsWeather);
  console.log("  weather after switch-in:", s.field.weather?.kind ?? "none");
  ok(s.field.weather === null, "un-Mega'd Charizard does NOT put the sun up on switch-in");

  // Now let it Mega and confirm the sun arrives.
  const r = simulateTurn(s, { [zard.uid]: { kind: "move", moveName: "Heat Wave", mega: true } },
    { roll: "min", perspective: "opp" });
  console.log("  weather after it Megas:", r.state.field.weather?.kind ?? "none",
    r.state.field.weather ? `(${r.state.field.weather.turnsLeft} turns)` : "");
  const megaEvent = r.events.find((e) => /set sun/i.test(e.text));
  ok(r.state.field.weather?.kind === "sun", "Mega Charizard Y sets sun the turn it Megas");
  ok(!!megaEvent, "and the log says so: " + (megaEvent?.text ?? "-"));
}

// ===========================================================================
console.log("\n=== 2. Light Clay: 5 turns vs 8 ===");
{
  const s = legacyBattle();
  const a = screenLength({ set: { item: "Light Clay" } }, s);
  const b = screenLength({ set: { item: "Sitrus Berry" } }, s);
  const c = screenLength({ set: { item: null } }, s);
  console.log(`  Light Clay -> ${a.turns} (${a.because})`);
  console.log(`  Sitrus     -> ${b.turns} (${b.because})`);
  console.log(`  unknown    -> ${c.turns}, alt ${c.alternative} (${c.because})`);
  ok(a.turns === 8, "Light Clay screens last 8");
  ok(b.turns === 5, "a known non-Clay item -> 5");
  ok(c.alternative === 8, "unknown item keeps 8 live as the alternative");
}

// ===========================================================================
console.log("\n=== 3. A screen set by a Light Clay holder actually lasts 8 in the sim ===");
{
  let s = boardWith(["grimmsnarl"]);
  const g = oppNamed(s, "Grimmsnarl");
  if (!g) {
    console.log("  (no Grimmsnarl in the legacy set - skipping)");
  } else {
    s = sendOpp(s, "Grimmsnarl", 0);
    s = sendMe(s, "Delphox", 0);
    console.log("  Grimmsnarl item:", g.set.item);
    const move = g.set.moves.find((m) => /Reflect|Light Screen/.test(m)) ?? "Reflect";
    const r = simulateTurn(s, { [g.uid]: { kind: "move", moveName: move } },
      { roll: "min", perspective: "opp" });
    const sc = r.state.field.screens.opp;
    const up = sc.reflect || sc.lightScreen || sc.auroraVeil;
    console.log(`  after ${move}: ${up} turns left (ticked once already)`);
    const expected = g.set.item === "Light Clay" ? 7 : 4;
    ok(up === expected, `${move} from a ${g.set.item ?? "no item"} holder -> ${expected} after the tick`);
  }
}

// ===========================================================================
console.log("\n=== 4. Field readout names every condition and whose it is ===");
{
  let s = boardWith(["charizard-y", "garchomp"]);
  s = sendOpp(s, "Charizard", 0);
  s = sendMe(s, "Delphox", 0);
  s = { ...s, field: { ...s.field,
    weather: { kind: "sun", turnsLeft: 3 },
    trickRoom: 2,
    tailwind: { me: 4, opp: 0 },
    screens: { me: { reflect: 0, lightScreen: 0, auroraVeil: 0 },
               opp: { reflect: 8, lightScreen: 0, auroraVeil: 0 } } } };
  const raichu = mineNamed(s, "Delphox");
  s = { ...s, mons: { ...s.mons,
    [raichu.uid]: { ...s.mons[raichu.uid], stages: { ...raichu.stages, atk: -1, spe: 2 } } } };

  const r = fieldRead(s);
  for (const l of r.lines) {
    console.log(`  ${l.label.padEnd(22)} ${String(l.turnsLeft).padStart(2)}t` +
      `${l.expiringSoon ? "  EXPIRING" : "         "}  ${l.effect}`);
  }
  for (const st of r.stages) console.log(`  ${st.name}: ${st.parts.join(", ")}`);

  ok(r.lines.some((l) => l.label === "sun"), "sun listed");
  ok(r.lines.some((l) => l.label === "Trick Room" && l.expiringSoon), "Trick Room flagged expiring at 2 turns");
  ok(r.lines.some((l) => l.label.includes("Reflect") && l.label.includes("theirs")), "their Reflect attributed to them");
  ok(r.lines.some((l) => l.label.includes("Tailwind") && l.label.includes("yours")), "my Tailwind attributed to me");
  ok(r.stages.some((x) => x.parts.includes("-1 Atk") && x.parts.includes("+2 Spe")), "stat stages read back exactly");
}

// ===========================================================================
console.log("\n=== 5. The calc grid: every move, every target ===");
{
  let s = boardWith(["charizard-y", "garchomp"]);
  s = sendOpp(s, "Charizard", 0);
  s = sendOpp(s, "Garchomp", 1);
  s = sendMe(s, "Delphox", 0);
  s = sendMe(s, "Staraptor", 1);

  const g = calcGrid(s);
  const rows = [...g.mine].sort(byBoardImpact);
  console.log(`  ${rows.length} of my lines, ${g.theirs.length} of theirs\n`);
  for (const r of rows.slice(0, 14)) {
    const label = `${r.attackerName}${r.mega ? " (MEGA)" : ""}: ${r.moveName}`;
    const cells = r.category === "status"
      ? r.statusEffect
      : r.cells.map((c) => `${c.targetName} ${c.text} ${c.verdict}`).join("   ");
    console.log(`  ${label.padEnd(34)} ${String(r.accuracy).padStart(3)}%  ${cells}`);
  }

  ok(rows.length > 0, "grid produced rows");
  ok(rows.every((r) => r.category === "status" || r.cells.length === 2),
    "every damaging move is priced against BOTH of their actives");

  // The Mega question, priced rather than assumed.
  const megaRows = rows.filter((r) => r.mega);
  const baseRows = rows.filter((r) => !r.mega);
  ok(megaRows.length > 0, "Mega variants are offered as their own lines");

  const fb = baseRows.find((r) => r.moveName === "Focus Blast" && r.attackerName.includes("Raichu"));
  const fbMega = megaRows.find((r) => r.moveName === "Focus Blast");
  if (fb && fbMega) {
    console.log(`\n  Focus Blast base : ${fb.accuracy}% acc, ${fb.cells.map((c) => c.text).join(" / ")}`);
    console.log(`  Focus Blast MEGA : ${fbMega.accuracy}% acc, ${fbMega.cells.map((c) => c.text).join(" / ")}`);
    ok(fbMega.accuracy > fb.accuracy, "No Guard shows up as a real accuracy jump after Mega");
    ok(fbMega.boardMin > fb.boardMin, "and the Mega's SpA shows up as more damage");
  }

  // Spread vs single target on the board total.
  const spread = rows.find((r) => r.spread && r.category !== "status");
  if (spread) {
    console.log(`\n  spread ${spread.moveName}: board total ${Math.round(spread.boardMin)}-${Math.round(spread.boardMax)}% ` +
      `across ${spread.cells.length} targets`);
    ok(spread.boardMin >= Math.max(...spread.cells.map((c) => c.result?.minPct ?? 0)),
      "a spread move's board total adds up across targets, not averaged");
  }

  if (g.assumptions.length) {
    console.log("\n  assuming:");
    for (const a of g.assumptions) console.log("   -", a);
  }
  ok(g.assumptions.length > 0, "the grid says what it is assuming rather than presenting guesses as facts");
}

// ===========================================================================
console.log("\n=== 6. Screens actually move the numbers in the grid ===");
{
  let s = boardWith(["charizard-y", "garchomp"]);
  s = sendOpp(s, "Charizard", 0);
  s = sendOpp(s, "Garchomp", 1);
  s = sendMe(s, "Staraptor", 0);
  s = sendMe(s, "Delphox", 1);

  const before = calcGrid(s).mine.filter((r) => r.category === "phys" && !r.mega);
  const withReflect = { ...s, field: { ...s.field,
    screens: { ...s.field.screens, opp: { reflect: 5, lightScreen: 0, auroraVeil: 0 } } } };
  const after = calcGrid(withReflect).mine.filter((r) => r.category === "phys" && !r.mega);

  const b = before.find((r) => r.cells.some((c) => c.result));
  const a = after.find((r) => r.attackerUid === b.attackerUid && r.moveName === b.moveName);
  const bPct = b.cells[0].result.minPct, aPct = a.cells[0].result.minPct;
  console.log(`  ${b.attackerName} ${b.moveName}: ${bPct.toFixed(1)}% -> ${aPct.toFixed(1)}% behind Reflect`);
  ok(aPct < bPct, "physical damage drops behind Reflect");
  ok(a.modifiers.some((m) => /Reflect/.test(m)), "and the grid names Reflect as the reason: " + a.modifiers.join(", "));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
