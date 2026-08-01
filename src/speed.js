// ===========================================================================
// Speed / turn order (Reg M-B doubles). Deterministic given known stats + field.
// This answers "do I outspeed X right now, and who moves first."
// ===========================================================================

// Stat-stage multiplier (-6..+6), used for Icy Wind / Electroweb drops, boosts.
export function stageMult(stage) {
  return stage >= 0 ? (2 + stage) / 2 : 2 / (2 - stage);
}

// Effective in-battle speed for one mon given the field.
// mon: { spe (computed Spe stat), item, ability, status, side, stages:{spe}, unburdened }
// field: { tailwind:[sides...], trickRoom:bool, weather }
export function effectiveSpeed(mon, field = {}) {
  let s = mon.spe;
  s = Math.floor(s * stageMult(mon.stages?.spe ?? 0));
  const w = field.weather;
  if ((mon.ability === "Swift Swim"  && w === "rain") ||
      (mon.ability === "Chlorophyll" && w === "sun")  ||
      (mon.ability === "Sand Rush"   && w === "sand") ||
      (mon.ability === "Slush Rush"  && w === "snow")) s = Math.floor(s * 2);
  if (mon.ability === "Unburden" && mon.unburdened) s = Math.floor(s * 2);
  if (mon.item === "Choice Scarf") s = Math.floor(s * 1.5);
  if (field.tailwind && field.tailwind.includes(mon.side)) s = Math.floor(s * 2);
  if (mon.status === "par") s = Math.floor(s * 0.5);
  return s;
}

// Who acts first between two mons, assuming equal move priority.
// Returns { first:"a"|"b"|"tie", aSpeed, bSpeed }.
export function faster(a, b, field = {}) {
  const sa = effectiveSpeed(a, field), sb = effectiveSpeed(b, field);
  if (sa === sb) return { first: "tie", aSpeed: sa, bSpeed: sb };
  const aFirst = field.trickRoom ? sa < sb : sa > sb;   // Trick Room: slower goes first
  return { first: aFirst ? "a" : "b", aSpeed: sa, bSpeed: sb };
}

// Full turn order for any number of actions.
// actions: [{ id, mon, priority }]  (priority default 0; Prankster status +1, etc.)
// Sorts by priority bracket, then speed (reversed under Trick Room). Flags ties.
export function turnOrder(actions, field = {}) {
  const withSpeed = actions.map(a => ({
    ...a,
    priority: a.priority ?? 0,
    speed: effectiveSpeed(a.mon, field),
  }));
  withSpeed.sort((x, y) => {
    if (x.priority !== y.priority) return y.priority - x.priority;       // higher priority first
    if (x.speed === y.speed) return 0;                                   // tie (order unresolved)
    return field.trickRoom ? x.speed - y.speed : y.speed - x.speed;      // TR reverses
  });
  // mark ties (same priority & speed as a neighbor)
  for (let i = 0; i < withSpeed.length; i++) {
    const a = withSpeed[i];
    a.tie = withSpeed.some((b, j) => j !== i && b.priority === a.priority && b.speed === a.speed);
  }
  return withSpeed;
}

// Speed benchmarks for a mon across common field states (for a speed-tier table).
export function benchmarks(mon) {
  const base  = effectiveSpeed(mon, {});
  return {
    base,
    scarf:     effectiveSpeed({ ...mon, item: "Choice Scarf" }, {}),
    tailwind:  effectiveSpeed({ ...mon, side: "me" }, { tailwind: ["me"] }),
    minus1:    effectiveSpeed({ ...mon, stages: { spe: -1 } }, {}),   // after one Icy Wind
    paralyzed: effectiveSpeed({ ...mon, status: "par" }, {}),
  };
}
