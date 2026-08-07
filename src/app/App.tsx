import { useState } from "react";
import { BattleProvider, useBattle, useHardReset } from "./state/store.tsx";
import BoardView from "./ui/BoardView.tsx";
import FieldBar from "./ui/FieldBar.tsx";
import LinesPanel from "./ui/LinesPanel.tsx";
import PlanTab from "./ui/PlanTab.tsx";
import PreviewTab from "./ui/PreviewTab.tsx";
import LeadsPanel from "./ui/LeadsPanel.tsx";
import ConsolePanel from "./ui/ConsolePanel.tsx";
import TurnInput from "./ui/TurnInput.tsx";
import TeamPreview from "./ui/TeamPreview.tsx";
import TeamTab from "./ui/TeamTab.tsx";
import SpeedTab from "./ui/SpeedTab.tsx";
import OptimizerTab from "./ui/OptimizerTab.tsx";
import TurnLog from "./ui/TurnLog.tsx";
import HistoryTab from "./ui/HistoryTab.tsx";

type TabId = "battle" | "preview" | "plan" | "speed" | "team" | "sp" | "log" | "history";

const TABS: { id: TabId; label: string }[] = [
  { id: "battle", label: "Battle" },
  { id: "preview", label: "Preview" },
  { id: "plan", label: "Plan" },
  { id: "speed", label: "Speed" },
  { id: "history", label: "History" },
  { id: "team", label: "My team" },
  { id: "sp", label: "SP optimizer" },
  { id: "log", label: "Log" },
];

function Shell() {
  const { state, dispatch, canUndo, canRedo } = useBattle();
  const [tab, setTab] = useState<TabId>("battle");
  const hardReset = useHardReset();
  // Two-step, because one stray tap between games should not cost you a board
  // you are halfway through recording - and because the second step is where
  // the result gets recorded, which is what makes the log worth anything.
  const [confirmNew, setConfirmNew] = useState(false);

  const startNewGame = (result: "win" | "loss" | "unfinished") => {
    hardReset(result);
    setConfirmNew(false);
    setTab("battle");
  };

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-row">
          <span className="brand">
            Champions <span>Battle Assistant</span>
          </span>
          <span className="spacer" />
          {confirmNew ? (
            <>
              <span className="newgame-ask">How did it go?</span>
              <button className="btn xs good" onClick={() => startNewGame("win")}>
                Won
              </button>
              <button className="btn xs danger" onClick={() => startNewGame("loss")}>
                Lost
              </button>
              <button className="btn xs" onClick={() => startNewGame("unfinished")}>
                Skip
              </button>
              <button className="btn xs" onClick={() => setConfirmNew(false)}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="btn xs"
              onClick={() => setConfirmNew(true)}
              title="Clear the board and their team, keep my team"
            >
              New game
            </button>
          )}
          <span
            className="build-stamp mono"
            title="Build id - quote this in a bug report"
          >
            {__BUILD_ID__}
          </span>
          <span className="turn-pill">Turn {state.turn}</span>
        </div>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              className="tab"
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === "battle" && (
        <>
          {/* The console drives the whole game; everything under it is detail
              you can drop into when you want it, not steps you have to take. */}
          <ConsolePanel />
          <BoardView />
          <LeadsPanel />
          <TeamPreview />
          <TurnInput />
          <FieldBar />
          <LinesPanel />
        </>
      )}
      {tab === "preview" && <PreviewTab />}
      {tab === "plan" && <PlanTab />}
      {tab === "speed" && <SpeedTab />}
      {tab === "team" && <TeamTab />}
      {tab === "sp" && <OptimizerTab />}
      {tab === "history" && <HistoryTab />}
      {tab === "log" && <TurnLog />}

      <div className="bottombar">
        <div className="bottombar-inner">
          <button
            className="btn"
            disabled={!canUndo}
            onClick={() => dispatch({ type: "UNDO" })}
          >
            Undo
          </button>
          <button
            className="btn"
            disabled={!canRedo}
            onClick={() => dispatch({ type: "REDO" })}
          >
            Redo
          </button>
          <button
            className="btn primary grow"
            onClick={() => dispatch({ type: "NEXT_TURN" })}
          >
            Next turn - {state.turn} to {state.turn + 1}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <BattleProvider>
      <Shell />
    </BattleProvider>
  );
}
