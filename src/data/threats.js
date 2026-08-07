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
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },      // Modest 77.0%
    item:"Charizardite Y", ability:"Drought", setsWeather:"sun",
    moves:["Heat Wave","Solar Beam","Weather Ball","Protect"], defaultMove:"Heat Wave",
    movePool:["Protect","Heat Wave","Solar Beam","Weather Ball","Air Slash","Dragon Dance","Flare Blitz","Dragon Claw"],
    conf:"usage", note:"Protect 98.4%, Heat Wave 95.4%, SOLAR BEAM 92.2%, Weather Ball 83.9%. Overheat does not appear at all and Air Slash is only 6% - Solar Beam is the real fourth move, and Drought makes it a one-turn attack. Charizardite Y 95.4% vs X 3.9%. The ability shown on the usage page is the base form's (Blaze/Solar Power); Drought is the Mega Y ability.",
  },
  {
    id:"garchomp", name:"Garchomp", types:["Dragon","Ground"],
    base:{ hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly 60.5%
    item:"Life Orb", ability:"Rough Skin",                                // Rough Skin 98.5%
    moves:["Dragon Claw","Rock Slide","Earthquake","Protect"], defaultMove:"Earthquake",
    movePool:["Dragon Claw","Rock Slide","Earthquake","Protect","Stomping Tantrum","Poison Jab","Rock Tomb","Scale Shot"],
    conf:"usage", note:"Most-used Pokemon in the format. Dragon Claw 89.4%, Rock Slide 82.0%, Earthquake 80.7%, Protect 70.2%, then Stomping Tantrum 40.3%. Life Orb 51.5%, Scarf 12.7%. Adamant is 38.9% and hits noticeably harder.",
  },
  {
    id:"basculegion", name:"Basculegion (Scarf)", types:["Water","Ghost"],
    base:{ hp:120, atk:112, def:65, spa:80, spd:75, spe:78 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },      // Adamant 57.8%
    item:"Choice Scarf", ability:"Adaptability",                          // Adaptability 93.2%
    moves:["Last Respects","Aqua Jet","Wave Crash","Protect"], defaultMove:"Wave Crash",
    movePool:["Last Respects","Aqua Jet","Wave Crash","Protect","Flip Turn","Liquidation","Psychic Fangs","Head Smash"],
    conf:"usage", note:"Last Respects is on 100% of them and Aqua Jet on 94.9% - the priority is near-guaranteed. Choice Scarf 44.7%, but Mystic Water 19.6% and Focus Sash 17.6% mean a Scarf read is far from safe. Adaptability = 2x STAB.",
  },
  {
    id:"sylveon", name:"Sylveon", types:["Fairy"],
    base:{ hp:95, atk:65, def:65, spa:110, spd:130, spe:60 },
    sp:{ hp:9, def:22, spa:30, spe:5 }, nature:{ plus:"spa", minus:"atk" }, // Modest 81.3%
    item:"Fairy Feather", ability:"Pixilate",                              // Pixilate 99.9%
    moves:["Hyper Voice","Quick Attack","Hyper Beam","Detect"], defaultMove:"Hyper Voice",
    movePool:["Hyper Voice","Quick Attack","Hyper Beam","Detect","Protect","Moonblast","Calm Mind","Yawn"],
    conf:"usage", note:"Pixilate turns all three Normal moves Fairy at 1.2x - including QUICK ATTACK (81.6%), which is priority Fairy damage, and Hyper Beam (71.2%) at 150 BP. Fairy Feather 89.6%. This is the same set Edon runs.",
  },
  {
    id:"kingambit", name:"Kingambit", types:["Dark","Steel"],
    base:{ hp:100, atk:135, def:120, spa:60, spd:85, spe:50 },
    sp:{ hp:32, atk:32, spd:2 }, nature:{ plus:"atk", minus:"spa" },      // Adamant 88.0%
    item:"Chople Berry", ability:"Defiant",                                // Defiant 96.1%
    moves:["Sucker Punch","Kowtow Cleave","Iron Head","Protect"], defaultMove:"Kowtow Cleave",
    movePool:["Sucker Punch","Kowtow Cleave","Iron Head","Protect","Low Kick","Swords Dance","Brick Break","Quick Guard"],
    conf:"usage", note:"Sucker Punch is on 99.5% of them - assume the priority is there. CHOPLE BERRY 42.9% is the most common item, so it takes a Fighting hit at half: check twice before assuming a Close Combat KO. Black Glasses 31.8%. Supreme Overlord is only 3.9%; Defiant is 96.1%.",
  },
  {
    id:"incineroar", name:"Incineroar", types:["Fire","Dark"],
    base:{ hp:95, atk:115, def:90, spa:80, spd:90, spe:60 },
    sp:{ hp:32, def:14, spd:20 }, nature:{ plus:"spd", minus:"spa" },     // Careful 40.1%
    item:"Sitrus Berry", ability:"Intimidate",                             // Intimidate 99.8%
    moves:["Fake Out","Parting Shot","Flare Blitz","Throat Chop"], defaultMove:"Flare Blitz",
    movePool:["Fake Out","Parting Shot","Flare Blitz","Throat Chop","Darkest Lariat","Protect","Will-O-Wisp","Taunt"],
    conf:"usage", note:"Fake Out 99.9% and Parting Shot 96.8% - it is a support mon that pivots, not a wallbreaker. The spread is genuinely DEFENSIVE (32 HP / 14 Def / 20 SpD, Careful), which the old offensive placeholder here badly overstated. Knock Off does not appear at all; Throat Chop 53.7% is the second Dark move. Note Protect is only 9.5%.",
  },
  {
    id:"sneasler", name:"Sneasler", types:["Fighting","Poison"],
    base:{ hp:80, atk:130, def:60, spa:40, spd:80, spe:120 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly 58.3%
    item:"White Herb", ability:"Unburden",                                 // Unburden 88.7%
    moves:["Close Combat","Fake Out","Dire Claw","Protect"], defaultMove:"Close Combat",
    movePool:["Close Combat","Fake Out","Dire Claw","Protect","Coaching","Rock Slide","Gunk Shot","Feint"],
    conf:"usage", note:"WHITE HERB 71.1%, not Focus Sash - and that combination is the whole set. Close Combat drops its defences, White Herb immediately restores them, and spending the item triggers UNBURDEN, doubling its Speed for the rest of the game. Check the Speed tab again after it has used Close Combat once.",
  },
  {
    id:"aerodactyl", name:"Mega Aerodactyl", types:["Rock","Flying"],
    base:{ hp:80, atk:135, def:85, spa:70, spd:95, spe:150 },
    baseForm:{ hp:80, atk:105, def:65, spa:60, spd:75, spe:130 },   // pre-Mega Aerodactyl
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly 94.7%
    item:"Aerodactylite", ability:"Tough Claws",                          // Aerodactylite 61.2%
    moves:["Rock Slide","Tailwind","Dual Wingbeat","Protect"], defaultMove:"Rock Slide",
    movePool:["Rock Slide","Tailwind","Dual Wingbeat","Protect","Wide Guard","Ice Fang"],
    conf:"usage", note:"Rock Slide 99.9% and TAILWIND 92.7% - it is a speed-control lead as much as an attacker. Only 61.2% Mega: the other 34.7% hold a Focus Sash and stay in base form with much lower stats, so check before assuming Mega numbers. Wide Guard (33.6%) blanks your spread moves.",
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
    // SpD corrected 85 -> 65 to match the Champions dex (and the canonical
    // line). The original value in this file was wrong and was overstating how
    // well Archaludon takes special hits.
    base:{ hp:90, atk:105, def:130, spa:125, spd:65, spe:85 },
    sp:{ hp:32, def:1, spa:5, spd:25, spe:3 }, nature:{ plus:"spa", minus:"atk" }, // Modest 75.1%
    item:"Leftovers", ability:"Stamina",                                   // Stamina 93.4%
    moves:["Electro Shot","Flash Cannon","Protect","Dragon Pulse"], defaultMove:"Electro Shot",
    movePool:["Electro Shot","Flash Cannon","Protect","Dragon Pulse","Draco Meteor","Aura Sphere","Snarl","Thunderbolt"],
    conf:"usage", note:"Leftovers 88.6% and a genuinely BULKY spread (32 HP / 25 SpD) - the old max-offence placeholder here overstated its damage and understated its survival. Stamina raises its Defence every time it is hit. Electro Shot charges unless it is raining - and Pelipper is right there.",
  },
  {
    // Added as an opposing threat (it is also on your own team) because it is
    // the canonical Prankster support mon and the clearest example of why move
    // pools matter: Encore and Protect completely change which lines are safe.
    id:"whimsicott", name:"Whimsicott", types:["Grass","Fairy"],
    base:{ hp:60, atk:67, def:85, spa:77, spd:75, spe:116 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spe", minus:"atk" },       // Timid 76.5%
    item:"Focus Sash", ability:"Prankster",                                // Prankster 99.4%
    moves:["Tailwind","Moonblast","Encore","Protect"], defaultMove:"Moonblast",
    movePool:["Tailwind","Moonblast","Encore","Protect","Charm","Sunny Day","Fake Tears","Tickle"],
    conf:"usage", note:"Tailwind 98.5%, Moonblast 92.0%, Encore 74.1%. Focus Sash 75.5%, so it reliably survives one hit. Spread is fully OFFENSIVE (2/0/0/32/0/32) at 50.7% - not the bulky build. Prankster puts its status at +1, so Tailwind and Encore go before almost anything - but nothing it has touches a Dark type.",
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
    item:"Swampertite", ability:"Swift Swim",                                // Swampertite 98.5%
    moves:["Protect","Wave Crash","Earthquake","Ice Punch"], defaultMove:"Wave Crash",
    movePool:["Protect","Wave Crash","Earthquake","Ice Punch","High Horsepower","Rock Slide","Flip Turn","Liquidation"],
    conf:"usage", note:"Swampertite 98.5%. Swift Swim doubles its Speed in Pelipper's rain - check the Speed tab under rain before assuming you outspeed. Mega base stats are the canonical line; verify for Champions.",
  },
  {
    id:"annihilape", name:"Annihilape", types:["Fighting","Ghost"],
    base:{ hp:110, atk:115, def:80, spa:50, spd:90, spe:90 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },         // Adamant 52.1%
    item:"Leftovers", ability:"Defiant",                                     // Defiant 99.3%
    moves:["Rage Fist","Protect","Drain Punch","Bulk Up"], defaultMove:"Drain Punch",
    movePool:["Rage Fist","Protect","Drain Punch","Bulk Up","Close Combat","Coaching","Taunt","Rock Slide"],
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
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spe", minus:"atk" },      // Timid 82.7%
    item:"Light Clay", ability:"Snow Warning", setsWeather:"snow",        // Snow Warning 99.9%
    moves:["Blizzard","Protect","Freeze-Dry","Aurora Veil"], defaultMove:"Blizzard",
    movePool:["Blizzard","Protect","Freeze-Dry","Aurora Veil","Moonblast","Encore","Icy Wind","Dazzling Gleam"],
    conf:"usage", note:"Blizzard 95.2% and it never misses in its own snow (accuracy not modelled here anyway). Aurora Veil 63.1% halves BOTH physical and special for 8 turns on Light Clay. Freeze-Dry hits Water types super-effectively - the type chart does not model that exception, so its damage into Water is understated.",
  },
  {
    id:"maushold", name:"Maushold", types:["Normal"],
    // HP aligned to the Champions dex (70). The canonical line is 74; Champions
    // appears to differ, and the dex is the game-specific source. If you ever
    // see a Maushold's real HP in game, that beats both - add an override.
    base:{ hp:74, atk:75, def:70, spa:65, spd:75, spe:111 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },      // Jolly 56.0%
    item:"Chople Berry", ability:"Friend Guard",                          // Friend Guard 73.2%
    moves:["Follow Me","Protect","Super Fang","Population Bomb"], defaultMove:"Population Bomb",
    movePool:["Follow Me","Protect","Super Fang","Population Bomb","Beat Up","Encore","Taunt","Feint"],
    conf:"usage", note:"A REDIRECTOR first, an attacker second: Follow Me 95.4%, and Population Bomb is only 31.5%. Friend Guard (73.2%) reduces damage to its ally - not modelled. Super Fang halves current HP and is not modelled either. Feint breaks Protect.",
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
    // NOT the Mega. Sablenite is 0.2% of its items in this format - it is
    // played as base Sableye for Prankster, so Magic Bounce never comes up.
    id:"sableye", name:"Sableye", types:["Dark","Ghost"],
    base:{ hp:50, atk:75, def:75, spa:65, spd:65, spe:50 },
    sp:{ hp:32, def:9, spd:25 }, nature:{ plus:"spd", minus:"atk" },      // Careful 30.0%
    item:"Roseli Berry", ability:"Prankster",                             // Prankster 100%
    moves:["Rain Dance","Light Screen","Encore","Reflect"], defaultMove:"Foul Play",
    movePool:["Rain Dance","Light Screen","Encore","Reflect","Will-O-Wisp","Disable","Fake Out","Foul Play"],
    conf:"usage", note:"A PRANKSTER SUPPORT MON, not the Mega - Sablenite is 0.2%. Rain Dance 78.8% (rain support for Swift Swim partners), dual screens, Encore. Prankster puts all of it at +1, but none of it touches a Dark type. Roseli Berry 48.0% blunts one Fairy hit; Light Clay 41.5% makes screens last 8 turns.",
  },
  {
    id:"raichu", name:"Mega Raichu Y", types:["Electric"],
    base:{ hp:60, atk:100, def:55, spa:160, spd:80, spe:130 },            // Mega Raichu Y
    baseForm:{ hp:60, atk:90, def:55, spa:90, spd:80, spe:110 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spe", minus:"atk" },      // Timid 69.6%
    item:"Raichunite Y", ability:"No Guard",                              // Raichunite Y 60.5%
    moves:["Fake Out","Protect","Zap Cannon","Focus Blast"], defaultMove:"Zap Cannon",
    movePool:["Fake Out","Protect","Zap Cannon","Focus Blast","Volt Switch","Charm","Encore","Grass Knot"],
    conf:"usage", note:"NO GUARD once it Megas, so Zap Cannon (50%) and Focus Blast (70%) never miss - and Zap Cannon always paralyses. Before it Megas it has Lightning Rod and draws Electric moves instead. Raichunite X is 18.2%, and that variant is PHYSICAL with a completely different profile - check which stone before assuming.",
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
