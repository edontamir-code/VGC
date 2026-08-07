// Enter their six at team preview. Their back line is what makes switching
// answerable, so this is the highest-leverage 15 seconds of the whole battle.
import { useMemo, useState } from "react";
import { useBattle } from "../state/store.tsx";
import { parseRoster } from "../input/parseRoster.ts";
import { makeMonState } from "../state/reducer.ts";
import { broughtCounts, possibleSwitchIns } from "../battle/roster.ts";
import { megaRead } from "../battle/mega.ts";
import { ROSTER_SIZE } from "../model/types.ts";

export default function TeamPreview() {
  const { state, dispatch } = useBattle();
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  const counts = broughtCounts(state, "opp");
  const parsed = useMemo(() => (text.trim() ? parseRoster(text) : null), [text]);
  const switchIns = possibleSwitchIns(state, "opp");
  const read = megaRead(state, "opp");

  const add = () => {
    if (!parsed) return;
    const mons = parsed.entries
      .filter((e) => e.species)
      .map((e) => makeMonState(e.species!.make(), "opp", "threat"));
    if (!mons.length) return;
    dispatch({ type: "ADD_ROSTER", side: "opp", mons });
    setText("");
    setOpen(false);
  };

  return (
    <div className="panel">
      <div className="panel-title">
        Their team
        <span className="count">
          {counts.total === 0
            ? "not entered - switches are invisible to the planner"
            : `${counts.total} known · ${switchIns.length} could come in`}
        </span>
      </div>

      {read.text && (
        <div className="hint" style={{ marginBottom: 8, color: "var(--accent)" }}>
          {read.text}
        </div>
      )}

      {counts.total === 0 && !open && (
        <div className="hint warn" style={{ marginBottom: 8 }}>
          Without their roster the planner assumes they can never switch, which makes
          every guarantee too optimistic. Enter their six from team preview.
        </div>
      )}

      {!open ? (
        <div className="row">
          <button className="btn sm" onClick={() => setOpen(true)}>
            {counts.total === 0 ? "Enter their six" : "Add more"}
          </button>
          {switchIns.length > 0 && (
            <span className="dimmer tiny">
              back line: {switchIns.map((m) => m.set.name).join(", ")}
            </span>
          )}
        </div>
      ) : (
        <>
          <input
            className="mono"
            autoFocus
            value={text}
            placeholder="zard, incin, gambit, chomp, bascu, whims"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") add();
              if (e.key === "Escape") setOpen(false);
            }}
          />
          {parsed && (
            <div className="parse-preview">
              {parsed.entries.map((e, i) => (
                <div key={i} className={`parse-row ${e.problem ? "bad" : ""}`}>
                  <span className="parse-idx mono">{i + 1}</span>
                  <span className="dimmer">{e.raw}</span>
                  <span className="dim">→</span>
                  <span className="parse-move">{e.species?.name ?? "?"}</span>
                  {e.statsOnly && (
                    <span className="tag assumed" title="Stats only - no competitive set on file">
                      stats only
                    </span>
                  )}
                  {e.problem && <span className="tag status">{e.problem}</span>}
                </div>
              ))}
            </div>
          )}
          {parsed && parsed.unknown.length > 0 && (
            <div className="hint warn" style={{ marginTop: 6 }}>
              Not legal in this format: <b>{parsed.unknown.join(", ")}</b>. Check the
              spelling — all 310 Reg M-A/M-B Pokemon are searchable.
            </div>
          )}
          <div className="row" style={{ marginTop: 8 }}>
            <button className="btn primary grow" disabled={!parsed?.matched} onClick={add}>
              Add {parsed?.matched ?? 0} to their team
            </button>
            <button className="btn sm" onClick={() => setOpen(false)}>
              cancel
            </button>
          </div>
          <div className="hint" style={{ marginTop: 6 }}>
            You see {ROSTER_SIZE} at preview and they bring 4. Everything you enter starts
            as "possibly brought"; seeing one confirms it, and once four are confirmed the
            rest are ruled out automatically.
          </div>
        </>
      )}
    </div>
  );
}
