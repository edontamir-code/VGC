// ===========================================================================
// Fuzzy matching for typing a turn at speed.
//
// You are typing this while a clock runs, so it has to accept "eq", "chomp",
// "fo on glim". Everything here is deterministic string matching - no model,
// no network, works offline, and it is fast enough to re-parse on every
// keystroke.
// ===========================================================================

export function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Common shorthand people actually type. Extend freely. */
export const MOVE_ALIASES: Record<string, string> = {
  eq: "Earthquake",
  cc: "Close Combat",
  fo: "Fake Out",
  tw: "Tailwind",
  tr: "Trick Room",
  hw: "Heat Wave",
  bb: "Brave Bird",
  kc: "Kowtow Cleave",
  kowtow: "Kowtow Cleave",
  mir: "Make It Rain",
  hv: "Hyper Voice",
  wb: "Weather Ball",
  rs: "Rock Slide",
  dg: "Dazzling Gleam",
  ls: "Light Screen",
  sd: "Swords Dance",
  np: "Nasty Plot",
  ps: "Parting Shot",
  ko: "Knock Off",
  knock: "Knock Off",
  sucker: "Sucker Punch",
  ih: "Iron Head",
  dc: "Dragon Claw",
  fb: "Flare Blitz",
  wc: "Wave Crash",
  lr: "Last Respects",
  aj: "Aqua Jet",
  ft: "Flip Turn",
  es: "Electro Shot",
  sb: "Shadow Ball",
  pg: "Power Gem",
  ep: "Earth Power",
  sludge: "Sludge Bomb",
  moon: "Moonblast",
  psy: "Psychic",
  sub: "Substitute",
  prot: "Protect",
  pro: "Protect",
  spiky: "Spiky Shield",
  veil: "Aurora Veil",
  hh: "Helping Hand",
  iw: "Icy Wind",
  dw: "Dual Wingbeat",
  if_: "Ice Fang",
};

/** Verbs that mean "used Protect" etc., so natural phrasing works. */
export const VERB_FORMS: Record<string, string> = {
  protect: "Protect",
  protects: "Protect",
  protected: "Protect",
  tailwind: "Tailwind",
  tailwinds: "Tailwind",
  tailwinded: "Tailwind",
  trickroom: "Trick Room",
  fakeout: "Fake Out",
  faked: "Fake Out",
  encore: "Encore",
  encored: "Encore",
  taunt: "Taunt",
  taunted: "Taunt",
  roost: "Roost",
  roosted: "Roost",
  screen: "Light Screen",
  reflect: "Reflect",
};

export interface MatchResult<T> {
  value: T;
  score: number;
}

/** Levenshtein, capped - only used as a last resort on short strings. */
function editDistance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 3) return 99;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}

/**
 * Score how well `input` identifies `candidate`.
 * 0 = no match. Higher is better.
 */
export function scoreMatch(input: string, candidate: string): number {
  const i = norm(input);
  const c = norm(candidate);
  if (!i || !c) return 0;
  if (i === c) return 100;
  if (c.startsWith(i)) return 80 + i.length;
  if (i.length >= 3 && c.includes(i)) return 60 + i.length;

  // Initials: "cc" -> "Close Combat", "mir" -> "Make It Rain"
  const initials = candidate
    .split(/\s+/)
    .map((w) => w[0]?.toLowerCase() ?? "")
    .join("");
  if (i === initials) return 75;

  // Every typed token appears in the candidate, in order.
  const words = candidate.toLowerCase().split(/\s+/).map(norm);
  if (words.length > 1 && words.some((w) => w.startsWith(i)) && i.length >= 3) return 55;

  if (i.length >= 4) {
    const d = editDistance(i, c);
    if (d <= 2) return 40 - d * 5;
  }
  return 0;
}

/** Best match from a list, or null when nothing clears the bar. */
export function bestMatch<T>(
  input: string,
  candidates: T[],
  label: (t: T) => string,
  minScore = 40
): MatchResult<T> | null {
  let best: MatchResult<T> | null = null;
  for (const c of candidates) {
    const score = scoreMatch(input, label(c));
    if (score >= minScore && (!best || score > best.score)) best = { value: c, score };
  }
  return best;
}

/** All matches above the bar, best first - used to detect ambiguity. */
export function allMatches<T>(
  input: string,
  candidates: T[],
  label: (t: T) => string,
  minScore = 40
): MatchResult<T>[] {
  return candidates
    .map((c) => ({ value: c, score: scoreMatch(input, label(c)) }))
    .filter((m) => m.score >= minScore)
    .sort((a, b) => b.score - a.score);
}

/** Resolve a typed move name against aliases first, then fuzzy matching. */
export function resolveMoveName(input: string, candidates: string[]): string | null {
  const n = norm(input);
  if (!n) return null;
  const alias = MOVE_ALIASES[n] ?? VERB_FORMS[n];
  if (alias && candidates.some((c) => c === alias)) return alias;
  if (alias && candidates.length === 0) return alias;
  const m = bestMatch(input, candidates, (c) => c);
  return m ? m.value : alias ?? null;
}

export const ME_WORDS = new Set(["i", "me", "my", "mine", "we", "us", "our"]);
export const THEM_WORDS = new Set([
  "he", "she", "they", "him", "her", "them", "opp", "opponent", "his", "their", "theirs", "enemy", "foe",
]);
