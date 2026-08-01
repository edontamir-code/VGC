// Regression tests — run: node test.mjs
// Numbers here are the VERIFIED values from BUILD_BRIEF.md. Do not adjust them to
// make a change pass; if one breaks, the engine change is wrong.
import { computeStats, matchup } from "./src/engine.js";
import { effectiveSpeed, faster } from "./src/speed.js";
import { TEAM } from "./src/data/team.js";
import { THREATS } from "./src/data/threats.js";
import { MOVES, movePower } from "./src/data/moves.js";

const D = n => TEAM.find(x=>x.name===n);
const T = i => THREATS.find(x=>x.id===i);
const M = n => { const m={...MOVES[n],name:n}; m.power=movePower(m,{faintedAllies:3}); return m; };

let ok=0, total=0;
const check = (pass, label) => { total++; if(pass) ok++; console.log((pass?"PASS":"FAIL"), label); };

// --- damage engine ---
const cases = [
  ["Kingambit","sneasler","Close Combat",{},220.3,4],
  ["Kingambit","charizard-y","Heat Wave",{weather:"sun"},144.9,2],
  ["Delphox","basculegion","Wave Crash",{},272.8,2],
  ["Garchomp","sylveon","Hyper Voice",{},121.6,2],
  ["Staraptor","sylveon","Hyper Voice",{},108.4,2],
  ["Delphox","garchomp","Earthquake",{},0,0],
];
console.log("-- damage --");
for (const [d,t,mv,f,epct,etm] of cases){
  const r=matchup(T(t),D(d),M(mv),f);
  check(Math.abs(r.maxPct-epct)<0.2 && r.typeMult===etm,
        `${d} <- ${t} ${mv}: ${r.maxPct}% x${r.typeMult}`);
}

// --- speed engine ---
const chomp = { spe: computeStats(D("Garchomp").base, D("Garchomp").sp, D("Garchomp").nature).spe, side:"me" };
const bascu = { spe: computeStats(T("basculegion").base, T("basculegion").sp, T("basculegion").nature).spe, side:"opp", item:"Choice Scarf" };
console.log("\n-- speed --");
check(effectiveSpeed(bascu,{})===195, `Scarf Basculegion Spe = ${effectiveSpeed(bascu,{})} (exp 195)`);
check(faster(chomp,bascu,{}).first==="b", "Garchomp is slower than Scarf Basculegion");
check(faster({...chomp},bascu,{tailwind:["me"]}).first==="a", "Garchomp+Tailwind outspeeds it");
check(faster(chomp,bascu,{trickRoom:true}).first==="a", "Under Trick Room Garchomp moves first");

console.log(`\n${ok}/${total} passed`);
process.exit(ok===total?0:1);
