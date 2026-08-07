// FROZEN TEST FIXTURE — do not edit, and do not use in the app.
//
// This is the original team the engine's verified numbers in BUILD_BRIEF.md
// were computed against (Team ID G3XYDBBC22). Those numbers — Sneasler Close
// Combat 220.3% into Kingambit, Char-Y Heat Wave 144.9%, and the rest — are the
// project's ground truth for the damage engine, so they must keep being
// asserted against the exact spreads that produced them.
//
// team.js is live user data and changes whenever the team does. Pinning the
// regression tests to that would mean the engine's correctness silently
// depended on which team was being played this week.
export const TEAM = [
  {
    name: "Staraptor", mega: "Mega Staraptor",
    types: ["Fighting","Flying"],
    base:  { hp:85, atk:140, def:100, spa:60, spd:90, spe:110 },
    baseForm: { hp:85, atk:120, def:70, spa:50, spd:60, spe:100 },
    sp:    { hp:31, atk:1, def:0, spa:0, spd:2, spe:32 },
    nature:{ plus:"spe", minus:"spa" },
    item:  "Staraptite", ability:"Contrary",
    immuneTypes: ["Ground"],
    moves: ["Close Combat","Brave Bird","Roost","Protect"],
  },
  {
    name: "Glimmora",
    types: ["Rock","Poison"],
    base:  { hp:83, atk:55, def:90, spa:130, spd:81, spe:86 },
    sp:    { hp:1, atk:0, def:1, spa:32, spd:0, spe:32 },
    nature:{ plus:"spa", minus:"atk" },
    item:  "Focus Sash", ability:"Toxic Debris",
    moves: ["Power Gem","Sludge Bomb","Earth Power","Spiky Shield"],
  },
  {
    name: "Whimsicott",
    types: ["Grass","Fairy"],
    base:  { hp:60, atk:67, def:85, spa:77, spd:75, spe:116 },
    sp:    { hp:28, atk:0, def:32, spa:0, spd:0, spe:6 },
    nature:{ plus:"spe", minus:"atk" },
    item:  "Occa Berry", ability:"Prankster",
    berry: { type:"Fire", superEffOnly:true, mult:0.5 },
    moves: ["Tailwind","Moonblast","Charm","Light Screen"],
  },
  {
    name: "Kingambit",
    types: ["Dark","Steel"],
    base:  { hp:100, atk:135, def:120, spa:60, spd:85, spe:50 },
    sp:    { hp:32, atk:25, def:2, spa:0, spd:6, spe:1 },
    nature:{ plus:"atk", minus:"spa" },
    item:  "Chople Berry", ability:"Defiant",
    berry: { type:"Fighting", superEffOnly:true, mult:0.5 },
    moves: ["Kowtow Cleave","Iron Head","Low Kick","Sucker Punch"],
  },
  {
    name: "Garchomp",
    types: ["Dragon","Ground"],
    base:  { hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
    sp:    { hp:2, atk:32, def:0, spa:0, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"spa" },
    item:  "Life Orb", ability:"Rough Skin",
    moves: ["Earthquake","Dragon Claw","Rock Slide","Protect"],
  },
  {
    name: "Delphox", mega: "Mega Delphox",
    types: ["Fire","Psychic"],
    base:  { hp:75, atk:69, def:72, spa:159, spd:125, spe:134 },
    baseForm: { hp:75, atk:69, def:72, spa:114, spd:100, spe:104 },
    sp:    { hp:1, atk:0, def:2, spa:31, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"atk" },
    item:  "Delphoxite", ability:"Levitate",
    immuneTypes: ["Ground"],
    moves: ["Heat Wave","Psychic","Substitute","Protect"],
  },
];
