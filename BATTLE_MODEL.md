# Battle Model — the live turn-by-turn assistant

This is the centerpiece the user wants: not just a static calc, but a **live doubles
battle tracker** that holds the board state and, each turn, deterministically answers
"if I click X, do I outspeed and KO — yes or no?"

The verified engine (`src/engine.js`) and speed engine (`src/speed.js`) are the math.
This doc specifies the **state model, the turn loop, and the decision resolver** to build
on top of them.

## The board (doubles = 2 active per side)
```
BattleState {
  turn: number,
  sides: {
    me:  { active: [MonState, MonState], bench: [MonState...] },
    opp: { active: [MonState, MonState], bench: [MonState...] },
  },
  field: {
    weather:  { kind: "sun"|"rain"|"sand"|"snow"|null, turnsLeft: number },
    terrain:  { kind, turnsLeft } | null,
    trickRoom: turnsLeft,                    // 0 = off
    tailwind:  { me: turnsLeft, opp: turnsLeft },
    screens:   { me:{reflect,lightScreen,auroraVeil}, opp:{...} },  // turnsLeft each
    gravity: turnsLeft,
  },
  log: TurnRecord[],
}
```

`MonState` (per Pokémon on the field or benched):
```
MonState {
  set: MonSet,            // editable — see below
  maxHP, curHP,          // curHP tracked exactly or as % (user can enter either)
  statStages: {atk,def,spa,spd,spe,acc,eva},
  status: "par"|"brn"|"psn"|"slp"|"frz"|null,
  itemActive: bool,      // false after Sitrus/Focus Sash/etc. consumed
  hasMega: bool,         // toggled the turn it Mega-evolves (swaps to Mega stats/type/ability)
  unburdened: bool,      // Unburden speed doubling armed
  revealed: { moves:Set, item:bool, ability:bool },  // scouting progress
}
```

## Editable sets + scouting (the Weather Ball point)
- **Every set is editable.** Char Y usually runs **Weather Ball**, not Overheat — the
  user must be able to swap a move, item, ability, nature, or SP spread inline and have
  every calc update. `threats.js` provides the *default* common set; it is a starting
  point, not a lock.
- **Opponent mons begin as "assumed common set"** and get **confirmed** as the user
  observes moves/items in-game. Show assumed vs confirmed differently (e.g. dimmed vs
  solid), so the user knows which numbers are speculative. When a move is revealed,
  lock it in; when an item procs (Sitrus, Sash, berry), mark `itemActive=false`.
- Weather is **tracked on the field**, not per-calc: if Char Y is out with Drought,
  sun is up and Weather Ball is Fire/100 automatically. The turn tracker owns weather;
  calcs read it. (Engine already does this via `field.weather` / `setsWeather`.)

## The turn loop
Each turn the user either (a) plans (before committing) or (b) records what happened:
1. Pick actions for the active mons (yours to plan; theirs to record/predict).
2. `turnOrder(actions, field)` (from `speed.js`) resolves who acts first — priority
   bracket, then speed, reversed under Trick Room, ties flagged.
3. Apply results: subtract damage (`matchup`), apply boosts/drops, consume items,
   set/refresh field timers, handle faints.
4. **Decrement field timers** at end of turn (Tailwind 4, Trick Room 5, weather 5 / 8
   with rock, screens 5 / 8 with Light Clay, etc. — the engine doesn't need these but
   the tracker does; make durations editable to survive balance patches).
5. Push a `TurnRecord` to the log (support **undo**).

Faint-driven effects the resolver must respect: **Last Respects** power scales with
your fainted allies; **Supreme Overlord** (Kingambit) scales with its fainted allies;
**Unburden** doubles speed once its item is gone.

## The decision resolver  (the "do I outspeed and KO" feature)
Given the current `BattleState`, for each of the user's candidate actions:
- For each legal target, compute **speed order** (`faster`/`turnOrder`) and the
  **damage range + verdict** (`matchup`): guaranteed KO / roll / no KO, at current HP
  (not just full), accounting for current boosts, weather, screens, Intimidate already
  applied, spread ×0.75, etc.
- Combine into plain statements:
  - *"Garchomp Rock Slide: you move first (169 vs 143), guaranteed KO on their
    Charizard (min roll 104%). Their Basculegion is Scarf 195 — it moves before you."*
- **Rank the user's lines** by outcome (guaranteed KOs, then rolls, then setup/safe).
- Handle 2v2: a spread move hits both foes; show both results. Flag speed ties as
  genuine coinflips.

### Determinism vs uncertainty (accuracy standard)
- **Deterministic** where inputs are known (your own mons; opponent mons whose set is
  confirmed). State the guarantee plainly.
- **Ranged** where the opponent's spread/item is still assumed: compute across the
  plausible common spreads and report the boundary — e.g. *"KO unless they invested
  >12 SP into HP"* or *"guaranteed unless Sitrus is still live."* Never present an
  assumed-set result as a certainty; mark it.

## UI vision
- **Board view**: two mons per side with HP bars, a field banner showing active
  weather/Tailwind/Trick Room/screens **with turn counters**. Tap a mon → tap a move →
  see the resolver output for that action against each target.
- **Turn log** with undo; quick controls to reveal/edit opponent sets as you scout.
- **Fast + glanceable + mobile** (companion beside the game). Big color-coded verdicts.
- Optional "plan mode" (try lines without committing) vs "record mode" (log what
  actually happened and advance state).

## Build order for the live app
1. Wire the static calc (done in `demo.html`) to a **BattleState** with editable sets +
   HP + field. 2. Add `turnOrder` speed resolution to every matchup. 3. Add the turn
   loop with timers + undo. 4. Add the decision resolver that ranks your lines with
   speed+KO guarantees. 5. Add scouting (assumed→confirmed sets). 6. Polish to a PWA.
