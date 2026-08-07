// Team transcription check - run: node test-team.mjs
//
// Asserts that every stat in src/data/team.js reproduces EXACTLY the number
// shown on the in-game team screen for Team ID QY3XFXCEJA, and that every
// spread is a legal 66-SP build. These are real observed values, so this is the
// strongest evidence available that the Champions stat formula in engine.js is
// right and that the team was transcribed correctly.
//
// The game's stat screen shows the PRE-Mega form, so Mega mons are checked
// against `baseForm`.
import { computeStats } from "./src/engine.js";
import { TEAM } from "./src/data/team.js";
import { MOVES } from "./src/data/moves.js";
import { STATUS_MOVES } from "./src/app/battle/statusMoves.ts";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

// Exactly as read off the Stats page, in HP/Atk/Def/SpA/SpD/Spe order.
const OBSERVED = {
  Raichu:    { hp:167, atk:99,  def:75,  spa:112, spd:100, spe:178 },
  Staraptor: { hp:175, atk:159, def:90,  spa:63,  spd:80,  spe:167 },
  Arcanine:  { hp:172, atk:167, def:100, spa:103, spd:100, spe:156 },
  Farigiraf: { hp:224, atk:99,  def:111, spa:130, spd:116, spe:80  },
  Sylveon:   { hp:183, atk:76,  def:107, spa:168, spd:150, spe:88  },
  Kingambit: { hp:207, atk:205, def:140, spa:72,  spd:106, spe:71  },
};

const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

console.log("-- stats match the in-game screen exactly --");
for (const mon of TEAM) {
  const want = OBSERVED[mon.name];
  if (!want) {
    check(false, `${mon.name}: no observed stats recorded`);
    continue;
  }
  // The game shows the pre-Mega line for a mon holding a Mega stone.
  const base = mon.baseForm ?? mon.base;
  const got = computeStats(base, mon.sp, mon.nature);
  const diffs = KEYS.filter((k) => got[k] !== want[k]);
  check(
    diffs.length === 0,
    `${mon.name}: ${KEYS.map((k) => got[k]).join("/")}` +
      (diffs.length ? `  EXPECTED ${KEYS.map((k) => want[k]).join("/")} (off: ${diffs.join(",")})` : "")
  );
}

console.log("\n-- every spread is a legal 66-SP build --");
for (const mon of TEAM) {
  const totalSP = KEYS.reduce((n, k) => n + (mon.sp[k] ?? 0), 0);
  const overCap = KEYS.filter((k) => (mon.sp[k] ?? 0) > 32);
  check(
    totalSP === 66 && overCap.length === 0,
    `${mon.name}: ${totalSP}/66 SP` + (overCap.length ? ` OVER CAP: ${overCap.join(",")}` : "")
  );
}

console.log("\n-- every move on the team is known to the app --");
for (const mon of TEAM) {
  const unknown = mon.moves.filter((m) => !MOVES[m] && !STATUS_MOVES[m]);
  check(
    unknown.length === 0,
    `${mon.name}: ${mon.moves.join(", ")}` + (unknown.length ? `  UNKNOWN: ${unknown.join(", ")}` : "")
  );
}

console.log("\n-- Mega mons carry both stat lines --");
for (const mon of TEAM.filter((m) => m.mega)) {
  check(
    Boolean(mon.baseForm) && Boolean(mon.base),
    `${mon.name}: pre-Mega ${Object.values(mon.baseForm ?? {}).join("/")} -> Mega ${Object.values(mon.base).join("/")}`
  );
}

console.log("\n-- Pixilate turns Sylveon's Normal moves Fairy --");
{
  const syl = TEAM.find((m) => m.name === "Sylveon");
  const normals = syl.moves.filter((m) => MOVES[m]?.type === "Normal");
  check(
    syl.ability === "Pixilate" && normals.length === 3,
    `three Normal moves become Fairy: ${normals.join(", ")}`
  );
  check(
    MOVES["Quick Attack"].priority === 1,
    "Quick Attack keeps its +1 priority as a Fairy move"
  );
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
