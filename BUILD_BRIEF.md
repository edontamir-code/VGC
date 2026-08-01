# Build Brief — Pokémon Champions Threat & Speed Tool

**Paste this whole repo into a Claude Code session.** It contains a *verified* damage
engine, my real team, and a common-set database. Your job is to build the app around
this core — **do not re-derive the damage/stat math**, it's already cross-checked
against in-game numbers and a Python reference.

---

## Who this is for
A competitive Champions ladder player (peak ~top 3,500). The app is a **companion**
run on a laptop/PC (and ideally phone) *beside* the game, which is played on Switch or
mobile. So: **fast, glanceable, mobile-friendly, few taps.** Accuracy matters a lot —
the user fact-checks everything, so every number must be reproducible and every
assumption visible.

## Format facts (Regulation M-B, current as of Jul 2026 — verify if time has passed)
- Level 50, IVs fixed at 31. **Stat Points (SP)**: 0–32 per stat, **66 total**.
- **1 SP = +1 to that stat.** Formulas (already in `src/engine.js`):
  - `HP = Base + 75 + SP`
  - `Other = floor((Base + 20 + SP) × Nature)`, Nature ∈ {1.1, 1.0, 0.9}
- **Mega Evolution is the only gimmick** (no Tera, no Dynamax). Some Megas are
  Champions-original (e.g. Mega Staraptor = Fighting/Flying/Contrary; Mega Delphox =
  Fire/Psychic/Levitate) — their base stats are in the data files.
- Doubles: spread moves ×0.75. Standard Gen-6+ damage formula otherwise.
- Paradox mons and Treasures of Ruin are **banned** (no Flutter Mane, Chi-Yu, etc.).

