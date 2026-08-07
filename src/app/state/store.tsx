// ===========================================================================
// React wiring for the BattleState session. Persists to localStorage so a
// refresh mid-game does not cost you the board.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef } from "react";
import type { ReactNode } from "react";
import { newSession } from "../model/factory.ts";
import { effectiveTeam } from "./myTeam.ts";
import type { BattleState, Session } from "../model/types.ts";
import { sessionReduce } from "./reducer.ts";
import type { SessionAction } from "./reducer.ts";
import { finishGame, logTurn, startGame } from "../history/store.ts";
import type { GameResult } from "../history/gamelog.ts";
import { adviceFor, compareToAdvice } from "../history/advice.ts";
import type { Action as SimAction } from "../sim/actions.ts";

const STORAGE_KEY = "champions-battle-session-v1";

/**
 * Fill in fields added after a board was saved, so an in-progress battle is not
 * lost to a version bump.
 */
function migrate(state: BattleState): BattleState {
  const mons: BattleState["mons"] = {};
  for (const [uid, m] of Object.entries(state.mons)) {
    mons[uid] = {
      ...m,
      turnsOnField: m.turnsOnField ?? 0,
      protectStreak: m.protectStreak ?? 0,
      lastMoveName: m.lastMoveName ?? null,
      encoreTurnsLeft: m.encoreTurnsLeft ?? 0,
      mustRecharge: m.mustRecharge ?? false,
      speedCandidates: m.speedCandidates ?? null,
      statBounds: m.statBounds ?? {},
      brought: m.brought ?? (m.side === "me" ? "confirmed" : "possible"),
      revealed: {
        ...m.revealed,
        ruledOut: m.revealed?.ruledOut ?? [],
        itemRuledOut: m.revealed?.itemRuledOut ?? [],
        abilityRuledOut: m.revealed?.abilityRuledOut ?? [],
      },
    };
  }
  return { ...state, mons };
}

function loadSession(): Session {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return newSession(effectiveTeam());
    const parsed = JSON.parse(raw) as { present?: BattleState };
    if (!parsed?.present?.mons || !parsed.present.sides) return newSession(effectiveTeam());
    // Undo history is intentionally not persisted.
    return { present: migrate(parsed.present), past: [], future: [] };
  } catch {
    return newSession(effectiveTeam());
  }
}

interface BattleContextValue {
  state: BattleState;
  session: Session;
  dispatch: (a: SessionAction) => void;
  canUndo: boolean;
  canRedo: boolean;
}

const BattleContext = createContext<BattleContextValue | null>(null);

export function BattleProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(sessionReduce, undefined, loadSession);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ present: session.present }));
    } catch {
      /* storage full or unavailable - the app still works, just not persisted */
    }
  }, [session.present]);

  // --- game log ------------------------------------------------------------
  //
  // A turn can only be recorded once the reducer has produced the board that
  // followed it, so the BEFORE board is stashed at dispatch time and the write
  // happens on the next render. Undo/redo are deliberately not logged: the log
  // is a record of games played, not of the tool being driven.
  const pending = useRef<{
    before: BattleState;
    script: string;
    played: Record<string, SimAction>;
  } | null>(null);

  const dispatchAndLog = useCallback((a: SessionAction) => {
    if (a.type === "APPLY_TURN_SCRIPT") {
      const played: Record<string, SimAction> = {};
      for (const e of a.entries) {
        if (e.actorUid && e.action) played[e.actorUid] = e.action;
      }
      pending.current = { before: session.present, script: a.script, played };
    }
    dispatch(a);
  }, [session.present]);

  useEffect(() => {
    const p = pending.current;
    if (!p || p.before === session.present) return;
    pending.current = null;

    // What the tool recommended for THIS board, published by the planner worker
    // or by the line ranker. Null when neither had answered yet - which is a
    // real state and is recorded as such rather than guessed at.
    const advice = adviceFor(p.before);
    const cmp = advice ? compareToAdvice(p.before, advice, p.played) : null;
    logTurn(
      p.before,
      session.present,
      p.script,
      advice ? advice.label : null,
      cmp ? cmp.followed : null,
      {
        adviceSource: advice?.source ?? null,
        adviceDepth: advice?.depth ?? null,
        adviceProven: advice?.proven ?? false,
        adviceMatch: cmp ? cmp.match : null,
        adviceDiverged: cmp ? cmp.diverged : [],
      }
    );
  }, [session.present]);

  const value = useMemo<BattleContextValue>(
    () => ({
      state: session.present,
      session,
      dispatch: dispatchAndLog,
      canUndo: session.past.length > 0,
      canRedo: session.future.length > 0,
    }),
    [session, dispatchAndLog]
  );

  return <BattleContext.Provider value={value}>{children}</BattleContext.Provider>;
}

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error("useBattle must be used inside <BattleProvider>");
  return ctx;
}

/**
 * Clear the saved board and start a new game.
 *
 * The result of the game just finished is what makes the log worth keeping - a
 * line you played is only evidence once you know whether you won - so it is
 * closed out here rather than left dangling.
 */
export function useHardReset(): (result?: GameResult) => void {
  const { dispatch } = useBattle();
  return useCallback(
    (result: GameResult = "unfinished") => {
      finishGame(result);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        /* ignore */
      }
      const fresh = newSession(effectiveTeam());
      startGame(fresh.present);
      dispatch({ type: "RESET", team: effectiveTeam() });
    },
    [dispatch]
  );
}
