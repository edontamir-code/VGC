# Champions Battle Assistant

A live turn-by-turn companion for Pokémon **Champions (Reg M-B)** doubles, built on a
verified damage engine, a verified speed engine, your team, and a common-set database.

## Run it
```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static site in dist/ - deploy anywhere, installable as a PWA
npm test         # engine + battle-layer regression tests
```
`demo.html` is still there as the original single-file preview.

## What it does
Track the board and it tells you, each turn, whether an action **outspeeds and KOs**:

- **Board** — 2 active + bench per side, exact or % HP, stat stages, status, items.
- **Field** — weather / Tailwind / Trick Room / screens **with turn counters** that tick
  on Next turn. Durations are editable so a balance patch doesn't need a code change.
- **Your lines** — every move ranked by outcome, each with the speed comparison
  (`you first 169 v 143`) and a KO verdict computed at **current** HP, not just full.
  Spread moves report both targets. Exact speed ties are flagged as coinflips.
- **Before you act** — what happens to you *first*. Fake Out flinching your lead (+3
  priority, so your click never happens), a KO landing before you move, your Focus Sash
  being chipped off full HP, and two attackers combining on one target. A line whose
  user may never act is visibly discounted in the ranking.
- **Incoming** — the same analysis pointed the other way: what they can do to you, and
  whether it lands first.
- **Scouting** — opponents load as an *assumed* common set. Confirm moves/item/ability/
  spread as you see them; assumed and confirmed render differently.
- **Speed** — field-aware turn order plus a benchmark table (base / Scarf / Tailwind /
  −1 / paralysed).
- **SP optimizer** — minimum HP + Def/SpD investment that survives a given hit, and how
  much of the 66 SP budget is left.

### Certainty, not false precision
Where the opponent's spread is still assumed, a KO is never reported as a flat
guarantee. The app sweeps the legal 66-SP spreads and reports the **boundary**:

> *guaranteed KO unless they run +3 SP in HP or +2 SP in Def more than the common set*

and, when it holds either way:

> *guaranteed KO on any spread they could legally be running*

Confirm the spread in the mon editor and the line becomes deterministic.

## What's inside
```
index.html             ← the app
src/
  typechart.js         ← 18-type chart          } VERIFIED - don't rewrite the math.
  engine.js            ← stat + damage engine   } The app only feeds them inputs.
  speed.js             ← speed / turn order     }
  *.d.ts               ← type declarations for the above (they stay plain JS)
  data/
    team.js            ← your 6 mons, spreads decoded from the in-game stat screen
    threats.js         ← common Reg M-B threat sets (auto-populate)
    moves.js           ← common move data
  app/
    model/             ← BattleState types + factories
    battle/            ← the layer that turns board state into engine inputs
    state/             ← reducer + undo/redo + persistence
    ui/                ← React components
test.mjs               ← engine regression tests (the BUILD_BRIEF numbers)
test-battle.mjs        ← battle-layer tests (parity + live behaviour)
demo.html              ← the original single-file preview
build/                 ← how demo.html is bundled
```

### How the app extends the engine without touching it
Stat stages, Intimidate, burn, screens, berries, Supreme Overlord, Knock Off, Last
Respects and current-HP KO odds are all expressed through inputs `matchup()` already
accepts (`attacker.stats` / `defender.stats`, `field.atkMult`, `move.power`,
`move.otherMult`, `defHP`). `src/app/battle/` assembles those; `engine.js` and
`speed.js` are unmodified.

One deliberate difference from the static calc: the app passes `setsWeather: null` and
lets **the field** decide the weather. `engine.js:135` otherwise falls back to the
attacker's own ability, which would keep applying sun after Drought's turns ran out.
The tracker auto-sets weather when a Drought/Drizzle mon enters instead.

## The planner: winning games, not turns

`src/app/sim/` is a deterministic turn simulator — given a board, both sides' actions, a
roll choice and a speed-tie policy, it produces exactly one successor state. `src/app/
search/` runs maximin over it: I commit to a plan, then they pick the best reply *knowing
it*, and the line is scored by its worst case.

A **pin** is a plan whose worst case still leaves me ahead. The soundness contract:

| | |
|---|---|
| Opponent knowledge | They see my move before replying — real doubles is simultaneous, so anything surviving this survives the real game |
| My damage rolls | Minimum |
| Their damage rolls | Maximum |
| Exact speed ties | Resolved against me |
| Repeat Protect | Treated as failing |
| Their sets | As currently known; assumed sets make the pin conditional |

Every approximation points the same way: the search **under-claims**. Its failure mode is
telling you no pin exists when one practically does — never the reverse.

