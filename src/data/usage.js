// ===========================================================================
// Real usage percentages, Reg M-B S3 ranked DOUBLES ladder (pikalytics.com,
// fetched 2026-08-01).
//
// WHY THIS IS SEPARATE FROM threats.js
// threats.js holds ONE set - the modal build - which is what the app assumes
// until you learn otherwise. This file holds the whole distribution, which is
// what the app reasons over while you are still scouting.
//
// FORMAT: this is doubles data, not singles. Sinistcha's Rage Powder at 99.2%
// and Maushold's Follow Me at 95.4% settle it - both moves do nothing at all
// in a singles battle. Wide Guard, Helping Hand, Coaching and Incineroar's
// 99.9% Fake Out say the same.
//
// BUT it is LADDER data, so it has a long tail of off-meta builds from casual
// players. That is where things like Garchomp's Rock Tomb (8.0%) and Scale
// Shot (3.1%) come from - they are not real competitive doubles options.
// INCLUSION_CUTOFF below exists precisely to strip that tail.
//
// Anything at or above the cutoff is treated as something they might have.
// Anything below is still listed here (so nothing is lost) but is not planned
// around - you can always add it by hand once you have actually seen it.
// ===========================================================================

/** Percent usage at or above which an option is treated as possible. */
export const INCLUSION_CUTOFF = 5;

