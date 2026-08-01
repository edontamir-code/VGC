// ===========================================================================
// Pokémon Champions damage engine (Regulation M-B)
// Ported from a Python reference that was cross-checked against in-game stats.
// Level 50, IVs fixed at 31, Stat Points (SP): 0–32 per stat, 66 total.
// Gimmick: Mega Evolution only (no Tera / Dynamax in Reg M-B).
// ===========================================================================
import { typeMult } from "./typechart.js";

// --- Champions stat formula (L50, 31 IVs baked in) -------------------------
//   HP    = Base + 75 + SP
//   Other = floor((Base + 20 + SP) * Nature)      Nature ∈ {1.1, 1.0, 0.9}
export function statHP(base, sp)        { return base + 75 + sp; }
export function statOther(base, sp, nat){ return Math.floor((base + 20 + sp) * nat); }

// Nature helper: returns {atk,def,spa,spd,spe} multipliers from "+X -Y".
const STAT_KEYS = ["atk","def","spa","spd","spe"];
export function natureMults(plus, minus) {
  const m = {atk:1, def:1, spa:1, spd:1, spe:1};
  if (plus  && STAT_KEYS.includes(plus))  m[plus]  = 1.1;
  if (minus && STAT_KEYS.includes(minus)) m[minus] = 0.9;
  return m;
}

// Compute a full stat line from base stats + SP spread + nature.
// base/sp: {hp,atk,def,spa,spd,spe}; nature: {plus, minus} using atk/def/spa/spd/spe
export function computeStats(base, sp, nature = {}) {
  const nm = natureMults(nature.plus, nature.minus);
  return {
    hp:  statHP(base.hp,  sp.hp ?? 0),
    atk: statOther(base.atk, sp.atk ?? 0, nm.atk),
    def: statOther(base.def, sp.def ?? 0, nm.def),
    spa: statOther(base.spa, sp.spa ?? 0, nm.spa),
    spd: statOther(base.spd, sp.spd ?? 0, nm.spd),
    spe: statOther(base.spe, sp.spe ?? 0, nm.spe),
  };
}

// Pokémon "round half down" used on damage modifiers.
export function pokeRound(x) {
  return (x - Math.floor(x)) <= 0.5 ? Math.floor(x) : Math.floor(x) + 1;
}

// ---------------------------------------------------------------------------
// Damage. Returns { min, max, minPct, maxPct, typeMult, koChance }.
// Set opts to model the field. `attackStat`/`defStat` are already-computed stats.
// ---------------------------------------------------------------------------
export function calcDamage({
  power,               // move base power (after any Last-Respects style scaling)
  moveType,            // e.g. "Fire"
  category,            // "phys" | "spec"
  attackerTypes,       // ["Fire","Flying"]
  defenderTypes,       // ["Grass","Fairy"]
  attackStat,          // number (already computed Atk or SpA)
  defStat,             // number (already computed Def or SpD)
  defHP,               // number (defender max HP)
  spread = false,      // doubles spread move → x0.75
  weather = null,      // "sun" | "rain" | null
  stabMult = 1.5,      // 2.0 if Adaptability
  hasSTAB = null,      // override; else auto from attackerTypes.includes(moveType)
  lifeOrb = false,     // x1.3
  toughClaws = false,  // contact move x1.3 (pass true only for contact moves)
  screen = false,      // Reflect/Light Screen halves in doubles → x0.667 (0.5 in singles)
  singles = false,     // affects screen multiplier
  otherMult = 1.0,     // catch-all (items like Fairy Feather 1.2, Pixilate 1.2, berries 0.5, etc.)
  immune = false,      // ability immunity (e.g. Levitate vs Ground) → 0 damage
}) {
  const tm = immune ? 0 : typeMult(moveType, defenderTypes);
  if (tm === 0 || power <= 0) {
    return { min:0, max:0, minPct:0, maxPct:0, typeMult:0, koChance:"immune/none" };
  }
  const L = 50;
  let base = Math.floor(Math.floor(Math.floor((2*L/5 + 2) * power * attackStat / defStat) / 50) + 2);

  let mod = base;
  if (spread) mod = pokeRound(mod * 0.75);
  if (weather === "sun")  { if (moveType==="Fire")  mod = pokeRound(mod*1.5); if (moveType==="Water") mod = pokeRound(mod*0.5); }
  if (weather === "rain") { if (moveType==="Water") mod = pokeRound(mod*1.5); if (moveType==="Fire")  mod = pokeRound(mod*0.5); }

  const stab = (hasSTAB ?? attackerTypes.includes(moveType)) ? stabMult : 1.0;

  const rolls = [];
  for (let r = 85; r <= 100; r++) {
    let d = Math.floor(mod * r / 100);
    if (stab !== 1.0)       d = pokeRound(d * stab);
    d = Math.floor(d * tm);
    if (lifeOrb)            d = pokeRound(d * 5324 / 4096);   // 1.3
    if (toughClaws)         d = pokeRound(d * 5324 / 4096);   // 1.3
    if (screen)             d = pokeRound(d * (singles ? 0.5 : 2732/4096)); // 0.667 in doubles
    if (otherMult !== 1.0)  d = pokeRound(d * otherMult);
    rolls.push(Math.max(1, d));
  }
  const min = rolls[0], max = rolls[rolls.length - 1];
  const koCount = rolls.filter(d => d >= defHP).length;
  let koChance;
  if (min >= defHP)      koChance = "guaranteed KO";
  else if (max < defHP)  koChance = "guaranteed survive";
  else                   koChance = `${Math.round(100*koCount/16)}% to KO`;

  return {
    min, max,
    minPct: +(100*min/defHP).toFixed(1),
    maxPct: +(100*max/defHP).toFixed(1),
    typeMult: tm,
    koChance,
  };
}

