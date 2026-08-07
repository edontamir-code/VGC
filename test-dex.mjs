// Species dex integrity - run: node test-dex.mjs
import { DEX, DEX_SIZE, dexEntry, megaOf, baseFormOf } from "./src/data/dex.js";
import { SPECIES } from "./src/app/model/species.ts";
import { THREATS } from "./src/data/threats.js";
import { TEAM } from "./src/data/team.js";
import { computeStats } from "./src/engine.js";

let ok = 0, total = 0;
const check = (pass, label) => {
  total++;
  if (pass) ok++;
  console.log((pass ? "PASS" : "FAIL"), label);
};

const KEYS = ["hp", "atk", "def", "spa", "spd", "spe"];

console.log("-- the dex --");
check(DEX_SIZE === 310, `310 legal Pokemon (got ${DEX_SIZE})`);

const dupes = DEX.map((d) => d.name).filter((n, i, a) => a.indexOf(n) !== i);
check(dupes.length === 0, `no duplicate names${dupes.length ? ": " + dupes.join(", ") : ""}`);

const badStats = DEX.filter((d) =>
  KEYS.some((k) => !Number.isInteger(d.base[k]) || d.base[k] < 1 || d.base[k] > 260)
);
check(badStats.length === 0,
  `every stat is a sane integer${badStats.length ? " - bad: " + badStats.map((d) => d.name).join(", ") : ""}`);

const badTypes = DEX.filter((d) => d.types.length < 1 || d.types.length > 2 || d.types.some((t) => !t));
check(badTypes.length === 0, "every entry has one or two types");

const megas = DEX.filter((d) => d.name.startsWith("Mega "));
check(megas.length > 40, `${megas.length} Mega forms present`);

console.log("\n-- lookups --");
check(dexEntry("garchomp")?.base.spe === 102, "case-insensitive lookup works");
check(dexEntry("Weavile") !== null, "Weavile IS legal - it is in the dex");
check(dexEntry("Hisuian Arcanine")?.types.join("/") === "Fire/Rock",
  "Hisuian Arcanine is Fire/Rock");
check(megaOf("Raichu")?.name === "Mega Raichu Y", `Raichu Megas into ${megaOf("Raichu")?.name}`);
check(baseFormOf("Mega Raichu Y")?.name === "Raichu", "Mega Raichu Y maps back to Raichu");
check(baseFormOf("Mega Swampert")?.base.atk === 110, "Mega Swampert maps back to base Swampert");

console.log("\n-- the Farigiraf correction --");
{
  const f = dexEntry("Farigiraf");
  check(f.base.spa === 110 && f.base.spd === 70,
    `override applied: SpA ${f.base.spa}, SpD ${f.base.spd} (source said 107/60)`);
  // And it must still reproduce the observed in-game stats.
  const team = TEAM.find((m) => m.name === "Farigiraf");
  const got = computeStats(f.base, team.sp, team.nature);
  check(got.spa === 130 && got.spd === 116,
    `which reproduces the in-game screen: SpA ${got.spa}, SpD ${got.spd}`);
}

console.log("\n-- dex agrees with the curated threat sets --");
{
  let mismatches = 0;
  for (const t of THREATS) {
    const d = dexEntry(t.name);
    if (!d) continue;
    const diff = KEYS.filter((k) => d.base[k] !== t.base[k]);
    if (diff.length) {
      mismatches++;
      console.log(`   ${t.name}: threats.js ${KEYS.map((k) => t.base[k]).join("/")} vs dex ${KEYS.map((k) => d.base[k]).join("/")} (${diff.join(",")})`);
    }
  }
  check(mismatches === 0, "every threat's base stats match the dex");
}

console.log("\n-- the catalogue is searchable --");
{
  check(SPECIES.length >= 300, `${SPECIES.length} species pickable at team preview`);
  const names = new Set(SPECIES.map((s) => s.name.toLowerCase()));
  for (const n of ["Weavile", "Dragapult", "Snorlax", "Mega Gengar", "Toxapex"]) {
    check(names.has(n.toLowerCase()), `  ${n} is pickable`);
  }
  const dupIds = SPECIES.map((s) => s.id).filter((id, i, a) => a.indexOf(id) !== i);
  check(dupIds.length === 0, `no duplicate catalogue ids${dupIds.length ? ": " + dupIds.slice(0, 3).join(", ") : ""}`);
}

console.log("\n-- every catalogue entry builds a legal set --");
{
  let bad = 0;
  for (const s of SPECIES) {
    const set = s.make();
    const spTotal = KEYS.reduce((n, k) => n + (set.sp[k] ?? 0), 0);
    const overCap = KEYS.some((k) => (set.sp[k] ?? 0) > 32);
    if (spTotal > 66 || overCap || !set.base || !set.types.length) {
      bad++;
      if (bad <= 3) console.log(`   BAD: ${s.name} (${spTotal} SP)`);
    }
  }
  check(bad === 0, `all ${SPECIES.length} entries produce a legal 66-SP build`);
}

console.log(`\n${ok}/${total} passed`);
process.exit(ok === total ? 0 : 1);
