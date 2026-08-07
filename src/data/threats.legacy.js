// FROZEN TEST FIXTURE — do not edit, and do not use in the app.
//
// The five opposing sets the verified numbers in BUILD_BRIEF.md were computed
// against. Those numbers (Sneasler Close Combat 220.3% into Kingambit, Char-Y
// Heat Wave 144.9%, Basculegion Wave Crash 272.8%, Sylveon Hyper Voice 121.6%
// and 108.4%) are the project's ground truth for the damage engine.
//
// threats.js is live meta data and moves whenever usage does — Sneasler's item
// changed from Focus Sash to White Herb and its nature from Adamant to Jolly
// the moment real usage data arrived. Pinning the engine's regression suite to
// that would mean "is the damage formula correct?" silently depended on this
// week's ladder.
export const THREATS_LEGACY = [
  {
    id:"charizard-y", name:"Mega Charizard Y", types:["Fire","Flying"],
    base:{ hp:78, atk:104, def:78, spa:159, spd:115, spe:100 },
    baseForm:{ hp:78, atk:84, def:78, spa:109, spd:85, spe:100 },
    sp:{ hp:2, spa:32, spe:32 }, nature:{ plus:"spa", minus:"atk" },
    item:"Charizardite Y", ability:"Drought", setsWeather:"sun",
    moves:["Heat Wave","Weather Ball","Air Slash","Overheat","Protect"],
    defaultMove:"Heat Wave",
  },
  {
    id:"garchomp", name:"Garchomp", types:["Dragon","Ground"],
    base:{ hp:108, atk:130, def:95, spa:80, spd:85, spe:102 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"spe", minus:"spa" },
    item:"Life Orb", ability:"Rough Skin",
    moves:["Earthquake","Rock Slide","Dragon Claw","Protect"],
    defaultMove:"Earthquake",
  },
  {
    id:"basculegion", name:"Basculegion (Scarf)", types:["Water","Ghost"],
    base:{ hp:120, atk:112, def:65, spa:80, spd:75, spe:78 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },
    item:"Choice Scarf", ability:"Adaptability",
    moves:["Wave Crash","Last Respects","Aqua Jet","Flip Turn"],
    defaultMove:"Wave Crash",
  },
  {
    id:"sylveon", name:"Sylveon", types:["Fairy"],
    base:{ hp:95, atk:65, def:65, spa:110, spd:130, spe:60 },
    sp:{ hp:32, spa:32, spd:2 }, nature:{ plus:"spa", minus:"atk" },
    item:"Fairy Feather", ability:"Pixilate",
    moves:["Hyper Voice","Moonblast","Dazzling Gleam","Protect"],
    defaultMove:"Hyper Voice",
  },
  {
    id:"sneasler", name:"Sneasler", types:["Fighting","Poison"],
    base:{ hp:80, atk:130, def:60, spa:40, spd:80, spe:120 },
    sp:{ hp:2, atk:32, spe:32 }, nature:{ plus:"atk", minus:"spa" },
    item:"Focus Sash", ability:"Unburden",
    moves:["Close Combat","Dire Claw","Fake Out","Protect"],
    defaultMove:"Close Combat",
  },
];

export const THREATS = THREATS_LEGACY;
