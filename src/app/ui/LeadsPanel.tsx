// Turn 1: what their lead is telling you, and what you do about it.
// Only shown on the lead turn - after that the board itself is the information.
import { useMemo } from "react";
import { useBattle } from "../state/store.tsx";
import { openingRead } from "../battle/leads.ts";
import { activeProfile } from "../battle/stats.ts";
import type { MonState } from "../model/types.ts";

const nameOf = (m: MonState) => activeProfile(m).displayName;

export default function LeadsPanel() {
  const { state } = useBattle();
  const read = useMemo(() => openingRead(state), [state]);

  if (!read.isLeadTurn || read.plans.length === 0) return null;

  return (
    <div className="panel leadpanel">
      <div className="panel-title">
        The leads
        <span className="count">turn 1 - where they commit to a plan</span>
      </div>
      <div className="risk-text" style={{ marginBottom: 8 }}>
        {read.headline}
      </div>

      <div className="col">
        {read.plans.map((p, i) => (
          <div key={`${p.by.uid}-${p.kind}-${i}`} className="threatcard">
            <div className="threatcard-head">
              <span className="tgt-name">{nameOf(p.by)}</span>
              <span className="spacer" />
              <span className={`tag ${p.probability >= 0.6 ? "status" : "assumed"}`}>
                {p.probability >= 1 ? "certain" : `${Math.round(p.probability * 100)}%`}
              </span>
            </div>
            <div className="risk-text">{p.text}</div>
            {p.counter && <div className="because">{p.counter}</div>}
          </div>
        ))}
      </div>

      {read.races.length > 0 && (
        <div className="col" style={{ marginTop: 10 }}>
          {read.races.map((r) => (
            <div key={r.kind} className="itemswing">
              <span className="tag assumed">RACE</span>
              <span>
                {r.text}
                {r.assumed && (
                  <span className="dimmer"> Their Speed is assumed, not measured.</span>
                )}
              </span>
            </div>
          ))}
        </div>
      )}

      {read.turnOneOnly.length > 0 && (
        <div className="col" style={{ marginTop: 10 }}>
          {read.turnOneOnly.map((t) => (
            <div key={t} className="hint warn">{t}</div>
          ))}
        </div>
      )}
    </div>
  );
}