export const USAGE = {
  garchomp: {
    moves: { "Dragon Claw":89.4, "Rock Slide":82.0, "Earthquake":80.7, "Protect":70.2,
             "Stomping Tantrum":40.3, "Poison Jab":18.3, "Rock Tomb":8.0, "Scale Shot":3.1 },
    items: { "Life Orb":51.5, "Sitrus Berry":13.6, "Choice Scarf":12.7 },
    abilities: { "Rough Skin":98.5, "Sand Veil":1.5 },
    natures: { "Jolly":60.5, "Adamant":38.9 },
  },
  sinistcha: {
    moves: { "Rage Powder":99.2, "Matcha Gotcha":98.8, "Life Dew":58.7, "Trick Room":58.6,
             "Protect":54.5, "Strength Sap":15.1, "Shadow Ball":8.8, "Imprison":2.2 },
    items: { "Sitrus Berry":35.2, "Kasib Berry":30.4, "Colbur Berry":14.3 },
    abilities: { "Hospitality":99.5, "Heatproof":0.5 },
    natures: { "Bold":45.7, "Calm":29.4 },
  },
  basculegion: {
    moves: { "Last Respects":100.0, "Aqua Jet":94.9, "Wave Crash":82.3, "Protect":53.8,
             "Flip Turn":43.1, "Liquidation":17.0, "Psychic Fangs":4.7, "Head Smash":0.6 },
    items: { "Choice Scarf":44.7, "Mystic Water":19.6, "Focus Sash":17.6 },
    abilities: { "Adaptability":93.2, "Swift Swim":6.8 },
    natures: { "Adamant":57.8, "Jolly":41.7 },
  },
  whimsicott: {
    moves: { "Tailwind":98.5, "Moonblast":92.0, "Encore":74.1, "Protect":56.5,
             "Charm":28.0, "Sunny Day":11.9, "Fake Tears":8.6, "Tickle":5.6 },
    items: { "Focus Sash":75.5, "Fairy Feather":11.4, "Mental Herb":3.6 },
    abilities: { "Prankster":99.4, "Chlorophyll":0.5 },
    natures: { "Timid":76.5, "Modest":10.6 },
  },
  kingambit: {
    moves: { "Sucker Punch":99.5, "Kowtow Cleave":97.9, "Iron Head":73.5, "Protect":68.6,
             "Low Kick":43.7, "Swords Dance":15.0, "Brick Break":1.1, "Quick Guard":0.2 },
    items: { "Chople Berry":42.9, "Black Glasses":31.8, "Focus Sash":12.8 },
    abilities: { "Defiant":96.1, "Supreme Overlord":3.9 },
    natures: { "Adamant":88.0, "Brave":10.6 },
  },
  staraptor: {
    moves: { "Close Combat":98.2, "Protect":90.2, "Brave Bird":81.2, "Roost":71.5,
             "Dual Wingbeat":19.4, "Tailwind":11.4, "U-turn":6.2, "Final Gambit":6.2 },
    items: { "Staraptite":94.5, "Choice Scarf":5.4, "Life Orb":0.1 },
    abilities: { "Intimidate":97.1, "Reckless":2.9 },
    natures: { "Jolly":65.2, "Adamant":31.8 },
  },
  incineroar: {
    moves: { "Fake Out":99.9, "Parting Shot":96.8, "Flare Blitz":92.6, "Throat Chop":53.7,
             "Darkest Lariat":29.4, "Protect":9.5, "Will-O-Wisp":3.5, "Taunt":3.4 },
    items: { "Sitrus Berry":59.8, "Chople Berry":15.0, "Passho Berry":12.0 },
    abilities: { "Intimidate":99.8, "Blaze":0.2 },
    natures: { "Careful":40.1, "Impish":25.0 },
  },
  "charizard-y": {
    moves: { "Protect":98.4, "Heat Wave":95.4, "Solar Beam":92.2, "Weather Ball":83.9,
             "Air Slash":6.0, "Dragon Dance":4.2, "Flare Blitz":3.4, "Dragon Claw":3.2 },
    items: { "Charizardite Y":95.4, "Charizardite X":3.9, "Focus Sash":0.2 },
    abilities: { "Blaze":80.5, "Solar Power":19.5 },
    natures: { "Modest":77.0, "Timid":17.8 },
    note: "Abilities listed are the BASE form's - Mega Y has Drought. Charizardite X at 3.9% means a small Mega X contingent with a completely different (physical Fire/Dragon) profile.",
  },
  raichu: {
    moves: { "Fake Out":71.6, "Protect":66.4, "Zap Cannon":60.4, "Focus Blast":56.3,
             "Volt Switch":30.3, "Charm":14.8, "Encore":14.4, "Grass Knot":12.1 },
    items: { "Raichunite Y":60.5, "Raichunite X":18.2, "Focus Sash":14.7 },
    abilities: { "Lightning Rod":98.3, "Static":1.7 },
    natures: { "Timid":69.6, "Jolly":14.0 },
    note: "Abilities listed are the BASE form's - Mega Y has No Guard. Raichunite X at 18.2% is a real physical variant: about one in four Mega Raichu is X.",
  },
  pelipper: {
    moves: { "Hurricane":98.9, "Weather Ball":87.7, "Tailwind":86.5, "Wide Guard":51.2,
             "Protect":42.5, "Muddy Water":6.6, "Rain Dance":6.1, "Helping Hand":5.2 },
    items: { "Focus Sash":45.3, "Sitrus Berry":31.4, "Damp Rock":13.1 },
    abilities: { "Drizzle":100.0 },
    natures: { "Modest":49.9, "Timid":23.1 },
  },
  sneasler: {
    moves: { "Close Combat":99.3, "Fake Out":94.4, "Dire Claw":93.6, "Protect":59.3,
             "Coaching":21.7, "Rock Slide":7.8, "Gunk Shot":3.6, "Feint":3.5 },
    items: { "White Herb":71.1, "Focus Sash":26.0, "Sitrus Berry":0.6 },
    abilities: { "Unburden":88.7, "Poison Touch":11.2 },
    natures: { "Jolly":58.3, "Adamant":38.8 },
  },
  archaludon: {
    moves: { "Electro Shot":96.7, "Flash Cannon":95.2, "Protect":94.3, "Dragon Pulse":73.5,
             "Draco Meteor":21.2, "Aura Sphere":12.7, "Snarl":2.4, "Thunderbolt":2.3 },
    items: { "Leftovers":88.6, "Choice Scarf":2.4, "White Herb":2.0 },
    abilities: { "Stamina":93.4, "Sturdy":5.3 },
    natures: { "Modest":75.1, "Calm":12.5 },
  },
  grimmsnarl: {
    moves: { "Light Screen":87.0, "Parting Shot":82.8, "Reflect":81.8, "Spirit Break":61.9,
             "Fake Out":27.1, "Scary Face":22.0, "Foul Play":12.9, "Fake Tears":7.8 },
    items: { "Light Clay":83.0, "Roseli Berry":9.3, "Sitrus Berry":3.0 },
    abilities: { "Prankster":99.6, "Frisk":0.3 },
    natures: { "Careful":51.1, "Impish":30.1 },
  },
  sylveon: {
    moves: { "Hyper Voice":99.9, "Quick Attack":81.6, "Hyper Beam":71.2, "Detect":61.1,
             "Protect":35.0, "Moonblast":13.1, "Calm Mind":10.5, "Yawn":8.9 },
    items: { "Fairy Feather":89.6, "Life Orb":5.1, "Sitrus Berry":1.5 },
    abilities: { "Pixilate":99.9, "Cute Charm":0.1 },
    natures: { "Modest":81.3, "Quiet":15.7 },
  },
  swampert: {
    moves: { "Protect":94.2, "Wave Crash":88.2, "Earthquake":66.2, "Ice Punch":57.0,
             "High Horsepower":37.2, "Rock Slide":12.2, "Flip Turn":8.7, "Liquidation":7.7 },
    items: { "Swampertite":98.5, "Life Orb":0.7, "Rindo Berry":0.3 },
    abilities: { "Torrent":53.6, "Damp":46.4 },
    natures: { "Adamant":89.9, "Jolly":8.6 },
    note: "Abilities listed are the BASE form's - Mega Swampert has Swift Swim, which doubles its Speed in Pelipper's rain.",
  },
  metagross: {
    moves: { "Protect":89.8, "Psychic Fangs":86.7, "Iron Head":58.7, "Bullet Punch":38.5,
             "Stomping Tantrum":31.8, "Meteor Mash":28.8, "Ice Punch":23.2, "Rock Slide":9.0 },
    items: { "Metagrossite":94.5, "Life Orb":2.3, "Metal Coat":0.8 },
    abilities: { "Clear Body":99.5, "Light Metal":0.5 },
    natures: { "Adamant":50.8, "Jolly":47.7 },
    note: "Abilities listed are the BASE form's - Mega Metagross has Tough Claws.",
  },
  farigiraf: {
    moves: { "Trick Room":95.7, "Psychic":60.7, "Helping Hand":48.9, "Protect":39.1,
             "Thunderbolt":30.3, "Hyper Voice":30.2, "Twin Beam":24.7, "Imprison":13.9 },
    items: { "Sitrus Berry":62.0, "Colbur Berry":24.9, "Mental Herb":4.4 },
    abilities: { "Armor Tail":99.9, "Cud Chew":0.0 },
    natures: { "Bold":33.8, "Modest":18.3 },
  },
  "floette-eternal": {
    moves: { "Protect":99.8, "Dazzling Gleam":97.1, "Moonblast":79.0, "Light of Ruin":58.0,
             "Calm Mind":42.7, "Draining Kiss":19.3, "Psychic":2.6, "Grass Knot":0.3 },
    items: { "Floettite":99.4, "Life Orb":0.4, "Fairy Feather":0.1 },
    abilities: { "Flower Veil":98.9, "Symbiosis":1.1 },
    natures: { "Modest":78.3, "Timid":21.0 },
  },
  gholdengo: {
    moves: { "Make It Rain":99.0, "Shadow Ball":99.0, "Protect":70.9, "Nasty Plot":58.5,
             "Power Gem":27.1, "Trick":17.3, "Thunderbolt":11.4, "Dazzling Gleam":5.8 },
    items: { "Life Orb":37.9, "Choice Scarf":27.1, "Metal Coat":11.3 },
    abilities: { "Good as Gold":100.0 },
    natures: { "Modest":67.5, "Timid":30.7 },
  },
  aerodactyl: {
    moves: { "Rock Slide":99.9, "Tailwind":92.7, "Dual Wingbeat":86.9, "Protect":56.8,
             "Wide Guard":33.6, "Ice Fang":26.0, "Taunt":1.0, "Sunny Day":0.8 },
    items: { "Aerodactylite":61.2, "Focus Sash":34.7, "Passho Berry":1.3 },
    abilities: { "Unnerve":95.7, "Pressure":2.2 },
    natures: { "Jolly":94.7, "Adamant":4.8 },
    note: "Only 61.2% Mega - a substantial 34.7% Focus Sash contingent stays in base form, with base Aerodactyl's much lower stats.",
  },
  maushold: {
    moves: { "Follow Me":95.4, "Protect":89.4, "Super Fang":40.2, "Population Bomb":31.5,
             "Beat Up":31.0, "Encore":24.2, "Taunt":21.8, "Feint":20.8 },
    items: { "Chople Berry":38.7, "Wide Lens":29.4, "Focus Sash":24.2 },
    abilities: { "Friend Guard":73.2, "Technician":26.3 },
    natures: { "Jolly":56.0, "Timid":16.7 },
  },
  annihilape: {
    moves: { "Rage Fist":93.2, "Protect":78.5, "Drain Punch":77.7, "Bulk Up":69.6,
             "Close Combat":23.9, "Coaching":13.0, "Taunt":7.9, "Rock Slide":7.0 },
    items: { "Leftovers":50.7, "Sitrus Berry":17.5, "Choice Scarf":11.4 },
    abilities: { "Defiant":99.3, "Inner Focus":0.5 },
    natures: { "Adamant":52.1, "Jolly":34.8 },
  },
  sableye: {
    moves: { "Rain Dance":78.8, "Light Screen":67.0, "Encore":56.2, "Reflect":52.4,
             "Will-O-Wisp":38.9, "Disable":30.4, "Fake Out":20.5, "Foul Play":17.8 },
    items: { "Roseli Berry":48.0, "Light Clay":41.5, "Sitrus Berry":2.7 },
    abilities: { "Prankster":100.0 },
    natures: { "Careful":30.0, "Calm":20.1 },
    note: "Sablenite is only 0.2% - it is played as BASE Sableye for Prankster, so Magic Bounce never appears.",
  },
  mawile: {
    moves: { "Play Rough":97.2, "Sucker Punch":92.9, "Protect":89.0, "Iron Head":80.8,
             "Swords Dance":17.0, "Rock Slide":12.4 },
    items: { "Mawilite":100.0 },
    abilities: { "Intimidate":71.7, "Hyper Cutter":27.9 },
    natures: { "Brave":53.4, "Adamant":45.3 },
    note: "Mawilite is 100% - every one is Mega. The listed abilities are the BASE form's; Mega Mawile has Huge Power, which doubles its Attack.",
  },
  "ninetales-alola": {
    moves: { "Blizzard":95.2, "Protect":67.4, "Freeze-Dry":63.3, "Aurora Veil":63.1,
             "Moonblast":43.7, "Encore":26.3, "Icy Wind":20.6, "Dazzling Gleam":5.9 },
    items: { "Light Clay":36.6, "Focus Sash":19.8, "Choice Scarf":18.4 },
    abilities: { "Snow Warning":99.9, "Snow Cloak":0.1 },
    natures: { "Timid":82.7, "Modest":16.7 },
  },
};

/** Options at or above the cutoff, most-used first. */
export function likely(record, cutoff = INCLUSION_CUTOFF) {
  if (!record) return [];
  return Object.entries(record)
    .filter(([, pct]) => pct >= cutoff)
    .sort((a, b) => b[1] - a[1])
    .map(([name, pct]) => ({ name, pct }));
}

export function usageFor(speciesId) {
  return USAGE[speciesId] ?? null;
}
