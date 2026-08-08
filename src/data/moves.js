// Common Reg M-B moves. power = base power; spread = hits both foes in doubles
// (x0.75); contact = eligible for Tough Claws; otherMult = fixed extra modifier
// (e.g. item/ability bonuses baked into a specific move on a specific set).
// Verify/extend against pokemon-zone move data when adding new entries.
//
// flinch / firstTurnOnly / lowersSpe are read by the lead-risk model, not by the
// damage engine - engine.js ignores any field it does not know about.
export const MOVES = {
  // --- Disruption (priority) ---
  // Fake Out decides more doubles leads than any other move: +3 priority, always
  // flinches, and its chip damage takes a Focus Sash mon off full HP so the Sash
  // no longer saves it from the partner's attack.
  "Fake Out":      { type:"Normal",   category:"phys", power:40, priority:3, contact:true,
                     flinch:true, firstTurnOnly:true,
                     note:"Flinches. Only works the turn the user switches in." },
  "Ice Fang":      { type:"Ice",      category:"phys", power:65,  contact:true },
  "Icy Wind":      { type:"Ice",      category:"spec", power:55,  spread:true, lowersSpe:1,
                     note:"Lowers both foes' Speed by 1" },
  "Electroweb":    { type:"Electric", category:"spec", power:55,  spread:true, lowersSpe:1,
                     note:"Lowers both foes' Speed by 1" },

  // Fire
  "Heat Wave":     { type:"Fire",     category:"spec", power:95,  spread:true },
  "Overheat":      { type:"Fire",     category:"spec", power:130, selfStages:{spa:-2},
                     note:"Drops the user's SpA by 2 - Contrary turns that into +2" },
  "Flamethrower":  { type:"Fire",     category:"spec", power:90 },
  "Flare Blitz":   { type:"Fire",     category:"phys", power:120, contact:true },
  "Blaze Kick":    { type:"Fire",     category:"phys", power:85,  contact:true },
  // Flying
  "Air Slash":     { type:"Flying",   category:"spec", power:75 },
  "Weather Ball":  { type:"Normal",   category:"spec", power:50, weatherBall:true,
                     note:"Normal/50 normally; becomes weather type at 100 BP (sun→Fire, rain→Water, sand→Rock, snow→Ice)" },
  "Brave Bird":    { type:"Flying",   category:"phys", power:120, contact:true },
  "Dual Wingbeat": { type:"Flying",   category:"phys", power:40,  contact:true, accuracy:90,
                     note:"Hits twice. 90% accurate - Close Combat is the sure thing when both KO" },
  "Hurricane":     { type:"Flying",   category:"spec", power:110 },
  // Fighting
  "Close Combat":  { type:"Fighting", category:"phys", power:120, contact:true,
                     selfStages:{def:-1, spd:-1},
                     note:"Drops the user's Def and SpD - Contrary RAISES them instead" },
  "Low Kick":      { type:"Fighting", category:"phys", power:60,  contact:true, note:"scales with target weight" },
  // Ground
  "Earthquake":    { type:"Ground",   category:"phys", power:100, spread:true },
  "High Horsepower":{type:"Ground",   category:"phys", power:95,  contact:true },
  // Rock
  "Rock Slide":    { type:"Rock",     category:"phys", power:75,  spread:true },
  // Water
  "Wave Crash":    { type:"Water",    category:"phys", power:120, contact:true },
  "Aqua Jet":      { type:"Water",    category:"phys", power:40,  contact:true, priority:1 },
  "Flip Turn":     { type:"Water",    category:"phys", power:60,  contact:true },
  "Surf":          { type:"Water",    category:"spec", power:90,  spread:true },
  // Ghost
  "Last Respects": { type:"Ghost",    category:"phys", power:100, scaling:"last_respects",
                     note:"50 + 50 per fainted ally on user's side; default here ≈1 fainted" },
  "Shadow Ball":   { type:"Ghost",    category:"spec", power:80 },
  // Dark
  "Kowtow Cleave": { type:"Dark",     category:"phys", power:85,  contact:true, neverMisses:true,
                     note:"Bypasses accuracy and evasion entirely" },
  "Sucker Punch":  { type:"Dark",     category:"phys", power:70,  contact:true, priority:1, note:"fails if target isn't attacking" },
  "Knock Off":     { type:"Dark",     category:"phys", power:65,  contact:true, note:"x1.5 (97.5) if target holds a removable item" },
  "Throat Chop":   { type:"Dark",     category:"phys", power:80,  contact:true },
  // Fairy / Normal (Pixilate)
  "Hyper Voice":   { type:"Normal",   category:"spec", power:90,  spread:true, note:"becomes Fairy under Pixilate" },
  "Moonblast":     { type:"Fairy",    category:"spec", power:95 },
  "Dazzling Gleam":{ type:"Fairy",    category:"spec", power:80,  spread:true },
  // Poison
  "Dire Claw":     { type:"Poison",   category:"phys", power:80,  contact:true },
  "Sludge Bomb":   { type:"Poison",   category:"spec", power:90 },
  // Steel
  "Make It Rain":  { type:"Steel",    category:"spec", power:120, spread:true, selfStages:{spa:-1},
                     note:"Drops the user's SpA by 1" },
  "Iron Head":     { type:"Steel",    category:"phys", power:80,  contact:true },
  "Flash Cannon":  { type:"Steel",    category:"spec", power:80 },
  "Meteor Mash":   { type:"Steel",    category:"phys", power:90,  contact:true },
  "Bullet Punch":  { type:"Steel",    category:"phys", power:40,  contact:true, priority:1 },
  // Electric
  "Electro Shot":  { type:"Electric", category:"spec", power:130, note:"charges (instant in rain)" },
  "Thunderbolt":   { type:"Electric", category:"spec", power:90 },
  // Dragon
  "Dragon Claw":   { type:"Dragon",   category:"phys", power:80,  contact:true },
  "Dragon Pulse":  { type:"Dragon",   category:"spec", power:85 },
  // Ice
  "Ice Punch":     { type:"Ice",      category:"phys", power:75,  contact:true },
  // --- Reg M-B meta additions (usage data: pikalytics.com, Reg M-B S3) ------
  "Matcha Gotcha": { type:"Grass",    category:"spec", power:80, spread:true,
                     note:"Heals the user for half the damage dealt" },
  "Spirit Break":  { type:"Fairy",    category:"phys", power:75, contact:true,
                     note:"Lowers the target's SpA" },
  "Drain Punch":   { type:"Fighting", category:"phys", power:75, contact:true,
                     note:"Heals the user for half the damage dealt" },
  "Rage Fist":     { type:"Ghost",    category:"phys", power:50,
                     note:"50 BP + 50 per hit the user has taken (max 350) - scaling NOT modelled" },
  "Play Rough":    { type:"Fairy",    category:"phys", power:90, contact:true },
  "Foul Play":     { type:"Dark",     category:"phys", power:95, contact:true,
                     note:"Uses the TARGET's Attack stat - not modelled, treated as the user's" },
  "Body Press":    { type:"Fighting", category:"phys", power:80, contact:true,
                     note:"Uses the user's Defence as the attacking stat - not modelled" },
  "Volt Switch":   { type:"Electric", category:"spec", power:70 },
  "Hydro Pump":    { type:"Water",    category:"spec", power:110 },
  "Blizzard":      { type:"Ice",      category:"spec", power:110, spread:true },
  "Water Spout":   { type:"Water",    category:"spec", power:150,
                     note:"Scales with the user's remaining HP - not modelled, treated as full" },
  "Population Bomb":{type:"Normal",   category:"phys", power:20, contact:true,
                     note:"Hits up to 10 times" },
  "Psychic Fangs":  {type:"Psychic",  category:"phys", power:85, contact:true,
                     note:"Breaks screens" },
  "Solar Beam":     {type:"Grass",    category:"spec", power:120,
                     note:"Charges for a turn UNLESS the sun is up - which is exactly why Drought Charizard runs it" },

  // --- Edon's team (Team ID QY3XFXCEJA) ------------------------------------
  "Zap Cannon":     {type:"Electric", category:"spec", power:120, accuracy:50,
                     note:"Always paralyses on hit. Coin-flip accurate normally - but NO GUARD makes it certain, which is the whole point of the Mega Raichu Y set" },
  "Focus Blast":    {type:"Fighting", category:"spec", power:120, accuracy:70,
                     note:"Unreliable normally; certain under No Guard" },
  "Head Smash":     {type:"Rock",     category:"phys", power:150, contact:true, accuracy:80,
                     note:"Huge recoil, but Rock Head cancels it entirely" },
  "Extreme Speed":  {type:"Normal",   category:"phys", power:80,  contact:true, priority:2 },
  "Quick Attack":   {type:"Normal",   category:"phys", power:40,  contact:true, priority:1,
                     note:"Becomes a Fairy priority move under Pixilate" },
  "Hyper Beam":     {type:"Normal",   category:"spec", power:150, accuracy:90, recharge:true,
                     note:"The user cannot act at all the following turn. Fairy under Pixilate - a 150 BP nuke, but it hands them a completely free turn" },
  "Stomping Tantrum":{type:"Ground",  category:"phys", power:75, contact:true },
  "Light of Ruin":  {type:"Fairy",    category:"spec", power:140, accuracy:90,
                     note:"Heavy recoil on the user" },
  "Liquidation":    {type:"Water",    category:"phys", power:85,  contact:true },
  "Darkest Lariat": {type:"Dark",     category:"phys", power:85,  contact:true,
                     note:"Ignores the target's stat changes - not modelled" },
  "Twin Beam":      {type:"Psychic",  category:"spec", power:40,
                     note:"Hits twice" },
  "Draining Kiss":  {type:"Fairy",    category:"spec", power:50,  contact:true },
  "Poison Jab":     {type:"Poison",   category:"phys", power:80,  contact:true },
  "Scale Shot":     {type:"Dragon",   category:"phys", power:25,  contact:true,
                     note:"Hits 2-5 times, then +1 Spe / -1 Def" },
  "Rock Tomb":      {type:"Rock",     category:"phys", power:60,  accuracy:95, targetStages:{spe:-1},
                     note:"Lowers the target's Speed by 1" },
  "Muddy Water":    {type:"Water",    category:"spec", power:90,  spread:true, accuracy:85 },
  "U-turn":         {type:"Bug",      category:"phys", power:70,  contact:true,
                     note:"Switches the user out afterwards" },
  "Grass Knot":     {type:"Grass",    category:"spec", power:60,
                     note:"Scales with target weight - not modelled, treated as 60 BP" },
  "Brick Break":    {type:"Fighting", category:"phys", power:75,  contact:true },
  "Freeze-Dry":     {type:"Ice",      category:"spec", power:70,
                     note:"Hits WATER types super-effectively - the type chart here does not model that exception" },
  "Super Fang":     {type:"Normal",   category:"phys", power:1,
                     note:"Halves the target's CURRENT HP - fixed damage, not modelled by the BP formula" },
  "Beat Up":        {type:"Dark",     category:"phys", power:10,
                     note:"One hit per healthy team member - not modelled" },
  "Feint":          {type:"Normal",   category:"phys", power:30, priority:2,
                     note:"Breaks through Protect" },
  "Icicle Spear":   {type:"Ice",      category:"phys", power:25, contact:false,
                     note:"Hits 2-5 times" },
  "Gunk Shot":      {type:"Poison",   category:"phys", power:120, accuracy:80, contact:false },
  "Draco Meteor":   {type:"Dragon",   category:"spec", power:130, accuracy:90, selfStages:{spa:-2},
                     note:"Drops the user's SpA by 2 afterwards" },
  "Aura Sphere":    {type:"Fighting", category:"spec", power:80 },
  "Snarl":          {type:"Dark",     category:"spec", power:55, spread:true,
                     note:"Lowers both foes' SpA" },

  // Psychic / Rock (yours)
  "Psychic":       { type:"Psychic",  category:"spec", power:90 },
  "Power Gem":     { type:"Rock",     category:"spec", power:80 },
  "Earth Power":   { type:"Ground",   category:"spec", power:90 },
};

// Adjust a move's effective power for scaling moves.
export function movePower(move, ctx = {}) {
  if (move.scaling === "last_respects") return 50 + 50 * (ctx.faintedAllies ?? 1);
  return move.power;
}
