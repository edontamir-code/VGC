// Edon's team — Team ID QY3XFXCEJA.
//
// TRANSCRIBED DIRECTLY FROM THE IN-GAME TEAM SCREEN (both the Moves & More and
// the Stats pages), then re-derived through the Champions formula. Every one of
// the 36 stats below reproduces the exact number the game displays, and every
// spread totals exactly 66 SP — see test-team.mjs, which asserts all of it.
//
// For the two Mega mons, `base` is the MEGA form's stat line (the in-battle
// profile) and `baseForm` is the pre-Mega line. The GAME's stat screen shows the
// PRE-Mega numbers, so that is what the test checks against.
//
// Natures are written as +stat/-stat; the game shows them as the small up/down
// arrows beside each stat.
export const TEAM = [
  {
    // Mega Raichu Y is a Champions-original Mega: 60/100/55/160/80/130.
    // Megaing nearly doubles its SpA (112 -> 176 at this spread) and lifts its
    // Speed, so the pre-Mega numbers badly understate it.
    name: "Raichu", mega: "Mega Raichu Y",
    types: ["Electric"],
    base:  { hp:60, atk:100, def:55, spa:160, spd:80, spe:130 },   // Mega Raichu Y
    baseForm: { hp:60, atk:90, def:55, spa:90, spd:80, spe:110 },
    sp:    { hp:32, atk:0, def:0, spa:2, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"atk" },           // Timid
    item:  "Raichunite Y", ability:"No Guard",     // Lightning Rod before it Megas
    moves: ["Zap Cannon","Focus Blast","Fake Out","Protect"],
    note:  "NO GUARD once Mega'd — Zap Cannon (50%) and Focus Blast (70%) become certain, and Zap Cannon always paralyses. That is the entire point of the set. Before it Megas it has Lightning Rod instead, which draws Electric moves to it.",
  },
  {
    name: "Staraptor", mega: "Mega Staraptor",
    types: ["Fighting","Flying"],                 // Mega typing (base form is Normal/Flying)
    base:  { hp:85, atk:140, def:100, spa:60, spd:90, spe:110 },   // Mega Staraptor
    baseForm: { hp:85, atk:120, def:70, spa:50, spd:60, spe:100 },
    sp:    { hp:15, atk:19, def:0, spa:0, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"spa" },           // Jolly
    item:  "Staraptite", ability:"Contrary",      // Intimidate as the base form on entry
    immuneTypes: ["Ground"],
    moves: ["Close Combat","Dual Wingbeat","Tailwind","Protect"],
    note:  "Intimidate on entry, Contrary once Mega'd — so Close Combat RAISES its defences instead of dropping them. Your only Tailwind.",
  },
  {
    // HISUIAN Arcanine: Fire/ROCK, 95/115/80/95/80/90 — not the Kantonian line.
    // Rock Head is what makes Head Smash (150 BP) recoil-free.
    name: "Arcanine",
    types: ["Fire","Rock"],
    base:  { hp:95, atk:115, def:80, spa:95, spd:80, spe:90 },
    sp:    { hp:2, atk:32, def:0, spa:0, spd:0, spe:32 },
    nature:{ plus:"spe", minus:"spa" },           // Jolly
    item:  "Focus Sash", ability:"Rock Head",
    moves: ["Flare Blitz","Head Smash","Extreme Speed","Protect"],
    note:  "Hisuian. Rock Head cancels Head Smash AND Flare Blitz recoil. Extreme Speed is +2 priority. Focus Sash survives any single hit from full.",
  },
  {
    name: "Farigiraf",
    types: ["Normal","Psychic"],
    base:  { hp:120, atk:90, def:70, spa:110, spd:70, spe:60 },
    sp:    { hp:29, atk:0, def:21, spa:0, spd:16, spe:0 },
    nature:{ plus:"spd", minus:"atk" },           // Careful
    item:  "Sitrus Berry", ability:"Armor Tail",
    moves: ["Psychic","Helping Hand","Trick Room","Protect"],
    note:  "Armor Tail blocks ALL priority against your side — it shuts off their Fake Out, Sucker Punch and Aqua Jet while it is out. That is not simulated, so judge it yourself. Slow enough to move first under its own Trick Room.",
  },
  {
    name: "Sylveon",
    types: ["Fairy"],
    base:  { hp:95, atk:65, def:65, spa:110, spd:130, spe:60 },
    sp:    { hp:13, atk:0, def:22, spa:23, spd:0, spe:8 },
    nature:{ plus:"spa", minus:"atk" },           // Modest
    item:  "Fairy Feather", ability:"Pixilate",
    moves: ["Hyper Voice","Quick Attack","Hyper Beam","Detect"],
    note:  "Pixilate turns all three Normal moves Fairy at 1.2x — including QUICK ATTACK, which gives you priority Fairy damage, and Hyper Beam at 150 BP. Hyper Voice is the spread option.",
  },
  {
    name: "Kingambit",
    types: ["Dark","Steel"],
    base:  { hp:100, atk:135, def:120, spa:60, spd:85, spe:50 },
    sp:    { hp:32, atk:32, def:0, spa:0, spd:1, spe:1 },
    nature:{ plus:"atk", minus:"spa" },           // Adamant
    item:  "Life Orb", ability:"Defiant",
    moves: ["Kowtow Cleave","Sucker Punch","Swords Dance","Protect"],
    note:  "Life Orb, not a berry, on this build — so it takes super-effective Fighting hits at full price. Defiant punishes Intimidate. Sucker Punch only works if the target is attacking.",
  },
];