**Depth 1 is a proof.** Every one of their replies is checked. **Depth 2+ beams** their
replies, so it is a strong indication rather than a proof, and each line carries
`worst.exhaustive` and `proven` flags saying which it is. `proven` requires exhaustive
search *and* confirmed opposing sets. The horizon is always reported: "guaranteed through
turn 3" is sayable, "guaranteed to win" is not.

The search defaults to **3 turns** and runs in a Web Worker, so a multi-second search
never blocks the app mid-battle.

### Recording a turn by typing it
Type what happened, in the order it happened:

```
I protect, he protects, he tailwinds
chomp eq, gambit sucker on whims, whims tw, incin fo chomp
1 protect / 3 fake out on glim / 2 iron head
```

Pokémon can be named (`chomp`, `gambit`, `whims`), numbered by slot 1–4, or referred to
as `I`/`he`. Moves take shorthand (`eq`, `cc`, `fo`, `tw`). Parsing is plain deterministic
string matching — instant, offline, no model involved. A live preview shows exactly what
it understood before you commit.

You can also drop in what you saw: `star at 60%`, `chomp 120hp`, `whims fainted`,
`ko'd star`. Those are treated as observations, not actions — they stay out of the speed
inference and are applied *after* the simulation, because what you watched beats whatever
roll the simulator picked.

Applying a turn does four things in one undoable step: confirms every move it saw
(scouting), reads the Speed order (below), plays the turn out through the simulator, and
applies your HP corrections.

There is no LLM and no network call. It is plain string matching, so it costs nothing,
works offline, and shows you its parse before it touches the board.

### Impossible orders are free scouting
If what you recorded cannot happen given the sets we assume, the app says so and names
the suspect:

> You recorded Mega Staraptor Protect (priority 4) before Whimsicott Protect (priority
> +5), but the higher bracket always moves first.
> **Whimsicott may not actually have Prankster** — without it, Protect sits at priority 4
> and the order you saw is consistent.

Or, when no legal Speed fits the order at all: *"it is probably holding a Choice Scarf, or
there is a Tailwind up that is not on the field yet."* These never block recording — you
watched the game, the app didn't.

### The order you type is evidence
If two Pokémon act in the same priority bracket and yours went first, yours was at least
as fast — and your Speed is known exactly, so that bounds theirs. Each recorded turn
filters their legal Speed stats:

> Whimsicott Speed 122–184 → **122–178**

A narrower Speed range means a narrower SP spread, which tightens every damage calc that
depends on their investment. Two subtleties the engine gets right: a priority move going
first teaches nothing, and under Trick Room moving first means *slower*. Ties are never
ruled out — "A went first" only proves A ≥ B, so an exact speed tie stays possible and
`outspeedVerdict` reports `unknown` rather than overclaiming.

### The species dex
`src/data/dex.js` holds **all 310 Pokémon legal in Reg M-A/M-B** — name, types and base
stats, including all 75 Mega forms. Sourced from pokebase.app's Champions dex, all four
pages. That makes any legal opponent enterable at team preview.

It is deliberately separate from `threats.js`: the dex is static game data that never
changes, while threat *sets* (items, spreads, move pools) track the meta. A species with
no curated set still works — it comes in with a legal placeholder spread marked **stats
only**, which you fill in as you scout.

The source isn't infallible. Its Farigiraf entry is provably wrong (107/60 SpA/SpD, when
the in-game screen only derives from 110/70), so verified corrections live in `OVERRIDES`
and the game always wins. Two errors in `threats.js` surfaced from cross-checking against
it too: Archaludon's SpD was 85 and should be 65.

### Their back line
Switching is most of doubles, so the planner models their whole roster. Enter their six
at team preview (`zard, incin, gambit, chomp, bascu, whims`) and every one that could
still have been brought becomes a legal switch target the search must beat.

Each opposing Pokémon carries a `brought` status: **confirmed** once you've seen it,
**possible** until then, **out** once four others are confirmed — at which point the rest
are ruled out automatically. Material is weighted by that, so filling in six names
doesn't inflate their score; the two unseen slots are shared across the candidates.

Without a roster the planner assumes they can never switch, which makes every guarantee
too optimistic. The UI says so when the roster is empty.

### Redirection
Rage Powder, Follow Me, Lightning Rod and Storm Drain pull **single-target** attacks onto
the redirector. Spread moves are unaffected. This is simulated because it does not just
move damage around — it can delete a line outright:

> Mega Staraptor's Close Combat aimed at Charizard Y, redirected by Sinistcha's Rage
> Powder, hits a **Ghost**. No damage, no KO — and because the move never connected, no
> Contrary defence boost either.

The risk panel warns whenever a redirector is on the field, so the Lines panel never
promises a single-target KO that will land somewhere else.

