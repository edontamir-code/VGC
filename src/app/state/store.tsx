// ===========================================================================
// React wiring for the BattleState session. Persists to localStorage so a
// refresh mid-game does not cost you the board.
// ===========================================================================
import { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from "react";
import type { ReactNode } from "react";
import { newSession } from "../model/factory.ts";
import { effectiveTeam } from "./myTeam.ts";
import type { BattleState, Session } from "../model/types.ts";
import { sessionReduce } from "./reducer.ts";
import type { SessionAction } from "./reducer.ts";

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
      speedCandidates: m.speedCandidates ?? null,
      brought: m.brought ?? (m.side === "me" ? "confirmed" : "possible"),
      revealed: { ...m.revealed, ruledOut: m.revealed?.ruledOut ?? [] },
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

  const value = useMemo<BattleContextValue>(
    () => ({
      state: session.present,
      session,
      dispatch,
      canUndo: session.past.length > 0,
      canRedo: session.future.length > 0,
    }),
    [session]
  );

  return <BattleContext.Provider value={value}>{children}</BattleContext.Provider>;
}

export function useBattle(): BattleContextValue {
  const ctx = useContext(BattleContext);
  if (!ctx) throw new Error("useBattle must be used inside <BattleProvider>");
  return ctx;
}

/** Clear the saved board (used by the Reset button). */
export function useHardReset(): () => void {
  const { dispatch } = useBattle();
  return useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    dispatch({ type: "RESET", team: effectiveTeam() });
  }, [dispatch]);
}
