// The board: 2 active per side, plus bench, plus the add/scout picker.
import { useState } from "react";
import { THREATS } from "../../data/threats.js";
import { TEAM } from "../../data/team.js";
import { useBattle } from "../state/store.tsx";
import { makeMonState } from "../state/reducer.ts";
import { setFromThreat, setFromTeam } from "../model/factory.ts";
import type { MonState, SideId } from "../model/types.ts";
import { MonCard, EmptySlot } from "./MonCard.tsx";
import MonEditor from "./MonEditor.tsx";

function AddPicker({
  side,
  slot,
  onClose,
}: {
  side: SideId;
  slot: number;
  onClose: () => void;
}) {
  const { state, dispatch } = useBattle();
  const bench = state.sides[side].bench
    .map((u) => state.mons[u])
    .filter((m): m is MonState => Boolean(m));

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <span className="drawer-title">
            {side === "me" ? "Send out" : "Add opponent"} - slot {slot + 1}
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>

        {bench.length > 0 && (
          <div className="panel">
            <div className="panel-title">On the bench</div>
            <div className="col">
              {bench.map((m) => (
                <button
                  key={m.uid}
                  className="btn"
                  onClick={() => {
                    dispatch({ type: "SWITCH_IN", side, slot, uid: m.uid });
                    onClose();
                  }}
                >
                  {m.set.name} {m.fainted ? "(fainted)" : ""}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="panel">
          <div className="panel-title">
            {side === "opp" ? "Common Reg M-B threats" : "Your team"}
          </div>
          <div className="hint" style={{ marginBottom: 8 }}>
            {side === "opp"
              ? "Loads the common set as an ASSUMPTION. Confirm each part as you see it."
              : "Your own sets are known, so their numbers are deterministic."}
          </div>
          <div className="col">
            {side === "opp"
              ? THREATS.map((t) => (
                  <button
                    key={t.id}
                    className="btn"
                    aria-label={`${t.name}, ${t.item}, ${t.ability}`}
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => {
                      dispatch({
                        type: "ADD_MON",
                        side,
                        slot,
                        mon: makeMonState(setFromThreat(t), side, "threat"),
                      });
                      onClose();
                    }}
                  >
                    <span>{t.name}</span>
                    <span className="dimmer tiny">{t.item}</span>
                  </button>
                ))
              : TEAM.map((t) => (
                  <button
                    key={t.name}
                    className="btn"
                    aria-label={`${t.mega ?? t.name}, ${t.item}, ${t.ability}`}
                    style={{ justifyContent: "flex-start" }}
                    onClick={() => {
                      dispatch({
                        type: "ADD_MON",
                        side,
                        slot,
                        mon: makeMonState(setFromTeam(t), side, "team"),
                      });
                      onClose();
                    }}
                  >
                    <span>{t.mega ?? t.name}</span>
                    <span className="dimmer tiny">{t.item}</span>
                  </button>
                ))}
          </div>
        </div>
      </div>
    </>
  );
}

function Side({
  side,
  onSelect,
  onAdd,
}: {
  side: SideId;
  onSelect: (uid: string) => void;
  onAdd: (slot: number) => void;
}) {
  const { state } = useBattle();
  const s = state.sides[side];
  const bench = s.bench.map((u) => state.mons[u]).filter((m): m is MonState => Boolean(m));

  return (
    <div className="side-block">
      <div className="side-head">
        <span className={`side-tag ${side}`}>{side === "me" ? "YOU" : "OPPONENT"}</span>
        {bench.length > 0 && <span className="dimmer">{bench.length} on bench</span>}
      </div>
      <div className="slots">
        {s.active.map((uid, slot) => {
          const mon = uid ? state.mons[uid] : null;
          return mon ? (
            <MonCard key={uid} mon={mon} onClick={() => onSelect(mon.uid)} />
          ) : (
            <EmptySlot
              key={`empty-${slot}`}
              label={side === "me" ? "send out" : "add opponent"}
              onClick={() => onAdd(slot)}
            />
          );
        })}
      </div>
      {bench.length > 0 && (
        <div className="row" style={{ marginTop: 6 }}>
          {bench.map((m) => (
            <button
              key={m.uid}
              className={`btn xs ${m.fainted ? "danger" : ""}`}
              onClick={() => onSelect(m.uid)}
            >
              {m.set.name}
              {m.fainted ? " (KO)" : ` ${Math.round((100 * m.curHP) / m.maxHP)}%`}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BoardView() {
  const { state } = useBattle();
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState<{ side: SideId; slot: number } | null>(null);

  const mon = editing ? state.mons[editing] : null;

  return (
    <>
      <div className="board">
        <Side
          side="opp"
          onSelect={setEditing}
          onAdd={(slot) => setAdding({ side: "opp", slot })}
        />
        <Side
          side="me"
          onSelect={setEditing}
          onAdd={(slot) => setAdding({ side: "me", slot })}
        />
      </div>

      {mon && <MonEditor mon={mon} onClose={() => setEditing(null)} />}
      {adding && (
        <AddPicker
          side={adding.side}
          slot={adding.slot}
          onClose={() => setAdding(null)}
        />
      )}
    </>
  );
}
