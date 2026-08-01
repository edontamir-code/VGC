// Common Reg M-B (Season 4) threats with their most-common competitive set, so
// selecting a threat auto-populates item / ability / nature / spread / moves —
// the way ChampDex, Pikalytics, etc. do it.
//
// SOURCING & ACCURACY: species/items/abilities/moves reflect current usage
// (pokemon-zone.com/champions, pikalytics.com — Reg M-B, updated ~Jul 2026).
// `base` = the IN-BATTLE form's base stats (Mega where the set Megas). `spread`
// values are the standard competitive spread for the role; where a threat commonly
// runs a bulkier spread, real damage is LOWER than a max-offense assumption — flagged
// in `note`. TREAT SPREADS AS EDITABLE and re-check usage when the meta shifts.
//
// `conf`: "high" = species/set well-established; "std" = spread is the standard
// convention rather than a scraped exact spread (verify for tight calcs).
//
// `movePool` vs `moves`
// ---------------------
// `moves` is the four they are ASSUMED to be running. `movePool` is everything
// the species commonly carries - usually six to eight, of which they bring four.
// The planner treats every un-ruled-out pool move as something they might have,
// so a plan is only a pin if it survives all of them. As you confirm or rule out
// moves in the app, that set shrinks and the guarantees get stronger.
//
// POOLS ARE THE STANDARD COMPETITIVE OPTIONS, NOT SCRAPED USAGE. They are the
// most likely thing in this file to be wrong or incomplete - edit them freely,
// and verify against pokemon-zone.com/champions or pikalytics.com. A move that
// is not in moves.js or the status-move table has no simulated effect and the
// planner will say so rather than pretend otherwise.
export const THREATS = [
  {
    id:"charizard-y", name:"Mega Charizard Y", types:["Fire","Flying"],
    base:{ hp:78, atk:104, def:78, spa:159, spd:115, spe:100 },
    baseForm:{ hp:78, atk:84, def:78, spa:109, spd:85, spe:100 },   // pre-Mega Charizard
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },      // Modest
    item:"Charizardite Y", ability:"Drought", setsWeather:"sun",
    moves:["Heat Wave","Weather Ball","Air Slash","Protect"], defaultMove:"Heat Wave",
    movePool:["Heat Wave","Weather Ball","Air Slash","Overheat","Solar Beam","Protect","Tailwind"],
    conf:"std", note:"Drought = sun. Weather Ball becomes Fire/100 in sun (more common than Overheat). Sometimes Timid.",
  },
  {
    id:"garchomp", name:"Garchomp", types:["Dragon","Ground"],
    base:{ hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly
    item:"Life Orb", ability:"Rough Skin",
    moves:["Earthquake","Rock Slide","Dragon Claw","Protect"], defaultMove:"Earthquake",
    movePool:["Earthquake","Rock Slide","Dragon Claw","Protect","Substitute","Swords Dance","Ice Fang"],
    conf:"high", note:"Also runs Choice Scarf, Roseli Berry, Sitrus. Adamant variants hit harder.",
  },
  {
    id:"basculegion", name:"Basculegion (Scarf)", types:["Water","Ghost"],
    base:{ hp:120, atk:112, def:65, spa:80, spd:75, spe:78 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },      // Adamant (Jolly also common)
    item:"Choice Scarf", ability:"Adaptability",
    moves:["Wave Crash","Last Respects","Aqua Jet","Flip Turn"], defaultMove:"Wave Crash",
    movePool:["Wave Crash","Last Respects","Aqua Jet","Flip Turn","Protect","Throat Chop"],
    conf:"high", note:"Adaptability = 2x STAB. Scarf outspeeds; Aqua Jet is priority. Your worst matchup.",
  },
  {
    id:"sylveon", name:"Sylveon", types:["Fairy"],
    base:{ hp:95, atk:65, def:65, spa:110, spd:130, spe:60 },
    sp:{ hp:32, spa:32, spd:2 }, nature:{ plus:"spa", minus:"atk" },      // Modest, bulky
    item:"Fairy Feather", ability:"Pixilate",
    moves:["Hyper Voice","Moonblast","Dazzling Gleam","Protect"], defaultMove:"Hyper Voice",
    movePool:["Hyper Voice","Moonblast","Dazzling Gleam","Protect","Helping Hand","Encore"],
    conf:"std", note:"Pixilate makes Hyper Voice a Fairy SPREAD move; Fairy Feather adds 1.2x.",
  },
  {
    id:"kingambit", name:"Kingambit", types:["Dark","Steel"],
    base:{ hp:100, atk:135, def:120, spa:60, spd:85, spe:50 },
    sp:{ hp:32, atk:32, spd:2 }, nature:{ plus:"atk", minus:"spa" },      // Adamant
    item:"Black Glasses", ability:"Defiant",
    moves:["Kowtow Cleave","Sucker Punch","Iron Head","Low Kick"], defaultMove:"Kowtow Cleave",
    movePool:["Kowtow Cleave","Sucker Punch","Iron Head","Low Kick","Protect","Swords Dance"],
    conf:"high", note:"Supreme Overlord scales as its team faints. Black Glasses = 1.2x Dark. Also Chople.",
  },
  {
    id:"incineroar", name:"Incineroar", types:["Fire","Dark"],
    base:{ hp:95, atk:115, def:90, spa:80, spd:90, spe:60 },
    sp:{ hp:32, atk:32, spd:2 }, nature:{ plus:"atk", minus:"spa" },      // Adamant (offensive ref)
    item:"Sitrus Berry", ability:"Intimidate",
    moves:["Flare Blitz","Knock Off","Fake Out","Parting Shot"], defaultMove:"Flare Blitz",
    movePool:["Flare Blitz","Knock Off","Fake Out","Parting Shot","Protect","Throat Chop","Helping Hand"],
    conf:"std", note:"USUALLY BULKY (hp/def) — offensive spread here is an upper bound on its damage.",
  },
  {
    id:"sneasler", name:"Sneasler", types:["Fighting","Poison"],
    base:{ hp:80, atk:130, def:60, spa:40, spd:80, spe:120 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },      // Adamant
    item:"Focus Sash", ability:"Unburden",
    moves:["Close Combat","Dire Claw","Fake Out","Protect"], defaultMove:"Close Combat",
    movePool:["Close Combat","Dire Claw","Fake Out","Protect","Throat Chop","Swords Dance"],
    conf:"high", note:"Close Combat is 4x on your Kingambit (2x even through Chople).",
  },
  {
    id:"aerodactyl", name:"Mega Aerodactyl", types:["Rock","Flying"],
    base:{ hp:80, atk:135, def:85, spa:70, spd:95, spe:150 },
    baseForm:{ hp:80, atk:105, def:65, spa:60, spd:75, spe:130 },   // pre-Mega Aerodactyl
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly
    item:"Aerodactylite", ability:"Tough Claws",
    moves:["Rock Slide","Dual Wingbeat","Ice Fang","Protect"], defaultMove:"Rock Slide",
    movePool:["Rock Slide","Dual Wingbeat","Ice Fang","Protect","Tailwind","Throat Chop"],
    conf:"std", note:"Extremely fast; Rock Slide pressures your Staraptor/Delphox (both 2x Rock).",
  },
  {
    id:"gholdengo", name:"Gholdengo (LO)", types:["Steel","Ghost"],
    base:{ hp:87, atk:60, def:95, spa:133, spd:91, spe:84 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },      // Modest
    item:"Life Orb", ability:"Good as Gold",
    moves:["Make It Rain","Shadow Ball","Nasty Plot","Protect"], defaultMove:"Make It Rain",
    movePool:["Make It Rain","Shadow Ball","Nasty Plot","Protect","Thunderbolt"],
    conf:"high", note:"Make It Rain is a Steel SPREAD nuke; 2x on Whimsicott and Glimmora.",
  },
  {
    id:"archaludon", name:"Archaludon", types:["Steel","Dragon"],
    base:{ hp:90, atk:105, def:130, spa:125, spd:85, spe:85 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },      // Modest
    item:"Leftovers", ability:"Stamina",
    moves:["Electro Shot","Dragon Pulse","Flash Cannon","Protect"], defaultMove:"Electro Shot",
    movePool:["Electro Shot","Dragon Pulse","Flash Cannon","Protect","Thunderbolt"],
    conf:"std", note:"Electro Shot is huge; charges unless in rain. Electric 2x on your Staraptor.",
  },
  {
    // Added as an opposing threat (it is also on your own team) because it is
    // the canonical Prankster support mon and the clearest example of why move
    // pools matter: Encore and Protect completely change which lines are safe.
    id:"whimsicott", name:"Whimsicott", types:["Grass","Fairy"],
    base:{ hp:60, atk:67, def:85, spa:77, spd:75, spe:116 },
    sp:{ hp:28, def:32, spe:6 }, nature:{ plus:"spe", minus:"atk" },       // Timid, bulky
    item:"Focus Sash", ability:"Prankster",
    moves:["Tailwind","Moonblast","Encore","Protect"], defaultMove:"Moonblast",
    movePool:["Tailwind","Moonblast","Encore","Protect","Light Screen","Charm","Helping Hand","Substitute"],
    conf:"std", note:"Prankster gives its status moves +1 priority, so Tailwind/Encore go before almost anything. Encore punishes a predictable Protect.",
  },

  // =========================================================================
  // Reg M-B meta, in usage order. Sets below marked conf:"usage" were taken
  // from pikalytics.com Reg M-B S3 ranked data (fetched 2026-08-01) - moves,
  // items, abilities, natures and SP spreads are the reported leaders, and the
  // spreads verifiably total 66 SP.
  //
  // Entries marked conf:"std" are the standard competitive convention because
  // their usage page was not fetched. Base stats throughout are the canonical
  // species values.
  //
  // MEGA STATS: VERIFIED against pokebase.app's Champions dex (fetched
  // 2026-08-01). Mega Swampert 100/150/110/95/110/70, Mega Metagross
  // 80/145/150/105/110/110, Mega Mawile 50/105/125/55/95/50 and Mega Staraptor
  // 85/140/100/60/90/110 all match the values below exactly. The earlier
  // "canonical line, unverified" warning no longer applies to those.
  // =========================================================================
  {
    id:"sinistcha", name:"Sinistcha", types:["Grass","Ghost"],
    base:{ hp:71, atk:60, def:106, spa:121, spd:80, spe:70 },
    sp:{ hp:32, def:14, spd:20 }, nature:{ plus:"def", minus:"atk" },        // Bold 45.7%
    item:"Sitrus Berry", ability:"Hospitality",
    moves:["Rage Powder","Matcha Gotcha","Life Dew","Trick Room"], defaultMove:"Matcha Gotcha",
    movePool:["Rage Powder","Matcha Gotcha","Life Dew","Trick Room","Protect"],
    conf:"usage", note:"#2 usage. Rage Powder redirects your single-target attacks to it - redirection is NOT simulated, so plan around it yourself. Also runs Kasib/Colbur Berry.",
  },
  {
    id:"pelipper", name:"Pelipper", types:["Water","Flying"],
    base:{ hp:60, atk:50, def:100, spa:95, spd:70, spe:65 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },         // Modest 49.9%
    item:"Focus Sash", ability:"Drizzle", setsWeather:"rain",
    moves:["Hurricane","Weather Ball","Tailwind","Wide Guard"], defaultMove:"Hurricane",
    movePool:["Hurricane","Weather Ball","Tailwind","Wide Guard","Protect","Hydro Pump"],
    conf:"usage", note:"Drizzle = rain, which makes its Weather Ball Water/100 and powers Swift Swim partners. Wide Guard blanks your spread moves.",
  },
  {
    id:"grimmsnarl", name:"Grimmsnarl", types:["Dark","Fairy"],
    base:{ hp:95, atk:120, def:65, spa:95, spd:75, spe:60 },
    sp:{ hp:32, def:19, spd:15 }, nature:{ plus:"spd", minus:"spa" },        // Careful 12.4%
    item:"Light Clay", ability:"Prankster",
    moves:["Light Screen","Parting Shot","Reflect","Spirit Break"], defaultMove:"Spirit Break",
    movePool:["Light Screen","Parting Shot","Reflect","Spirit Break","Thunder Wave","Fake Out","Taunt"],
    conf:"usage", note:"Light Clay screens last 8 turns. Prankster puts its screens at +1, so they go up before you can stop them - and its status moves cannot touch your Kingambit (Dark).",
  },
  {
    id:"farigiraf", name:"Farigiraf", types:["Normal","Psychic"],
    base:{ hp:120, atk:90, def:70, spa:110, spd:70, spe:60 },
    sp:{ hp:32, def:20, spd:14 }, nature:{ plus:"def", minus:"atk" },        // Bold 33.8%
    item:"Sitrus Berry", ability:"Armor Tail",
    moves:["Trick Room","Psychic","Helping Hand","Protect"], defaultMove:"Psychic",
    movePool:["Trick Room","Psychic","Helping Hand","Protect","Foul Play","Psychic Noise"],
    conf:"usage", note:"Armor Tail blocks ALL priority against its side - your Sucker Punch and Aqua Jet do nothing while it is out. Ability effect NOT simulated.",
  },
  {
    id:"swampert", name:"Mega Swampert", types:["Water","Ground"],
    base:{ hp:100, atk:150, def:110, spa:95, spd:110, spe:70 },              // VERIFIED (pokebase)
    baseForm:{ hp:100, atk:110, def:90, spa:85, spd:90, spe:60 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },         // Adamant 89.9%
    item:"Swampertite", ability:"Swift Swim",
    moves:["Protect","Wave Crash","Earthquake","Ice Punch"], defaultMove:"Wave Crash",
    movePool:["Protect","Wave Crash","Earthquake","Ice Punch","Flip Turn","Hydro Pump"],
    conf:"usage", note:"Swampertite 98.5%. Swift Swim doubles its Speed in Pelipper's rain - check the Speed tab under rain before assuming you outspeed. Mega base stats are the canonical line; verify for Champions.",
  },
  {
    id:"annihilape", name:"Annihilape", types:["Fighting","Ghost"],
    base:{ hp:110, atk:115, def:80, spa:50, spd:90, spe:90 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },         // Adamant 52.1%
    item:"Leftovers", ability:"Defiant",
    moves:["Rage Fist","Protect","Drain Punch","Bulk Up"], defaultMove:"Drain Punch",
    movePool:["Rage Fist","Protect","Drain Punch","Bulk Up","Close Combat","Shadow Ball"],
    conf:"usage", note:"Rage Fist grows by 50 BP for every hit it has taken - the scaling is NOT modelled, so its Ghost damage is understated the longer it stays in.",
  },
  {
    id:"metagross", name:"Mega Metagross", types:["Steel","Psychic"],
    base:{ hp:80, atk:145, def:150, spa:105, spd:110, spe:110 },             // canonical Mega line
    baseForm:{ hp:80, atk:135, def:130, spa:95, spd:90, spe:70 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },        // Adamant 50.8%
    item:"Metagrossite", ability:"Tough Claws",
    moves:["Protect","Psychic Fangs","Iron Head","Bullet Punch"], defaultMove:"Psychic Fangs",
    movePool:["Protect","Psychic Fangs","Iron Head","Bullet Punch","Stomping Tantrum","Meteor Mash"],
    conf:"usage", note:"Moves/item/spread from usage data; ability listed there is Clear Body, which is the PRE-Mega ability - Mega Metagross has Tough Claws (contact moves x1.3). Bullet Punch is priority. Mega base stats are the canonical line, unverified for Champions.",
  },
  {
    id:"staraptor", name:"Mega Staraptor", types:["Fighting","Flying"],
    base:{ hp:85, atk:140, def:100, spa:60, spd:90, spe:110 },               // from team.js
    baseForm:{ hp:85, atk:120, def:70, spa:50, spd:60, spe:100 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },
    item:"Staraptite", ability:"Contrary",
    moves:["Close Combat","Brave Bird","Roost","Protect"], defaultMove:"Close Combat",
    movePool:["Close Combat","Brave Bird","Roost","Protect","U-turn","Double-Edge"],
    conf:"std", note:"Mirror of your own. Contrary means its Close Combat RAISES its defences instead of dropping them, so it does not get easier to KO. Intimidate on entry before Mega.",
  },
  {
    id:"ninetales-alola", name:"Ninetales-Alola", types:["Ice","Fairy"],
    base:{ hp:73, atk:67, def:75, spa:81, spd:100, spe:109 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spe", minus:"atk" },
    item:"Light Clay", ability:"Snow Warning", setsWeather:"snow",
    moves:["Aurora Veil","Blizzard","Icy Wind","Moonblast"], defaultMove:"Moonblast",
    movePool:["Aurora Veil","Blizzard","Icy Wind","Moonblast","Protect","Encore"],
    conf:"std", note:"Snow Warning sets snow, which turns on Aurora Veil - that halves BOTH your physical and special damage for 8 turns with Light Clay.",
  },
  {
    id:"maushold", name:"Maushold", types:["Normal"],
    base:{ hp:74, atk:75, def:70, spa:65, spd:75, spe:111 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },
    item:"Wide Lens", ability:"Technician",
    moves:["Population Bomb","Follow Me","Protect","Fake Out"], defaultMove:"Population Bomb",
    movePool:["Population Bomb","Follow Me","Protect","Fake Out","Super Fang","Taunt"],
    conf:"std", note:"Population Bomb hits up to 10 times - multi-hit is NOT modelled, so its damage is badly understated. Follow Me redirects your single-target attacks.",
  },
  {
    id:"mawile", name:"Mega Mawile", types:["Steel","Fairy"],
    base:{ hp:50, atk:105, def:125, spa:55, spd:95, spe:50 },                // canonical Mega line
    baseForm:{ hp:50, atk:85, def:85, spa:55, spd:55, spe:50 },
    sp:{ hp:32, atk:32, spd:2 }, nature:{ plus:"atk", minus:"spe" },        // Brave 53.4%
    item:"Mawilite", ability:"Huge Power",
    moves:["Play Rough","Sucker Punch","Protect","Iron Head"], defaultMove:"Play Rough",
    movePool:["Play Rough","Sucker Punch","Protect","Iron Head","Swords Dance","Fire Fang"],
    conf:"usage", note:"Moves/item/spread from usage data. The ability listed there is Intimidate - that is the PRE-Mega ability; Mega Mawile has Huge Power, which DOUBLES its Attack (now modelled). Brave nature and very low Speed means it moves first under Trick Room.",
  },
  {
    id:"sableye", name:"Mega Sableye", types:["Dark","Ghost"],
    base:{ hp:50, atk:85, def:125, spa:85, spd:115, spe:20 },                // canonical Mega line
    baseForm:{ hp:50, atk:75, def:75, spa:65, spd:65, spe:50 },
    sp:{ hp:32, def:20, spd:14 }, nature:{ plus:"def", minus:"atk" },
    item:"Sablenite", ability:"Magic Bounce",
    moves:["Foul Play","Will-O-Wisp","Protect","Fake Out"], defaultMove:"Foul Play",
    movePool:["Foul Play","Will-O-Wisp","Protect","Fake Out","Recover","Quash"],
    conf:"std", note:"Magic Bounce reflects status moves back at you. Extremely slow, so it moves first under Trick Room. Foul Play uses YOUR Attack - not modelled.",
  },
  {
    id:"raichu", name:"Raichu", types:["Electric"],
    base:{ hp:60, atk:90, def:55, spa:90, spd:80, spe:110 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spe", minus:"atk" },
    item:"Focus Sash", ability:"Lightning Rod",
    moves:["Thunderbolt","Fake Out","Volt Switch","Protect"], defaultMove:"Thunderbolt",
    movePool:["Thunderbolt","Fake Out","Volt Switch","Protect","Helping Hand","Nuzzle"],
    conf:"std", note:"Lightning Rod draws every Electric move on the field to it and raises its SpA - redirection is NOT simulated.",
  },
  {
    id:"floette-eternal", name:"Floette (Eternal Flower)", types:["Fairy"],
    base:{ hp:74, atk:65, def:67, spa:125, spd:128, spe:92 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },
    item:"Fairy Feather", ability:"Flower Veil",
    moves:["Light of Ruin","Moonblast","Dazzling Gleam","Protect"], defaultMove:"Moonblast",
    movePool:["Light of Ruin","Moonblast","Dazzling Gleam","Protect","Helping Hand","Calm Mind"],
    conf:"std", note:"Highest win rate in the format (54%) on low usage. Light of Ruin is 140 BP Fairy with recoil and is NOT in moves.js - add it for exact numbers.",
  },
];
