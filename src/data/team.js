// Edon's team ("CybertronVGC", Slot 10, Team ID G3XYDBBC22).
// Stats DECODED FROM THE IN-GAME STAT SCREEN and re-derived through the Champions
// formula (every mon sums to 66 SP — the read is verified). For the two Mega mons,
// `base` is the MEGA form's base stats (its in-battle profile); `baseForm` keeps the
// pre-Mega numbers for reference. Natures use atk/def/spa/spd/spe keys.
export const TEAM = [
  {
    name: "Staraptor", mega: "Mega Staraptor",
    types: ["Fighting","Flying"],                 // Mega typing (base form is Normal/Flying)
    base:  { hp:85, atk:140, def:100, spa:60, spd:90, spe:110 },
    baseForm: { hp:85, atk:120, def:70, spa:50, spd:60, spe:100 },
    sp:    { hp:31, atk:1, def:0, spa:0, spd:2, spe:32 },
    nature:{ plus:"spe", minus:"spa" },           // Jolly
    item:  "Staraptite", ability:"Contrary",      // Intimidate as base form on entry
    immuneTypes: ["Ground"],
    moves: ["Close Combat","Brave Bird","Roost","Protect"],
    note:  "Contrary + Close Combat setup sweeper; Intimidate on entry before Mega.",
  },
  {
    name: "Glimmora",
    types: ["Rock","Poison"],
    base:  { hp:83, atk:55, def:90, spa:130, spd:81, spe:86 },
    sp:    { hp:1, atk:0, def:1, spa:32, spd:0, spe:32 },
    nature:{ plus:"spa", minus:"atk" },           // Modest
    item:  "Focus Sash", ability:"Toxic Debris",
    moves: ["Power Gem","Sludge Bomb","Earth Power","Spiky Shield"],
    note:  "Focus Sash lead; survives any single hit from full HP.",
  },
  {
    name: "Whimsicott",
    types: ["Grass","Fairy"],
    base:  { hp:60, atk:67, def:85, spa:77, spd:75, spe:116 },
    sp:    { hp:28, atk:0, def:32, spa:0, spd:0, spe:6 },
    nature:{ plus:"spe", minus:"atk" },           // Timid
    item:  "Occa Berry", ability:"Prankster",     // Occa halves one super-effective Fire hit
    berry: { type:"Fire", superEffOnly:true, mult:0.5 },
    moves: ["Tailwind","Moonblast","Charm","Light Screen"],
    note:  "Prankster speed control / screens; not a tank.",
  },
  {
    name: "Kingambit",
    types: ["Dark","Steel"],
    base:  { hp:100, atk:135, def:120, spa:60, spd:85, spe:50 },
    sp:    { hp:32, atk:25, def:2, spa:0, spd:6, spe:1 },
    nature:{ plus:"atk", minus:"spa" },           // Adamant
    item:  "Chople Berry", ability:"Defiant",     // Chople halves one super-effective Fighting hit
    berry: { type:"Fighting", superEffOnly:true, mult:0.5 },
    moves: ["Kowtow Cleave","Iron Head","Low Kick","Sucker Punch"],
    note:  "Physical wall + Sucker Punch priority; specially frail (SpD 111).",
  },
  {
    name: "Garchomp",
    types: ["Dragon","Ground"],
    base:  { hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
    sp:    { hp:2, atk:32, def:0, spa:0, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"spa" },           // Jolly
    item:  "Life Orb", ability:"Rough Skin",
    moves: ["Earthquake","Dragon Claw","Rock Slide","Protect"],
    note:  "Life Orb spread attacker.",
  },
  {
    name: "Delphox", mega: "Mega Delphox",
    types: ["Fire","Psychic"],
    base:  { hp:75, atk:69, def:72, spa:159, spd:125, spe:134 },  // Mega base stats
    baseForm: { hp:75, atk:69, def:72, spa:114, spd:100, spe:104 },
    sp:    { hp:1, atk:0, def:2, spa:31, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"atk" },           // Timid
    item:  "Delphoxite", ability:"Levitate",      // Mega ability = Levitate (Ground immune)
    immuneTypes: ["Ground"],
    moves: ["Heat Wave","Psychic","Substitute","Protect"],
    note:  "Excellent special wall (SpD 145) but very frail physically (Def 94).",
  },
];