## What's already done (don't rebuild)
- `src/typechart.js` — full 18-type chart.
- `src/engine.js` — `computeStats`, `calcDamage`, `matchup`, item-type boosts,
  Adaptability/Pixilate/Tough Claws/Life Orb/weather/spread/screens/Intimidate hook,
  and Weather Ball (resolves to the weather's type at 100 BP).
- `src/speed.js` — `effectiveSpeed`, `faster`, `turnOrder`, `benchmarks`: deterministic
  speed/turn order with Tailwind, Trick Room, Choice Scarf, paralysis, stage drops,
  weather-speed abilities, and **tie flagging**. This is the heart of "do I outspeed X."
  **Verified numbers (regression tests — your build must still produce these):**
  - Sneasler Close Combat → my Kingambit: **220.3% max, ×4, guaranteed KO**
  - Char-Y Heat Wave (sun) → my Kingambit: **144.9% max, ×2, guaranteed KO**
  - Basculegion Wave Crash → my Mega Delphox: **272.8% max, ×2**
  - Sylveon Hyper Voice → my Garchomp: **121.6% max, ×2, guaranteed KO**
  - Sylveon Hyper Voice → my Mega Staraptor: **108.4% max, ×2, 44% to KO**
  - Garchomp Earthquake → my Mega Delphox / Mega Staraptor: **immune** (Levitate / Flying)
- `src/data/team.js` — my 6 mons, spreads decoded from the in-game stat screen (each sums to 66 SP).
- `src/data/threats.js` — common Reg M-B sets for auto-populate.
- `src/data/moves.js` — common moves.
- `demo.html` — a working single-file preview (double-click to run). Use it as the seed for the real UI.

## Verdict semantics (keep these exact)
Per hit, using the **max damage roll, no crit, defender at full HP**:
- `maxPct < 100` → **LIVES** (guaranteed survive)
- `minPct ≥ 100` → **DEAD** (guaranteed KO)
- otherwise → **ROLL** (report % chance to KO)
Focus Sash → always "LIVES (from full)". Ability/type immunity → "IMMUNE".

---

## Features to build (priority order)

### 0. LIVE BATTLE ASSISTANT  *(the real goal — see `BATTLE_MODEL.md`)*
A turn-by-turn doubles tracker holding the board state (both sides' 2 active mons +
bench, field with weather/Tailwind/Trick Room/screens **and turn counters**, HP, stat
stages, revealed/editable sets). Each turn it **deterministically** answers "if I click
X, do I outspeed and get a guaranteed KO, yes or no?" — by combining the speed engine
(`src/speed.js`) with the damage engine over the *current* state. **Every set is editable
and scoutable** (e.g. Char Y usually runs Weather Ball, not Overheat — the user swaps it
and everything updates; weather is tracked on the field, not per-calc). Read
`BATTLE_MODEL.md` for the full state model, turn loop, and decision resolver — this is
the centerpiece; features 1–3 below are its subsystems.

### 1. Damage calculator with auto-populated common sets  *(subsystem — like ChampDex)*
- Pick **attacker** and **defender** from: my team **or** the threat list **or** a custom mon.
- Selecting a threat **auto-fills** its item / ability / nature / SP spread / moves
  (data is in `threats.js`; show the populated set and let the user override any field).
- Field controls: weather (auto-set from the attacker's ability, e.g. Drought→sun),
  spread (auto from move), screens, Intimidate, Helping Hand, stat stages (±6),
  Life Orb, Choice, terrain (add if you extend the engine).
- Show full roll range, %, and the LIVES/ROLL/DEAD verdict prominently.
- Do **both directions** (my mon attacking, and my mon defending) — a real calc swaps freely.
- Apply my defensive berries (Occa/Chople half a super-effective hit) — see `team.js` `berry`.

### 2. Speed order (field-aware)  *(the user's #1 requested edge)*
- For any two mons, say who moves first **given the field**: Tailwind (×2), Trick Room
  (invert), Choice Scarf (×1.5), paralysis (×0.5), Icy Wind/Electroweb (−1/−2 stages),
  priority brackets, and **flag exact speed ties**.
- A speed-tier table of my team + the threat list at key benchmarks (base / +Scarf /
  +Tailwind / in TR / −1). Speed uses the same `computeStats` Spe.

### 3. Reverse SP survival optimizer  *(team-building)*
- Input: my defender + an incoming attack (auto-filled common set) + condition
  ("survive guaranteed" / "survive 90%").
- Output: the **minimum HP/Def or HP/SpD SP + nature** that crosses the threshold,
  and **how many SP are left** (out of 66) for offense/speed. Brute-force over SP
  splits is fine (small search space). This is the "live a Kowtow and a Heat Wave on
  my Farigiraf" feature generalized.

### 4. (stretch) Team-wide threat matrix + live tracker
- A grid: my 6 mons × top threats, colored by verdict, so I see coverage holes at a glance.
- Optional: a one-tap live field tracker (Tailwind 4 / Trick Room 5 / weather 5–8 /
  screens 5–8, auto-decrement per turn) as a second tab for use during games.

---

## UI / UX direction
- **Dark, high-contrast, glanceable.** Big color-coded verdict (green LIVES / amber ROLL
  / red DEAD). Monospace for numbers. Large tap targets. Works one-handed on a phone.
- Minimize clicks to answer "do I live this?" — that's the hot path.
- Always show the assumptions in-line (no crit, max roll, weather, etc.) so results are trustable.
- Avoid a generic template look; give it a small, deliberate identity (see `demo.html` as a starting point, then improve).

## Tech
- No backend needed. A **static site** (Vite + vanilla/TS, or React) that can be deployed
  to Netlify/Vercel/GitHub Pages and **installed as a PWA** on phone + laptop is ideal.
- Keep the engine and data as plain modules so they're easy to update and test.
- Add a tiny test file that asserts the regression numbers above.

## Data accuracy & maintenance (important)
- Species/items/abilities/moves in `threats.js` reflect current usage
  (**pokemon-zone.com/champions**, **pikalytics.com** — Reg M-B). Spreads marked
  `conf:"std"` are the standard competitive convention, **not** a scraped exact spread —
  verify those for tight calcs, and prefer real usage spreads when available.
- Make it easy to **add a threat** (one object in `threats.js`) and to **import a
  Showdown paste** into a custom set. When the meta shifts or a new regulation drops,
  updating data should not require touching the engine.
- When in doubt on a number, surface uncertainty in the UI rather than presenting a
  false-precise value. Parity-check a few outputs against ChampDex before shipping.

## Definition of done (v1)
Damage calc (both directions, auto-populated sets, my berries) + speed order + SP
optimizer, mobile-friendly, deployable, with the regression tests passing.
