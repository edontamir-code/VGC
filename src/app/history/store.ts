// ===========================================================================
// Where the game log lives.
//
// localStorage, same as the board. The log is the one thing in this app that
// gets more valuable the longer you keep it, so it is versioned and exportable
// from day one - losing it to a schema change or a cleared browser would be
// losing the only data the tool has that nobody else has.
//
// Nothing is uploaded anywhere. The log contains your team, the people you
// played and how you did, and that stays on the device unless you export it.
// ===========================================================================
import type { BattleState } from "../model/types.ts";
import type { AdviceDetail, GameRecord, GameResult, TurnRecord } from "./gamelog.ts";
import { GAMELOG_VERSION, newGameRecord, recordTurn } from "./gamelog.ts";

const KEY = "champions-gamelog-v1";
/** Keep the file bounded. Oldest games drop off first. */
const MAX_GAMES = 300;

function read(): GameRecord[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (g): g is GameRecord => Boolean(g) && typeof g.id === "string" && Array.isArray(g.turns)
    );
  } catch {
    return [];
  }
}

function write(games: GameRecord[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(games.slice(-MAX_GAMES)));
  } catch {
    /* storage full - the app keeps working, the log just stops growing */
  }
}

export function allGames(): GameRecord[] {
  return read();
}

export function getGame(id: string): GameRecord | null {
  return read().find((g) => g.id === id) ?? null;
}

/** The game currently being recorded, if any. */
export function currentGame(): GameRecord | null {
  const games = read();
  const last = games[games.length - 1];
  return last && last.result === "unfinished" ? last : null;
}

/**
 * Begin recording. Called when a new board starts.
 *
 * An unfinished game with no turns is discarded rather than kept - opening the
 * app and closing it should not fill the log with empty rows.
 */
export function startGame(state: BattleState): GameRecord {
  const games = read().filter((g) => g.turns.length > 0 || g.result !== "unfinished");
  const rec = newGameRecord(state);
  games.push(rec);
  write(games);
  return rec;
}

/**
 * Append a turn to whichever game is open, starting one if none is.
 *
 * Turns with an empty script are ignored: an empty row is not evidence.
 */
export function logTurn(
  before: BattleState,
  after: BattleState,
  script: string,
  advice: string | null,
  followedAdvice: boolean | null,
  detail?: AdviceDetail
): TurnRecord | null {
  if (!script.trim()) return null;
  const games = read();
  let game = games[games.length - 1];
  if (!game || game.result !== "unfinished") {
    game = newGameRecord(before);
    games.push(game);
  }
  const turn = recordTurn(before, after, script, advice, followedAdvice, detail);
  game.turns.push(turn);

  // Keep the roster fields current - team preview may have been entered after
  // the first turn was recorded.
  const fresh = newGameRecord(after);
  game.theirRoster = fresh.theirRoster;
  game.theirBrought = fresh.theirBrought;
  game.myBrought = fresh.myBrought;
  game.myMega = fresh.myMega;

  write(games);
  return turn;
}

/** Close the open game with a result. */
export function finishGame(result: GameResult, lesson: string | null = null): GameRecord | null {
  const games = read();
  const game = games[games.length - 1];
  if (!game || game.result !== "unfinished") return null;
  game.result = result;
  game.endedAt = new Date().toISOString();
  if (lesson) game.lesson = lesson;
  write(games);
  return game;
}

/** Attach or replace the free-text lesson on a game. */
export function setLesson(id: string, lesson: string): void {
  const games = read();
  const game = games.find((g) => g.id === id);
  if (!game) return;
  game.lesson = lesson.trim() || null;
  write(games);
}

export function deleteGame(id: string): void {
  write(read().filter((g) => g.id !== id));
}

export function clearLog(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

// --- portability -----------------------------------------------------------

export function exportJSON(): string {
  return JSON.stringify({ version: GAMELOG_VERSION, exportedAt: new Date().toISOString(), games: read() }, null, 2);
}

export interface ImportResult {
  added: number;
  skipped: number;
  error: string | null;
}

/**
 * Merge an exported log back in. Games already present (same id) are skipped
 * rather than duplicated, so importing the same file twice is harmless.
 */
export function importJSON(text: string): ImportResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { added: 0, skipped: 0, error: "That is not valid JSON." };
  }
  const incoming =
    Array.isArray(parsed) ? parsed : (parsed as { games?: unknown })?.games;
  if (!Array.isArray(incoming)) {
    return { added: 0, skipped: 0, error: "No games found in that file." };
  }

  const games = read();
  const have = new Set(games.map((g) => g.id));
  let added = 0;
  let skipped = 0;
  for (const g of incoming as GameRecord[]) {
    if (!g || typeof g.id !== "string" || !Array.isArray(g.turns)) {
      skipped++;
      continue;
    }
    if (have.has(g.id)) {
      skipped++;
      continue;
    }
    games.push(g);
    have.add(g.id);
    added++;
  }
  games.sort((a, b) => (a.startedAt < b.startedAt ? -1 : 1));
  write(games);
  return { added, skipped, error: null };
}