### Abilities
Stat-changing and damage-changing abilities go through the engine's existing inputs:

| | |
|---|---|
| Huge Power / Pure Power | ×2 Attack — Mega Mawile read at **half** its real damage without this |
| Guts / Hustle | ×1.5 Attack; Guts also ignores its own burn |
| Fur Coat / Ice Scales | ×2 Def / SpD |
| Thick Fat, Heatproof | halve Fire (and Ice) |
| Multiscale, Filter, Solid Rock | reduce incoming damage |
| Technician, Iron Fist, Strong Jaw, Reckless | boost the moves they apply to |

Abilities the simulator *cannot* represent — Armor Tail, Magic Bounce, Good as Gold,
Contrary, Sturdy, Intimidate — are listed in `UNSIMULATED_ABILITIES` and surfaced rather
than silently ignored.

### Mega Evolution
`base` is the Mega stat line, `baseForm` the pre-Mega one, and the ability differs
between them: a Mawile that has not Mega Evolved has **Intimidate and normal Attack**,
not Huge Power. Only **one Pokémon per side** may Mega Evolve, and the reducer refuses a
second. Separately, a team carrying two Mega stones usually brings only one — that is
shown at team preview as a *read*, never applied as a fact.

**Caveat:** Champions ships original Megas (Mega Staraptor, Mega Delphox) whose stats are
not canonical. The Mega lines for Swampert, Metagross, Mawile and Sableye are the
canonical values and are **not verified for Champions** — the usage pages do not publish
Mega stat lines. Verify those four before trusting a tight calc.

### Move pools: planning against what they *could* have
A Pokémon carries four moves out of a larger pool. `threats.js` gives both: `moves` is
the assumed four, `movePool` is everything the species commonly runs. Until four moves
are confirmed, the planner assumes they hold **any** un-ruled-out pool move, and reports
three tiers:

- **PIN vs any set** — holds no matter what they're running
- **PIN if assumed set** — holds against the common four, with the breakers named:
  *"this is a pin unless Incineroar has Protect"*
- **no guarantee** — their best reply beats it

Confirming or ruling out moves in the mon editor shrinks the space. Confirm four and the
arsenal collapses to exactly those — every claim against that Pokémon becomes
deterministic.

### Mechanics that void plans
These are modelled because getting them wrong invalidates a guarantee rather than just
shading a number:

| Rule | Effect |
|---|---|
| Fake Out | Only on the turn its user switches in (`turnsOnField === 0`) |
| Protect | Consecutive use treated as failing; counter is **per Pokémon**, so both of yours can Protect the same turn |
| Psychic Terrain | Blocks **every** priority move against a **grounded** target — Fake Out, Sucker Punch, Aqua Jet, Prankster status. Flying types and Levitate are unaffected |
| Prankster | Status moves get +1 priority, and fail outright against Dark types (Whimsicott cannot Encore a Kingambit) |
| Encore | Locks the target into its last move for 3 turns; overwrites its action if it hasn't moved yet; ends on switch |
| Terrain damage | Electric/Grassy/Psychic boosts for grounded attackers; Grassy halves Earthquake, Misty halves Dragon, against grounded targets |

### Why the lead-risk model contains no heuristics
`src/app/battle/leadRisk.ts` never guesses what an opponent "usually" does. It reads
their current sets, resolves the real priority and speed order, and does arithmetic —
the same verified engine, pointed at the question "what resolves before my move". Every
risk is tagged `assumed` until you confirm the move in the mon editor, at which point it
becomes `confirmed`. Nothing in it was learned, inferred, or invented.

## Not modelled (surfaced in the UI, never hidden)
Crits (verdicts are deliberately no-crit), terrain, Protect, Low Kick's weight scaling,
Electro Shot's charge turn, and the exact roll distribution of multi-hit moves — those
report bounds instead. Moves missing from `moves.js` are listed as "no damage numbers
available" rather than silently dropped.

## The engine in 30 seconds
- Champions stats (L50, 31 IVs, SP 0–32/stat, 66 total):
  `HP = Base + 75 + SP`, `Other = floor((Base + 20 + SP) × Nature)`.
- `matchup(attacker, defender, move, field)` → `{ min, max, minPct, maxPct, typeMult, koChance }`.
- Verdicts: `maxPct<100` LIVES · `minPct≥100` DEAD · else ROLL.

## Rebuild the preview
```
node build/bundle.mjs   # regenerates demo.html from src/ + build/
```

## Keep it accurate
Threat spreads marked `conf:"std"` are the standard convention, not scraped exact
spreads — verify against pokemon-zone.com/champions or pikalytics.com for tight calcs.
Data updates shouldn't require touching the engine.
