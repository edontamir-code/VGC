# Kickoff prompt for Claude Code

Copy everything below into a new Claude Code session opened in this folder.

---

I'm building a **live companion app for Pokémon Champions (Regulation M-B) doubles** —
a turn-by-turn battle assistant I run on a laptop/phone beside the game. This repo has a
**verified damage engine, a verified speed engine, my real team, and a common-set
database.** Please read, in order: `README.md`, `BUILD_BRIEF.md`, and `BATTLE_MODEL.md`.

**Do not rewrite the damage or speed math** in `src/engine.js` / `src/speed.js` — it's
cross-checked against in-game numbers. Run `node test.mjs` first and keep those
regression numbers passing throughout.

Build the **live battle assistant** described in `BATTLE_MODEL.md` as the goal. Core
behavior: I track the board (both sides' 2 active mons + bench, field state with
weather/Tailwind/Trick Room/screens and turn counters, HP, boosts), and each turn the
app tells me **deterministically** whether a given action outspeeds and KOs — e.g.
"Garchomp Rock Slide: you move first 169 vs 143, guaranteed KO on their Charizard; their
Scarf Basculegion (195) still moves before you." Every opponent set must be **editable
and scoutable** (assumed common set → confirm as I observe it; e.g. swap Char Y's
Overheat for Weather Ball and have sun + everything recompute). Where the opponent's
spread is unknown, show the **range/boundary** rather than a false certainty.

Suggested build order:
1. Scaffold a **Vite + React (TypeScript)** app that imports the existing `src/` modules
   unchanged; port `demo.html`'s calc into a component so it works immediately.
2. Introduce a **BattleState** (per `BATTLE_MODEL.md`): editable sets, current HP, stat
   stages, and the field with turn counters.
3. Add **speed/turn order** (`turnOrder` from `src/speed.js`) to every matchup.
4. Add the **turn loop** (advance turn, decrement field timers with editable durations,
   item consumption, faints → Last Respects / Supreme Overlord / Unburden) with **undo**.
5. Add the **decision resolver** that ranks my candidate lines with speed + KO
   guarantees against both opposing targets (spread moves hit both).
6. Add **scouting** (assumed vs confirmed sets, visually distinct) and a **reverse SP
   optimizer** ("min SP to survive this hit").
7. Make it a **mobile-friendly PWA**, deployable to Vercel/Netlify/GitHub Pages.

Design: dark, high-contrast, glanceable, big color-coded verdicts (green LIVES / amber
ROLL / red DEAD), monospace numbers, large tap targets, one-handed on phone. Always show
assumptions (no crit, max roll, weather) so results are trustable.

Accuracy: I fact-check everything. Threat spreads marked `conf:"std"` in `threats.js` are
the standard convention, not scraped exact spreads — verify tight calcs against
pokemon-zone.com/champions or pikalytics.com, and keep data updates separate from engine
code. Parity-check a few outputs against ChampDex before you call it done.

Start by reading the three docs and running `node test.mjs`, then propose a short plan
before scaffolding.
