// ===========================================================================
// Regenerate src/data/usage.js from championsbattledata.com.
//
//   node scripts/import-usage.mjs            # refresh in place
//   node scripts/import-usage.mjs --dry-run  # print the diff, write nothing
//   node scripts/import-usage.mjs --season M4
//
// WHY THIS IS OFFLINE AND COMMITTED, NOT FETCHED AT RUNTIME
//
// The app is a static PWA you use beside a live game, often on a phone. A
// runtime API call would add a failure mode at exactly the wrong moment - a
// slow network mid-turn is worse than slightly stale usage data - and it would
// break offline use entirely. Committing the generated file also means a meta
// shift shows up as a reviewable git diff rather than silently changing what
// the tool recommends between one game and the next.
//
// WHAT IT ADDS OVER THE HAND-TRANSCRIBED FILE
//
// Real SP SPREADS with usage percentages. Nothing in the repo had these:
// damageInference.ts enumerates every legal spread as equally likely, so
// "Heat Wave did 82%" narrows to a wide band. With the real distribution the
// same observation can point at the spread people actually run.
// ===========================================================================
import { writeFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "src/data/usage.js");
const API = "https://championsbattledata.com/api/battle/Doubles";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const season = (() => {
  const i = args.indexOf("--season");
  return i >= 0 ? args[i + 1] : null;
})();

/**
 * My species ids to Pokemon Showdown internal ids.
 *
 * Only the ones that actually differ are listed; everything else is already
 * the Showdown id. Mega forms are NOT separate entries in the usage data -
 * "charizard" covers both X and Y, and which stone they hold shows up in the
 * held_item rows instead, which is the honest place for it.
 */
const SHOWDOWN_ID = {
  "charizard-y": "charizard",
  "floette-eternal": "floette",
  "ninetales-alola": "ninetalesalola",
};

const showdownId = (id) => SHOWDOWN_ID[id] ?? id.replace(/-/g, "");

/** Category -> the key it lands under in USAGE. */
const CATEGORY = {
  move: "moves",
  held_item: "items",
  ability: "abilities",
  stat_alignment: "natures",
};

const SP_KEYS = [
  ["hp_points", "hp"],
  ["attack_points", "atk"],
  ["defense_points", "def"],
  ["sp_atk_points", "spa"],
  ["sp_def_points", "spd"],
  ["speed_points", "spe"],
];

/** The SP budget every legal Champions spread sums to. */
const SP_TOTAL = 66;

async function fetchOne(id) {
  const url = `${API}/${showdownId(id)}` + (season ? `?season=${season}` : "");
  const res = await fetch(url, { headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status} (${url})`);
  const body = await res.json();
  if (!Array.isArray(body.rows)) throw new Error(`${id}: no rows in response`);
  return body;
}

/** One API payload -> the record shape usage.js already uses. */
function toRecord(body) {
  const out = { moves: {}, items: {}, abilities: {}, natures: {}, spreads: [] };
  const warnings = [];

  for (const row of body.rows) {
    const key = CATEGORY[row.category];
    if (key) {
      // Teammates carry no percentage and are not modelled, so they are
      // dropped rather than stored as nulls.
      if (row.name && typeof row.percentage_value === "number") {
        out[key][row.name] = row.percentage_value;
      }
      continue;
    }
    if (row.category !== "stat_points") continue;

    const sp = {};
    let total = 0;
    for (const [from, to] of SP_KEYS) {
      const v = Number(row[from]) || 0;
      total += v;
      if (v > 0) sp[to] = v;
    }
    // A spread that does not sum to 66 is not a legal Champions spread. Keep
    // it - dropping data silently is how a file starts lying - but say so, so
    // a change in how the source reports spreads cannot slip through.
    if (total !== SP_TOTAL) {
      warnings.push(`${body.pokemon}: spread #${row.rank} totals ${total}, not ${SP_TOTAL}`);
    }
    out.spreads.push({ sp, pct: row.percentage_value ?? 0, total });
  }

  out.spreads.sort((a, b) => b.pct - a.pct);
  return { record: out, warnings };
}

const fmtPct = (n) => (Number.isInteger(n) ? `${n}.0` : String(n));

