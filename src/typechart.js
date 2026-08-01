// Full 18-type effectiveness chart. CHART[attacking][defending] = multiplier.
// Champions uses the standard modern type chart.
export const TYPES = ["Normal","Fire","Water","Electric","Grass","Ice","Fighting","Poison",
  "Ground","Flying","Psychic","Bug","Rock","Ghost","Dragon","Dark","Steel","Fairy"];

const C = {};
for (const a of TYPES) { C[a] = {}; for (const d of TYPES) C[a][d] = 1; }
const set = (a, pairs) => Object.assign(C[a], pairs);

set("Normal",   {Rock:.5, Ghost:0, Steel:.5});
set("Fire",     {Fire:.5, Water:.5, Grass:2, Ice:2, Bug:2, Rock:.5, Dragon:.5, Steel:2});
set("Water",    {Fire:2, Water:.5, Grass:.5, Ground:2, Rock:2, Dragon:.5});
set("Electric", {Water:2, Electric:.5, Grass:.5, Ground:0, Flying:2, Dragon:.5});
set("Grass",    {Fire:.5, Water:2, Grass:.5, Poison:.5, Ground:2, Flying:.5, Bug:.5, Rock:2, Dragon:.5, Steel:.5});
set("Ice",      {Fire:.5, Water:.5, Grass:2, Ice:.5, Ground:2, Flying:2, Dragon:2, Steel:.5});
set("Fighting", {Normal:2, Ice:2, Poison:.5, Flying:.5, Psychic:.5, Bug:.5, Rock:2, Ghost:0, Dark:2, Steel:2, Fairy:.5});
set("Poison",   {Grass:2, Poison:.5, Ground:.5, Rock:.5, Ghost:.5, Steel:0, Fairy:2});
set("Ground",   {Fire:2, Electric:2, Grass:.5, Poison:2, Flying:0, Bug:.5, Rock:2, Steel:2});
set("Flying",   {Electric:.5, Grass:2, Fighting:2, Bug:2, Rock:.5, Steel:.5});
set("Psychic",  {Fighting:2, Poison:2, Psychic:.5, Dark:0, Steel:.5});
set("Bug",      {Fire:.5, Grass:2, Fighting:.5, Poison:.5, Flying:.5, Psychic:2, Ghost:.5, Dark:2, Steel:.5, Fairy:.5});
set("Rock",     {Fire:2, Ice:2, Fighting:.5, Ground:.5, Flying:2, Bug:2, Steel:.5});
set("Ghost",    {Normal:0, Psychic:2, Ghost:2, Dark:.5});
set("Dragon",   {Dragon:2, Steel:.5, Fairy:0});
set("Dark",     {Fighting:.5, Psychic:2, Ghost:2, Dark:.5, Fairy:.5});
set("Steel",    {Fire:.5, Water:.5, Electric:.5, Ice:2, Rock:2, Steel:.5, Fairy:2});
set("Fairy",    {Fire:.5, Fighting:2, Poison:.5, Dragon:2, Dark:2, Steel:.5});

export const CHART = C;

// Product of effectiveness across a defender's (1 or 2) types.
export function typeMult(moveType, defTypes) {
  return defTypes.reduce((m, d) => m * CHART[moveType][d], 1);
}
