// ===========================================================================
// GENERATED FILE - do not edit by hand.
//
//   node scripts/import-usage.mjs
//
// Source: championsbattledata.com, Doubles Current.
// Fetched: 2026-08-08.
//
// WHY THIS IS SEPARATE FROM threats.js
// threats.js holds ONE set - the modal build - which is what the app assumes
// until you learn otherwise. This file holds the whole distribution, which is
// what the app reasons over while you are still scouting.
//
// FORMAT: doubles, not singles. Sinistcha's Rage Powder and Maushold's Follow
// Me settle it - both moves do nothing at all in a singles battle.
//
// BUT it is LADDER data, so it has a long tail of off-meta builds from casual
// players. INCLUSION_CUTOFF exists precisely to strip that tail: anything at
// or above it is treated as something they might have, anything below is still
// listed here (so nothing is lost) but is not planned around.
//
// `spreads` is the real SP distribution - the thing a hand-transcribed file
// could never carry. Each entry sums to 66, the Champions budget, and `pct`
// is how often that exact spread was seen. A spread whose total is NOT 66 is
// kept with an explicit `total` field rather than dropped.
// ===========================================================================

/** Percent usage at or above which an option is treated as possible. */
export const INCLUSION_CUTOFF = 5;

/** Where this came from, so a stale file is visible rather than assumed fresh. */
export const USAGE_SOURCE = {
  "url": "https://championsbattledata.com/api/battle/Doubles",
  "format": "Doubles",
  "season": "Current",
  "fetchedAt": "2026-08-08",
  "species": 25
};

