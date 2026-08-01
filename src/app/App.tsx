import { useState } from "react";
import { BattleProvider, useBattle } from "./state/store.tsx";
import BoardView from "./ui/BoardView.tsx";
import FieldBar from "./ui/FieldBar.tsx";
import LinesPanel from "./ui/LinesPanel.tsx";
import PlanTab from "./ui/PlanTab.tsx";
import TurnInput from "./ui/TurnInput.tsx";
import TeamPreview from "./ui/TeamPreview.tsx";
import TeamTab from "./ui/TeamTab.tsx";
import SpeedTab from "./ui/SpeedTab.tsx";
import OptimizerTab from "./ui/OptimizerTab.tsx";
import TurnLog from "./ui/TurnLog.tsx";

type TabId = "battle" | "plan" | "speed" | "team" | "sp" | "log";

const TABS: { id: TabId; label: string }[] = [
  { id: "battle", label: "Battle" },
  { id: "plan", label: "Plan" },
  { id: "speed", label: "Speed" },
  { id: "team", label: "My team" },
  { id: "sp", label: "SP optimizer" },
  { id: "log", label: "Log" },
];

function Shell() {
  const { state, dispatch, canUndo, canRedo } = useBattle();
  const [tab, setTab] = useState<TabId>("battle");

  return (
    <div className="app">
      <div className="topbar">
        <div className="topbar-row">
          <span className="brand">
            Champions <span>Battle Assistant</span>
          </span>
          <span className="spacer" />
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
          <BoardView />
          <TeamPreview />
          <TurnInput />
          <FieldBar />
          <LinesPanel />
        </>
      )}
      {tab === "plan" && <PlanTab />}
      {tab === "speed" && <SpeedTab />}
      {tab === "team" && <TeamTab />}
      {tab === "sp" && <OptimizerTab />}
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