// Held items that boost a specific move type by 1.2x.
export const ITEM_TYPE_BOOST = {
  "Black Glasses":"Dark", "Fairy Feather":"Fairy", "Charcoal":"Fire",
  "Mystic Water":"Water", "Magnet":"Electric", "Miracle Seed":"Grass",
  "Never-Melt Ice":"Ice", "Sharp Beak":"Flying", "Poison Barb":"Poison",
  "Soft Sand":"Ground", "Hard Stone":"Rock", "Silver Powder":"Bug",
  "Spell Tag":"Ghost", "Dragon Fang":"Dragon", "Metal Coat":"Steel",
  "Twisted Spoon":"Psychic", "Black Belt":"Fighting", "Silk Scarf":"Normal",
};

// Convenience: given an attacker record + a defender record + a move, calc.
// (See data/*.js for record shapes.) This is what the UI calls per matchup.
export function matchup(attacker, defender, move, field = {}) {
  const aStats = attacker.stats ?? computeStats(attacker.base, attacker.sp, attacker.nature);
  const dStats = defender.stats ?? computeStats(defender.base, defender.sp, defender.nature);
  const category = move.category;
  // field.atkMult lets the UI model Intimidate (0.667), Swords Dance (2.0), etc.
  const atkMult = field.atkMult ?? 1;
  const attackStat = Math.floor((category === "phys" ? aStats.atk : aStats.spa) * atkMult);
  const defStat    = category === "phys" ? dStats.def : dStats.spd;

  // ability-driven type change (Pixilate/Aerilate/Refrigerate/Galvanize on Normal moves)
  let moveType = move.type;
  let power = move.power;
  let otherMult = move.otherMult ?? 1.0;

  // Weather Ball: Normal/50 normally; becomes the weather's type at 100 BP in weather.
  if (move.weatherBall) {
    const w = field.weather ?? attacker.setsWeather ?? null;
    const map = { sun:"Fire", rain:"Water", sand:"Rock", snow:"Ice" };
    if (w && map[w]) { moveType = map[w]; power = 100; }
    else { moveType = "Normal"; power = 50; }
  }

  if (attacker.ability === "Pixilate" && moveType === "Normal") { moveType = "Fairy"; otherMult *= 1.2; }

  // Type-boosting held items (Fairy Feather, Black Glasses, ...) → 1.2x
  if (ITEM_TYPE_BOOST[attacker.item] === moveType) otherMult *= 1.2;

  const immune = (defender.immuneTypes ?? []).includes(moveType);

  return calcDamage({
    power,
    moveType,
    category,
    attackerTypes: attacker.types,
    defenderTypes: defender.types,
    attackStat, defStat, defHP: dStats.hp,
    spread: !!move.spread && !field.singles,
    weather: field.weather ?? attacker.setsWeather ?? null,
    stabMult: attacker.ability === "Adaptability" ? 2.0 : 1.5,
    lifeOrb: attacker.item === "Life Orb",
    toughClaws: attacker.ability === "Tough Claws" && !!move.contact,
    screen: !!field.screen,
    singles: !!field.singles,
    otherMult,
    immune,
  });
}