function renderRecord(id, rec) {
  const line = (obj) =>
    Object.entries(obj)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${JSON.stringify(k)}:${fmtPct(v)}`)
      .join(", ");

  const spreads = rec.spreads
    .map((s) => {
      const sp = Object.entries(s.sp).map(([k, v]) => `${k}:${v}`).join(", ");
      const flag = s.total !== SP_TOTAL ? `, total:${s.total}` : "";
      return `      { sp:{ ${sp} }, pct:${fmtPct(s.pct)}${flag} },`;
    })
    .join("\n");

  // Ids like "charizard-y" and "floette-eternal" are not valid bare keys.
  const key = /^[A-Za-z_$][\w$]*$/.test(id) ? id : JSON.stringify(id);

  return `  ${key}: {
    moves: { ${line(rec.moves)} },
    items: { ${line(rec.items)} },
    abilities: { ${line(rec.abilities)} },
    natures: { ${line(rec.natures)} },
    spreads: [
${spreads}
    ],
  },`;
}

function render(records, meta) {
  return `// ===========================================================================
// GENERATED FILE - do not edit by hand.
//
//   node scripts/import-usage.mjs
//
// Source: championsbattledata.com, ${meta.format} ${meta.season}.
// Fetched: ${meta.fetchedAt}.
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
// \`spreads\` is the real SP distribution - the thing a hand-transcribed file
// could never carry. Each entry sums to 66, the Champions budget, and \`pct\`
// is how often that exact spread was seen. A spread whose total is NOT 66 is
// kept with an explicit \`total\` field rather than dropped.
// ===========================================================================

/** Percent usage at or above which an option is treated as possible. */
export const INCLUSION_CUTOFF = 5;

/** Where this came from, so a stale file is visible rather than assumed fresh. */
export const USAGE_SOURCE = ${JSON.stringify(meta, null, 2).replace(/\n/g, "\n")};

export const USAGE = {
${records.join("\n")}
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
`;
}

// ---------------------------------------------------------------------------

async function main() {
  // The species list comes from the file being replaced, so this refreshes
  // what the app already knows about rather than silently changing its scope.
  const { USAGE: current } = await import(`file://${OUT.replace(/\\/g, "/")}`);
  const ids = Object.keys(current);
  console.log(`Refreshing ${ids.length} species from ${API}${season ? ` (season ${season})` : ""}\n`);

  const records = [];
  const allWarnings = [];
  const changes = [];
  let format = "Doubles";
  let seasonSeen = season ?? "Current";

  for (const id of ids) {
    let body;
    try {
      body = await fetchOne(id);
    } catch (err) {
      // A failed fetch must not silently shrink the file. Keep what was there.
      console.log(`  !! ${id}: ${err.message} - KEEPING existing entry`);
      records.push(renderRecord(id, { ...current[id], spreads: current[id].spreads ?? [] }));
      allWarnings.push(`${id}: fetch failed, entry is stale`);
      continue;
    }
    format = body.format ?? format;
    seasonSeen = body.season ?? seasonSeen;

    const { record, warnings } = toRecord(body);
    allWarnings.push(...warnings);

    // Report what actually moved, so a refresh is reviewable rather than a
    // wall of reformatted numbers.
    const before = current[id] ?? {};
    for (const key of ["moves", "items", "abilities"]) {
      const oldKeys = new Set(Object.keys(before[key] ?? {}));
      const newKeys = new Set(Object.keys(record[key]));
      const added = [...newKeys].filter((k) => !oldKeys.has(k) && record[key][k] >= 5);
      const gone = [...oldKeys].filter((k) => !newKeys.has(k));
      if (added.length) changes.push(`  + ${id} ${key}: ${added.map((k) => `${k} ${record[key][k]}%`).join(", ")}`);
      if (gone.length) changes.push(`  - ${id} ${key}: ${gone.join(", ")}`);
    }
    const spreadCount = record.spreads.length;
    console.log(
      `  ${id.padEnd(18)} ${Object.keys(record.moves).length} moves, ` +
        `${Object.keys(record.items).length} items, ${spreadCount} spreads`
    );

    records.push(renderRecord(id, record));
  }

  const meta = {
    url: API,
    format,
    season: seasonSeen,
    fetchedAt: new Date().toISOString().slice(0, 10),
    species: ids.length,
  };

  if (changes.length) {
    console.log(`\nChanges vs the current file:`);
    for (const c of changes) console.log(c);
  } else {
    console.log(`\nNo added or removed options.`);
  }
  if (allWarnings.length) {
    console.log(`\nWarnings:`);
    for (const w of allWarnings) console.log(`  ! ${w}`);
  }

  const out = render(records, meta);
  if (DRY) {
    const same = readFileSync(OUT, "utf8") === out;
    console.log(`\n--dry-run: ${same ? "no change" : `would rewrite ${OUT} (${out.length} bytes)`}`);
    return;
  }
  writeFileSync(OUT, out, "utf8");
  console.log(`\nWrote ${OUT} (${out.length} bytes).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