export const USAGE = {
  garchomp: {
    moves: { "Dragon Claw":85.0, "Earthquake":83.5, "Rock Slide":81.8, "Protect":75.8, "Stomping Tantrum":33.6, "Poison Jab":10.9, "Dragon Tail":4.3, "Iron Head":3.3, "Rock Tomb":3.1, "Swords Dance":2.6 },
    items: { "Life Orb":69.1, "Choice Scarf":10.3, "Sitrus Berry":9.5, "Garchompite":2.6, "Roseli Berry":2.6, "Focus Sash":1.8, "Soft Sand":1.3, "Yache Berry":1.0, "Lum Berry":0.8, "Expert Belt":0.8 },
    abilities: { "Rough Skin":97.3, "Sand Veil":2.7 },
    natures: { "Jolly":66.9, "Adamant":29.1, "Brave":0.9, "Modest":0.8, "Impish":0.4, "Naughty":0.3, "Naive":0.3, "Hasty":0.3, "Careful":0.3, "Lonely":0.3 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:45.2 },
      { sp:{ atk:32, def:1, spd:1, spe:32 }, pct:6.0 },
      { sp:{ atk:32, def:2, spe:32 }, pct:4.8 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:4.3 },
      { sp:{ atk:27, def:7, spe:32 }, pct:3.2 },
      { sp:{ atk:32, spe:32 }, pct:1.4, total:64 },
      { sp:{ atk:30, def:4, spe:32 }, pct:1.2 },
      { sp:{ hp:4, atk:30, spe:32 }, pct:1.1 },
    ],
  },
  sinistcha: {
    moves: { "Matcha Gotcha":98.9, "Rage Powder":95.4, "Protect":60.3, "Trick Room":56.7, "Life Dew":48.2, "Shadow Ball":20.7, "Strength Sap":10.2, "Imprison":2.6, "Scald":1.1, "Psych Up":1.0 },
    items: { "Sitrus Berry":23.1, "Kasib Berry":22.7, "Colbur Berry":19.6, "Leftovers":11.5, "Occa Berry":6.4, "Coba Berry":4.6, "Focus Sash":4.1, "Big Root":2.6, "Bright Powder":1.3, "Miracle Seed":0.7 },
    abilities: { "Hospitality":99.0, "Heatproof":1.0 },
    natures: { "Bold":49.6, "Calm":20.3, "Relaxed":10.6, "Modest":8.8, "Sassy":5.3, "Quiet":2.9, "Timid":1.7, "Mild":0.3, "Gentle":0.1, "Careful":0.1 },
    spreads: [
      { sp:{ hp:32, def:4, spd:30 }, pct:19.3 },
      { sp:{ hp:32, def:14, spd:20 }, pct:12.3 },
      { sp:{ hp:29, def:15, spd:22 }, pct:5.9 },
      { sp:{ hp:32, def:2, spd:32 }, pct:4.8 },
      { sp:{ hp:32, def:32, spd:2 }, pct:2.5 },
      { sp:{ hp:32, def:24, spd:10 }, pct:1.8 },
      { sp:{ hp:31, def:14, spd:21 }, pct:1.6 },
      { sp:{ hp:32, def:2, spa:32 }, pct:1.6 },
    ],
  },
  basculegion: {
    moves: { "Last Respects":99.8, "Aqua Jet":90.0, "Wave Crash":89.0, "Flip Turn":50.6, "Protect":46.6, "Liquidation":9.4, "Psychic Fangs":4.5, "Ice Fang":2.4, "Head Smash":1.1, "Soak":0.9 },
    items: { "Choice Scarf":50.3, "Mystic Water":16.2, "Life Orb":12.5, "Focus Sash":10.5, "Sitrus Berry":6.7, "Colbur Berry":0.7, "Spell Tag":0.6, "Quick Claw":0.5, "Muscle Band":0.3, "Leftovers":0.3 },
    abilities: { "Adaptability":92.5, "Swift Swim":7.1, "Mold Breaker":0.4 },
    natures: { "Adamant":49.5, "Jolly":46.4, "Brave":1.7, "Naughty":0.5, "Lonely":0.5, "Naive":0.4, "Hasty":0.3, "Careful":0.2, "Impish":0.1, "Timid":0.1 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:34.9 },
      { sp:{ atk:32, def:2, spe:32 }, pct:19.2 },
      { sp:{ atk:28, def:14, spe:24 }, pct:3.8 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:3.7 },
      { sp:{ atk:32, def:1, spd:1, spe:32 }, pct:2.5 },
      { sp:{ hp:32, atk:32, def:2 }, pct:1.7 },
      { sp:{ atk:32, spe:32 }, pct:1.7, total:64 },
      { sp:{ hp:4, atk:31, def:11, spe:20 }, pct:1.3 },
    ],
  },
  whimsicott: {
    moves: { "Tailwind":96.4, "Moonblast":87.4, "Encore":66.9, "Protect":46.9, "Charm":23.1, "Sunny Day":13.2, "Energy Ball":7.7, "Fake Tears":7.2, "Taunt":7.1, "Grass Knot":5.6 },
    items: { "Focus Sash":78.1, "Life Orb":5.6, "Fairy Feather":3.7, "Occa Berry":3.0, "Mental Herb":2.4, "Sitrus Berry":2.0, "Coba Berry":1.2, "Leftovers":0.9, "Bright Powder":0.8, "Focus Band":0.4 },
    abilities: { "Prankster":98.7, "Chlorophyll":0.9, "Infiltrator":0.4 },
    natures: { "Timid":73.2, "Modest":17.7, "Bold":3.8, "Calm":3.2, "Quiet":0.5, "Hasty":0.4, "Mild":0.3, "Sassy":0.2, "Jolly":0.2, "Relaxed":0.2 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:50.4 },
      { sp:{ def:2, spa:32, spe:32 }, pct:7.0 },
      { sp:{ spa:32, spd:2, spe:32 }, pct:4.4 },
      { sp:{ hp:14, spa:32, spe:20 }, pct:3.8 },
      { sp:{ hp:32, spa:32, spd:2 }, pct:3.1 },
      { sp:{ hp:32, def:2, spe:32 }, pct:1.2 },
      { sp:{ hp:28, def:32, spe:6 }, pct:1.2 },
      { sp:{ hp:32, spa:23, spd:11 }, pct:1.2 },
    ],
  },
  kingambit: {
    moves: { "Sucker Punch":98.8, "Kowtow Cleave":97.1, "Iron Head":77.0, "Protect":68.4, "Low Kick":32.1, "Swords Dance":19.7, "Brick Break":3.5, "Low Sweep":0.5, "Guillotine":0.3, "Poison Jab":0.3 },
    items: { "Black Glasses":36.8, "Chople Berry":23.2, "Focus Sash":18.4, "Life Orb":13.2, "Occa Berry":3.0, "Expert Belt":1.5, "Sitrus Berry":0.9, "Leftovers":0.7, "Quick Claw":0.4, "Muscle Band":0.4 },
    abilities: { "Defiant":92.2, "Supreme Overlord":7.6, "Pressure":0.2 },
    natures: { "Adamant":82.4, "Brave":13.4, "Jolly":2.0, "Impish":0.5, "Careful":0.5, "Naughty":0.3, "Sassy":0.2, "Relaxed":0.2, "Lonely":0.1, "Lax":0.1 },
    spreads: [
      { sp:{ hp:32, atk:32, spd:2 }, pct:17.3 },
      { sp:{ hp:32, atk:32, def:2 }, pct:9.2 },
      { sp:{ hp:32, atk:32, spe:2 }, pct:7.8 },
      { sp:{ hp:2, atk:32, spe:32 }, pct:6.3 },
      { sp:{ hp:13, atk:25, def:1, spd:1, spe:26 }, pct:5.3 },
      { sp:{ hp:32, atk:32, def:1, spd:1 }, pct:3.0 },
      { sp:{ hp:24, atk:31, def:1, spd:1, spe:9 }, pct:1.6 },
      { sp:{ hp:32, atk:15, def:1, spd:16, spe:2 }, pct:1.5 },
    ],
  },
  staraptor: {
    moves: { "Close Combat":97.7, "Brave Bird":82.5, "Protect":81.8, "Roost":59.5, "Tailwind":24.8, "Dual Wingbeat":16.9, "Final Gambit":13.2, "U-turn":11.5, "Blaze Kick":3.7, "Quick Attack":1.4 },
    items: { "Staraptite":87.0, "Choice Scarf":11.9, "Focus Sash":0.2, "Quick Claw":0.2, "Life Orb":0.1, "Sitrus Berry":0.1, "Sharp Beak":0.1, "White Herb":0.1, "Iron Ball":0.0, "Leftovers":0.0 },
    abilities: { "Intimidate":96.9, "Reckless":3.1 },
    natures: { "Jolly":81.1, "Adamant":14.4, "Careful":1.4, "Impish":0.5, "Naughty":0.4, "Naive":0.4, "Brave":0.4, "Hasty":0.4, "Lonely":0.4, "Timid":0.2 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:16.3 },
      { sp:{ hp:32, atk:2, spe:32 }, pct:15.9 },
      { sp:{ hp:29, atk:1, spd:4, spe:32 }, pct:12.4 },
      { sp:{ hp:23, atk:17, spe:26 }, pct:4.8 },
      { sp:{ hp:32, atk:14, spe:20 }, pct:3.0 },
      { sp:{ hp:32, atk:5, spd:4, spe:25 }, pct:2.1 },
      { sp:{ hp:23, atk:11, spe:32 }, pct:2.0 },
      { sp:{ hp:23, atk:10, spd:1, spe:32 }, pct:1.9 },
    ],
  },
  incineroar: {
    moves: { "Fake Out":99.1, "Parting Shot":91.1, "Flare Blitz":89.6, "Darkest Lariat":50.7, "Throat Chop":29.1, "Protect":13.7, "Helping Hand":7.4, "Close Combat":5.5, "Taunt":4.0, "Will-O-Wisp":2.2 },
    items: { "Sitrus Berry":66.5, "Passho Berry":8.2, "Chople Berry":6.1, "Life Orb":4.9, "Leftovers":4.8, "Charcoal":1.8, "White Herb":1.8, "Shuca Berry":1.4, "Quick Claw":1.2, "Focus Sash":0.6 },
    abilities: { "Intimidate":99.6, "Blaze":0.4 },
    natures: { "Careful":33.7, "Impish":27.2, "Adamant":18.6, "Brave":9.0, "Sassy":3.8, "Relaxed":3.2, "Jolly":2.5, "Naughty":0.4, "Lonely":0.3, "Bold":0.2 },
    spreads: [
      { sp:{ hp:32, def:32, spd:2 }, pct:7.8 },
      { sp:{ hp:32, def:1, spd:10, spe:23 }, pct:5.7 },
      { sp:{ hp:32, def:14, spd:20 }, pct:5.4 },
      { sp:{ hp:32, atk:32, spd:2 }, pct:3.3 },
      { sp:{ hp:32, atk:32, def:2 }, pct:3.2 },
      { sp:{ hp:29, atk:32, def:2, spd:3 }, pct:1.9 },
      { sp:{ hp:32, def:20, spd:14 }, pct:1.7 },
      { sp:{ hp:32, def:4, spd:16, spe:4 }, pct:1.6, total:56 },
    ],
  },
  "charizard-y": {
    moves: { "Protect":95.0, "Heat Wave":94.8, "Solar Beam":86.9, "Weather Ball":76.2, "Air Slash":7.9, "Helping Hand":5.4, "Ancient Power":4.8, "Dragon Pulse":3.6, "Flare Blitz":2.9, "Dragon Claw":2.9 },
    items: { "Charizardite Y":95.4, "Charizardite X":3.6, "Life Orb":0.1, "Choice Scarf":0.1, "Charcoal":0.1, "Focus Sash":0.0, "Sitrus Berry":0.0, "Quick Claw":0.0, "Wide Lens":0.0, "Expert Belt":0.0 },
    abilities: { "Blaze":78.8, "Solar Power":21.2 },
    natures: { "Modest":74.1, "Timid":18.9, "Adamant":3.1, "Jolly":0.8, "Quiet":0.8, "Bold":0.7, "Mild":0.4, "Hasty":0.3, "Calm":0.2, "Naive":0.1 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:23.5 },
      { sp:{ hp:24, def:16, spa:9, spe:17 }, pct:10.2 },
      { sp:{ def:2, spa:32, spe:32 }, pct:4.6 },
      { sp:{ hp:16, def:18, spa:11, spe:21 }, pct:3.3 },
      { sp:{ hp:28, def:24, spa:1, spe:13 }, pct:2.6 },
      { sp:{ spa:32, spd:2, spe:32 }, pct:2.1 },
      { sp:{ hp:20, def:29, spa:1, spe:16 }, pct:2.1 },
      { sp:{ hp:30, def:31, spa:1, spe:4 }, pct:1.7 },
    ],
  },
  raichu: {
    moves: { "Zap Cannon":80.4, "Focus Blast":79.7, "Protect":76.0, "Fake Out":73.5, "Grass Knot":17.2, "Volt Switch":14.3, "Volt Tackle":7.8, "Encore":6.8, "Dazzling Gleam":6.2, "Play Rough":4.5 },
    items: { "Raichunite Y":80.8, "Raichunite X":11.3, "Focus Sash":3.6, "Shuca Berry":0.8, "Magnet":0.7, "Sitrus Berry":0.5, "Life Orb":0.3, "Choice Scarf":0.2, "Quick Claw":0.2, "Expert Belt":0.1 },
    abilities: { "Lightning Rod":96.5, "Static":3.5 },
    natures: { "Timid":71.9, "Modest":14.8, "Jolly":8.9, "Adamant":1.1, "Hasty":1.0, "Naive":0.6, "Bold":0.5, "Mild":0.3, "Rash":0.2, "Quiet":0.1 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:40.0 },
      { sp:{ hp:30, def:13, spe:23 }, pct:7.8 },
      { sp:{ hp:2, atk:32, spe:32 }, pct:7.6 },
      { sp:{ def:2, spa:32, spe:32 }, pct:3.4 },
      { sp:{ hp:32, spa:2, spe:32 }, pct:2.4 },
      { sp:{ hp:31, def:1, spd:5, spe:29 }, pct:1.5 },
      { sp:{ hp:16, def:2, spa:24, spe:24 }, pct:1.3 },
      { sp:{ spa:32, spe:32 }, pct:1.2, total:64 },
    ],
  },
  pelipper: {
    moves: { "Hurricane":97.6, "Tailwind":85.8, "Weather Ball":82.9, "Wide Guard":64.8, "Protect":29.8, "Muddy Water":8.0, "Ice Beam":5.6, "Rain Dance":5.4, "U-turn":4.7, "Helping Hand":3.2 },
    items: { "Sitrus Berry":38.5, "Focus Sash":35.7, "Damp Rock":11.5, "Life Orb":5.0, "Choice Scarf":1.5, "Quick Claw":1.5, "Leftovers":1.3, "Wacan Berry":1.0, "Mystic Water":0.8, "Bright Powder":0.6 },
    abilities: { "Drizzle":99.8, "Rain Dish":0.1, "Keen Eye":0.1 },
    natures: { "Modest":58.9, "Timid":19.7, "Bold":10.0, "Calm":3.9, "Quiet":2.7, "Relaxed":1.1, "Sassy":0.6, "Mild":0.5, "Hasty":0.3, "Jolly":0.2 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:24.8 },
      { sp:{ hp:32, def:1, spa:5, spd:17, spe:11 }, pct:6.0 },
      { sp:{ hp:32, spa:23, spe:11 }, pct:5.4 },
      { sp:{ def:2, spa:32, spe:32 }, pct:3.6 },
      { sp:{ spa:32, spd:2, spe:32 }, pct:3.2 },
      { sp:{ hp:31, def:1, spa:5, spd:18, spe:11 }, pct:1.5 },
      { sp:{ hp:31, def:2, spd:32, spe:1 }, pct:1.5 },
      { sp:{ hp:32, spa:32, spe:2 }, pct:1.5 },
    ],
  },
  sneasler: {
    moves: { "Close Combat":98.3, "Fake Out":94.3, "Dire Claw":78.0, "Protect":48.6, "Poison Jab":18.3, "Quick Guard":17.9, "Rock Slide":9.8, "Coaching":7.0, "Throat Chop":5.3, "Taunt":3.4 },
    items: { "White Herb":53.5, "Focus Sash":33.3, "Life Orb":4.2, "Iron Ball":2.4, "Lum Berry":0.7, "Sitrus Berry":0.6, "Expert Belt":0.6, "Quick Claw":0.4, "King's Rock":0.3, "Mental Herb":0.3 },
    abilities: { "Unburden":60.8, "Poison Touch":38.7, "Pressure":0.5 },
    natures: { "Jolly":62.6, "Adamant":30.8, "Brave":2.3, "Lonely":0.8, "Naive":0.8, "Naughty":0.8, "Hasty":0.7, "Impish":0.3, "Careful":0.2, "Timid":0.1 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:51.9 },
      { sp:{ atk:32, def:2, spe:32 }, pct:13.2 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:7.3 },
      { sp:{ atk:32, spe:32 }, pct:2.4, total:64 },
      { sp:{ hp:4, atk:30, spe:32 }, pct:2.1 },
      { sp:{ atk:32, def:4, spe:30 }, pct:0.9 },
      { sp:{ hp:9, atk:32, def:25 }, pct:0.9 },
      { sp:{ hp:32, atk:32, spe:2 }, pct:0.8 },
    ],
  },
  archaludon: {
    moves: { "Electro Shot":95.1, "Flash Cannon":92.7, "Protect":90.0, "Dragon Pulse":73.0, "Draco Meteor":18.8, "Aura Sphere":13.8, "Thunderbolt":3.7, "Snarl":3.1, "Dark Pulse":1.6, "Steel Beam":1.1 },
    items: { "Leftovers":84.9, "Sitrus Berry":4.2, "Chople Berry":2.1, "White Herb":1.6, "Choice Scarf":1.5, "Life Orb":1.1, "Quick Claw":0.6, "Shell Bell":0.5, "Expert Belt":0.4, "Wise Glasses":0.4 },
    abilities: { "Stamina":95.7, "Sturdy":3.3, "Stalwart":1.0 },
    natures: { "Modest":59.7, "Calm":23.8, "Bold":7.8, "Timid":4.3, "Quiet":2.0, "Sassy":0.8, "Relaxed":0.4, "Mild":0.4, "Rash":0.2, "Hasty":0.1 },
    spreads: [
      { sp:{ hp:32, spa:1, spd:29, spe:4 }, pct:6.5 },
      { sp:{ hp:32, def:1, spa:1, spd:25, spe:7 }, pct:6.1 },
      { sp:{ hp:32, def:1, spa:5, spd:25, spe:3 }, pct:5.1 },
      { sp:{ hp:2, spa:32, spe:32 }, pct:4.0 },
      { sp:{ hp:32, spa:32, spd:2 }, pct:2.9 },
      { sp:{ hp:32, spa:32, spe:2 }, pct:2.1 },
      { sp:{ hp:32, def:2, spa:32 }, pct:2.1 },
      { sp:{ hp:32, def:2, spd:32 }, pct:1.9 },
    ],
  },
  grimmsnarl: {
    moves: { "Parting Shot":88.9, "Reflect":86.0, "Light Screen":86.0, "Spirit Break":64.9, "Fake Out":27.0, "Foul Play":15.2, "Sucker Punch":7.2, "Scary Face":6.4, "Fake Tears":4.0, "Taunt":3.2 },
    items: { "Light Clay":82.0, "Roseli Berry":5.4, "Sitrus Berry":4.1, "Leftovers":1.7, "Black Glasses":1.6, "Focus Sash":0.9, "Life Orb":0.8, "Bright Powder":0.4, "Babiri Berry":0.3, "Mental Herb":0.3 },
    abilities: { "Prankster":99.1, "Pickpocket":0.5, "Frisk":0.4 },
    natures: { "Careful":38.3, "Sassy":20.3, "Impish":18.2, "Adamant":8.2, "Calm":6.9, "Relaxed":2.0, "Brave":1.9, "Bold":1.3, "Jolly":1.3, "Naughty":0.3 },
    spreads: [
      { sp:{ hp:32, def:19, spd:15 }, pct:21.4 },
      { sp:{ hp:32, def:20, spd:14 }, pct:6.9 },
      { sp:{ hp:32, def:16, spd:18 }, pct:4.6 },
      { sp:{ hp:32, def:32, spd:2 }, pct:4.5 },
      { sp:{ hp:31, def:20, spd:15 }, pct:3.8 },
      { sp:{ hp:32, def:17, spd:17 }, pct:2.7 },
      { sp:{ hp:2, def:32, spd:32 }, pct:2.5 },
      { sp:{ hp:32, def:2, spd:32 }, pct:1.7 },
    ],
  },
  sylveon: {
    moves: { "Hyper Voice":99.6, "Quick Attack":75.2, "Hyper Beam":72.7, "Detect":61.6, "Protect":33.1, "Yawn":11.9, "Moonblast":9.0, "Calm Mind":7.4, "Mystical Fire":6.6, "Shadow Ball":6.6 },
    items: { "Fairy Feather":86.4, "Life Orb":3.1, "Leftovers":1.9, "Sitrus Berry":1.8, "Focus Sash":1.6, "Quick Claw":1.1, "Choice Scarf":0.5, "Metronome":0.4, "Wise Glasses":0.3, "Shell Bell":0.2 },
    abilities: { "Pixilate":99.8, "Cute Charm":0.2 },
    natures: { "Modest":78.2, "Quiet":14.7, "Timid":3.2, "Bold":1.7, "Mild":0.5, "Calm":0.5, "Relaxed":0.5, "Sassy":0.2, "Rash":0.1, "Gentle":0.1 },
    spreads: [
      { sp:{ hp:32, def:2, spa:32 }, pct:13.6 },
      { sp:{ hp:18, def:10, spa:21, spe:17 }, pct:9.0 },
      { sp:{ hp:32, spa:32, spe:2 }, pct:7.1 },
      { sp:{ hp:9, def:22, spa:30, spe:5 }, pct:3.4 },
      { sp:{ hp:32, spa:32, spd:2 }, pct:3.3 },
      { sp:{ hp:9, def:22, spa:25, spe:10 }, pct:2.5 },
      { sp:{ hp:2, def:32, spa:32 }, pct:2.1 },
      { sp:{ hp:9, def:22, spa:20, spe:15 }, pct:1.7 },
    ],
  },
  swampert: {
    moves: { "Wave Crash":88.9, "Protect":88.4, "Ice Punch":77.3, "Earthquake":74.9, "High Horsepower":24.5, "Flip Turn":7.4, "Liquidation":6.7, "Rock Slide":6.5, "Knock Off":4.9, "Waterfall":2.6 },
    items: { "Swampertite":95.4, "Leftovers":0.7, "Sitrus Berry":0.7, "Life Orb":0.6, "Rindo Berry":0.5, "Quick Claw":0.3, "Expert Belt":0.2, "Mystic Water":0.2, "Focus Sash":0.2, "Choice Scarf":0.1 },
    abilities: { "Torrent":63.1, "Damp":36.9 },
    natures: { "Adamant":86.0, "Jolly":7.3, "Brave":1.9, "Impish":0.7, "Careful":0.7, "Naughty":0.6, "Lonely":0.6, "Modest":0.5, "Relaxed":0.3, "Sassy":0.2 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:32.8 },
      { sp:{ hp:18, atk:30, spe:18 }, pct:7.8 },
      { sp:{ hp:12, atk:32, spe:22 }, pct:5.4 },
      { sp:{ atk:32, def:2, spe:32 }, pct:2.8 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:2.4 },
      { sp:{ hp:32, atk:32, spd:2 }, pct:1.8 },
      { sp:{ hp:14, atk:32, spe:20 }, pct:1.4 },
      { sp:{ hp:12, atk:20, def:1, spd:1, spe:32 }, pct:1.3 },
    ],
  },
  metagross: {
    moves: { "Psychic Fangs":89.8, "Protect":79.1, "Iron Head":53.1, "Bullet Punch":41.8, "Ice Punch":26.6, "Body Press":22.3, "Stomping Tantrum":21.9, "Meteor Mash":19.5, "Earthquake":7.6, "Hammer Arm":6.2 },
    items: { "Metagrossite":90.4, "Life Orb":2.6, "Leftovers":1.1, "Sitrus Berry":0.9, "Metal Coat":0.6, "Choice Scarf":0.5, "Expert Belt":0.4, "Focus Sash":0.4, "Quick Claw":0.4, "Muscle Band":0.3 },
    abilities: { "Clear Body":99.3, "Light Metal":0.7 },
    natures: { "Adamant":46.7, "Jolly":43.2, "Impish":3.6, "Brave":2.7, "Careful":1.5, "Naughty":0.4, "Sassy":0.4, "Relaxed":0.3, "Lonely":0.2, "Naive":0.2 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:22.6 },
      { sp:{ hp:14, atk:27, spe:25 }, pct:11.4 },
      { sp:{ hp:16, atk:25, spe:25 }, pct:7.9 },
      { sp:{ hp:32, atk:32, spd:2 }, pct:3.3 },
      { sp:{ atk:32, def:2, spe:32 }, pct:3.1 },
      { sp:{ hp:9, atk:32, spe:25 }, pct:2.3 },
      { sp:{ hp:32, atk:32, spe:2 }, pct:2.1 },
      { sp:{ hp:32, atk:32, def:2 }, pct:2.0 },
    ],
  },
  farigiraf: {
    moves: { "Trick Room":95.1, "Psychic":54.4, "Thunderbolt":53.9, "Helping Hand":53.0, "Protect":36.3, "Twin Beam":22.1, "Hyper Voice":16.7, "Imprison":8.7, "Psychic Fangs":7.2, "Roar":5.2 },
    items: { "Sitrus Berry":62.0, "Colbur Berry":21.9, "Mental Herb":4.6, "Leftovers":4.3, "Focus Sash":2.8, "Life Orb":0.9, "Lum Berry":0.4, "Quick Claw":0.4, "Light Clay":0.4, "Bright Powder":0.4 },
    abilities: { "Armor Tail":98.9, "Sap Sipper":0.6, "Cud Chew":0.5 },
    natures: { "Bold":25.8, "Relaxed":22.7, "Quiet":16.7, "Modest":12.9, "Calm":10.0, "Sassy":9.6, "Timid":0.8, "Mild":0.4, "Impish":0.2, "Brave":0.2 },
    spreads: [
      { sp:{ hp:25, def:26, spd:15 }, pct:6.5 },
      { sp:{ hp:17, def:19, spa:10, spd:20 }, pct:4.2 },
      { sp:{ hp:32, def:20, spd:14 }, pct:4.2 },
      { sp:{ hp:29, def:20, spd:17 }, pct:3.5 },
      { sp:{ hp:32, def:2, spa:32 }, pct:3.3 },
      { sp:{ hp:32, spa:32, spd:2 }, pct:2.2 },
      { sp:{ hp:2, def:32, spd:32 }, pct:1.8 },
      { sp:{ hp:32, def:27, spd:7 }, pct:1.6 },
    ],
  },
  "floette-eternal": {
    moves: { "Protect":97.5, "Dazzling Gleam":93.1, "Moonblast":71.5, "Light of Ruin":52.7, "Calm Mind":47.1, "Draining Kiss":24.9, "Psychic":4.0, "Giga Drain":2.5, "Energy Ball":1.9, "Helping Hand":1.0 },
    items: { "Floettite":99.0, "Choice Scarf":0.4, "Fairy Feather":0.2, "Life Orb":0.0, "Focus Sash":0.0, "Sitrus Berry":0.0, "Leftovers":0.0, "Shell Bell":0.0, "Expert Belt":0.0, "Babiri Berry":0.0 },
    abilities: { "Flower Veil":98.7, "Symbiosis":1.3 },
    natures: { "Modest":67.0, "Timid":29.5, "Bold":2.5, "Quiet":0.6, "Calm":0.1, "Jolly":0.1, "Relaxed":0.1, "Naive":0.0, "Mild":0.0, "Sassy":0.0 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:32.3 },
      { sp:{ def:2, spa:32, spe:32 }, pct:3.7 },
      { sp:{ hp:8, def:1, spa:25, spe:32 }, pct:3.4 },
      { sp:{ hp:10, def:19, spa:5, spe:32 }, pct:3.4 },
      { sp:{ hp:31, def:14, spe:21 }, pct:3.1 },
      { sp:{ hp:4, def:25, spa:5, spe:32 }, pct:1.5 },
      { sp:{ hp:32, def:2, spa:32 }, pct:1.4 },
      { sp:{ hp:1, def:1, spa:32, spe:32 }, pct:1.4 },
    ],
  },
  gholdengo: {
    moves: { "Make It Rain":98.9, "Shadow Ball":97.3, "Protect":81.8, "Nasty Plot":66.1, "Power Gem":22.8, "Thunderbolt":9.9, "Trick":5.1, "Focus Blast":4.7, "Dazzling Gleam":3.9, "Recover":1.8 },
    items: { "Life Orb":55.3, "Choice Scarf":12.1, "White Herb":6.5, "Focus Sash":6.0, "Spell Tag":5.1, "Metal Coat":3.3, "Leftovers":3.1, "Sitrus Berry":2.9, "Expert Belt":1.5, "Wise Glasses":0.9 },
    abilities: { "Good as Gold":100.0 },
    natures: { "Modest":80.9, "Timid":15.1, "Quiet":1.5, "Bold":0.8, "Calm":0.5, "Mild":0.5, "Hasty":0.2, "Relaxed":0.1, "Sassy":0.1, "Jolly":0.1 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:23.9 },
      { sp:{ hp:27, def:24, spd:5, spe:10 }, pct:14.8 },
      { sp:{ hp:27, def:13, spd:16, spe:10 }, pct:4.2 },
      { sp:{ hp:29, def:1, spa:27, spe:9 }, pct:4.1 },
      { sp:{ hp:17, spa:17, spe:32 }, pct:3.8 },
      { sp:{ hp:1, def:2, spa:32, spe:31 }, pct:2.7 },
      { sp:{ hp:7, spa:27, spe:32 }, pct:2.4 },
      { sp:{ hp:32, spa:32, spd:2 }, pct:2.0 },
    ],
  },
  aerodactyl: {
    moves: { "Rock Slide":98.5, "Tailwind":90.7, "Dual Wingbeat":70.8, "Ice Fang":44.8, "Wide Guard":42.8, "Protect":30.1, "Taunt":6.8, "Earthquake":2.7, "Psychic Fangs":1.9, "Iron Head":1.7 },
    items: { "Aerodactylite":57.6, "Focus Sash":32.6, "King's Rock":1.6, "Life Orb":1.2, "Wide Lens":1.2, "Sitrus Berry":1.2, "Hard Stone":0.7, "Quick Claw":0.5, "Expert Belt":0.4, "Leftovers":0.4 },
    abilities: { "Unnerve":94.7, "Pressure":3.1, "Rock Head":2.2 },
    natures: { "Jolly":87.6, "Adamant":9.2, "Naive":0.7, "Hasty":0.6, "Naughty":0.4, "Lonely":0.4, "Impish":0.4, "Careful":0.2, "Timid":0.2, "Brave":0.1 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:41.5 },
      { sp:{ hp:28, atk:11, def:9, spd:1, spe:17 }, pct:11.6 },
      { sp:{ hp:22, atk:12, spe:32 }, pct:6.9 },
      { sp:{ atk:32, def:2, spe:32 }, pct:6.6 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:4.8 },
      { sp:{ hp:15, atk:17, spd:5, spe:29 }, pct:1.9 },
      { sp:{ hp:12, atk:21, def:1, spe:32 }, pct:1.0 },
      { sp:{ hp:12, atk:22, spe:32 }, pct:0.8 },
    ],
  },
  maushold: {
    moves: { "Follow Me":86.7, "Protect":78.8, "Population Bomb":58.1, "Feint":37.7, "Super Fang":33.9, "Taunt":21.7, "Encore":17.7, "Helping Hand":11.9, "Beat Up":10.8, "Bite":5.0 },
    items: { "Wide Lens":44.8, "Chople Berry":24.0, "Focus Sash":17.5, "Sitrus Berry":4.8, "King's Rock":3.3, "Silk Scarf":1.1, "Leftovers":1.0, "Choice Scarf":0.6, "Bright Powder":0.6, "Mental Herb":0.5 },
    abilities: { "Friend Guard":54.4, "Technician":44.9, "Cheek Pouch":0.7 },
    natures: { "Jolly":63.9, "Impish":12.5, "Timid":8.4, "Adamant":7.4, "Careful":2.4, "Bold":2.0, "Brave":0.6, "Calm":0.6, "Naive":0.5, "Naughty":0.4 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:35.8 },
      { sp:{ hp:32, def:2, spe:32 }, pct:10.7 },
      { sp:{ hp:32, def:20, spd:14 }, pct:7.5 },
      { sp:{ atk:32, def:2, spe:32 }, pct:4.2 },
      { sp:{ hp:32, def:1, spd:1, spe:32 }, pct:3.2 },
      { sp:{ atk:32, spe:32 }, pct:1.6, total:64 },
      { sp:{ hp:32, atk:2, spe:32 }, pct:1.1 },
      { sp:{ hp:32, def:32, spd:2 }, pct:1.0 },
    ],
  },
  annihilape: {
    moves: { "Protect":69.7, "Rage Fist":63.8, "Drain Punch":53.0, "Close Combat":44.4, "Bulk Up":33.4, "Phantom Force":31.3, "Rock Tomb":21.4, "Ice Punch":20.0, "Rock Slide":11.5, "U-turn":8.7 },
    items: { "Leftovers":25.0, "Focus Sash":24.6, "Choice Scarf":15.6, "Sitrus Berry":15.6, "Expert Belt":9.9, "Life Orb":3.1, "Lum Berry":1.6, "Roseli Berry":1.4, "Muscle Band":1.1, "Quick Claw":1.1 },
    abilities: { "Defiant":96.8, "Inner Focus":2.4, "Vital Spirit":0.8 },
    natures: { "Adamant":53.1, "Jolly":33.6, "Careful":6.1, "Brave":2.6, "Impish":2.2, "Naughty":0.5, "Lonely":0.5, "Sassy":0.3, "Relaxed":0.2, "Naive":0.2 },
    spreads: [
      { sp:{ hp:2, atk:32, spe:32 }, pct:19.4 },
      { sp:{ atk:32, def:1, spd:1, spe:32 }, pct:14.5 },
      { sp:{ hp:32, atk:32, def:2 }, pct:5.0 },
      { sp:{ atk:32, def:2, spe:32 }, pct:3.5 },
      { sp:{ hp:32, atk:32, spe:2 }, pct:3.4 },
      { sp:{ hp:13, atk:25, spe:28 }, pct:2.4 },
      { sp:{ atk:32, spd:2, spe:32 }, pct:1.9 },
      { sp:{ hp:23, atk:15, def:15, spd:10, spe:3 }, pct:1.1 },
    ],
  },
  sableye: {
    moves: { "Encore":55.9, "Rain Dance":49.4, "Light Screen":48.0, "Will-O-Wisp":39.1, "Reflect":36.7, "Fake Out":29.8, "Disable":25.9, "Foul Play":23.8, "Quash":22.6, "Sunny Day":9.6 },
    items: { "Light Clay":32.5, "Roseli Berry":26.4, "Sitrus Berry":11.1, "Focus Sash":7.0, "Leftovers":4.7, "Sablenite":4.6, "Wide Lens":3.7, "Bright Powder":2.2, "Mental Herb":2.1, "Damp Rock":1.2 },
    abilities: { "Prankster":99.6, "Keen Eye":0.3, "Stall":0.1 },
    natures: { "Careful":32.2, "Sassy":17.5, "Calm":14.6, "Impish":13.6, "Bold":8.2, "Relaxed":6.7, "Adamant":2.2, "Jolly":1.7, "Brave":1.0, "Timid":0.8 },
    spreads: [
      { sp:{ hp:32, def:9, spd:25 }, pct:24.9 },
      { sp:{ hp:32, def:2, spd:32 }, pct:12.0 },
      { sp:{ hp:2, def:32, spd:32 }, pct:6.3 },
      { sp:{ hp:32, def:32, spd:2 }, pct:5.4 },
      { sp:{ hp:32, def:17, spd:17 }, pct:5.1 },
      { sp:{ hp:32, def:19, spd:15 }, pct:2.5 },
      { sp:{ hp:32, def:12, spd:22 }, pct:1.9 },
      { sp:{ hp:32, def:5, spd:29 }, pct:1.7 },
    ],
  },
  mawile: {
    moves: { "Play Rough":97.6, "Sucker Punch":91.4, "Protect":78.7, "Iron Head":51.0, "Rock Slide":45.6, "Swords Dance":17.0, "Knock Off":6.7, "Brick Break":5.0, "Thunder Punch":1.7, "Psychic Fangs":1.2 },
    items: { "Mawilite":99.3, "Life Orb":0.1, "Mental Herb":0.1, "Sitrus Berry":0.1, "Quick Claw":0.0, "Fairy Feather":0.0, "Focus Sash":0.0, "Muscle Band":0.0, "Occa Berry":0.0, "Focus Band":0.0 },
    abilities: { "Hyper Cutter":50.7, "Intimidate":47.6, "Sheer Force":1.7 },
    natures: { "Brave":66.0, "Adamant":31.1, "Careful":0.6, "Sassy":0.6, "Naughty":0.3, "Jolly":0.3, "Relaxed":0.3, "Impish":0.3, "Serious":0.1, "Lonely":0.1 },
    spreads: [
      { sp:{ hp:32, atk:32, spd:2 }, pct:49.3 },
      { sp:{ hp:32, atk:32, def:2 }, pct:18.1 },
      { sp:{ hp:32, atk:6, def:4, spd:23, spe:1 }, pct:3.4 },
      { sp:{ hp:32, atk:32, def:1, spd:1 }, pct:2.8 },
      { sp:{ hp:32, atk:32, spe:2 }, pct:1.7 },
      { sp:{ hp:2, atk:32, def:32 }, pct:1.3 },
      { sp:{ hp:2, atk:32, spd:32 }, pct:1.1 },
      { sp:{ hp:32, atk:32 }, pct:1.1, total:64 },
    ],
  },
  "ninetales-alola": {
    moves: { "Blizzard":94.2, "Freeze-Dry":72.5, "Protect":65.8, "Aurora Veil":57.0, "Moonblast":32.4, "Encore":29.1, "Dazzling Gleam":10.6, "Icy Wind":6.6, "Disable":5.0, "Roar":4.7 },
    items: { "Never-Melt Ice":35.8, "Light Clay":24.0, "Focus Sash":20.2, "Choice Scarf":7.5, "Life Orb":3.0, "Sitrus Berry":2.0, "Icy Rock":1.2, "Leftovers":0.9, "Occa Berry":0.9, "Quick Claw":0.7 },
    abilities: { "Snow Warning":99.0, "Snow Cloak":1.0 },
    natures: { "Timid":81.4, "Modest":13.4, "Bold":1.5, "Mild":1.0, "Calm":0.9, "Quiet":0.6, "Hasty":0.6, "Relaxed":0.1, "Naive":0.1, "Sassy":0.1 },
    spreads: [
      { sp:{ hp:2, spa:32, spe:32 }, pct:34.4 },
      { sp:{ hp:1, def:1, spa:32, spe:32 }, pct:8.8 },
      { sp:{ def:2, spa:32, spe:32 }, pct:7.0 },
      { sp:{ spa:32, spd:2, spe:32 }, pct:4.9 },
      { sp:{ hp:9, def:11, spa:19, spe:27 }, pct:3.3 },
      { sp:{ spa:32, spe:32 }, pct:1.6, total:64 },
      { sp:{ hp:1, spa:32, spd:1, spe:32 }, pct:1.3 },
      { sp:{ hp:32, spa:2, spe:32 }, pct:1.1 },
    ],
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

/**
 * The SP spreads actually seen for this species, most-used first.
 *
 * Empty when the species has no imported data, which callers must treat as
 * "no information" rather than "no spreads exist" - the difference decides
 * whether an inference is allowed to narrow anything.
 */
export function spreadsFor(speciesId) {
  return USAGE[speciesId]?.spreads ?? [];
}
