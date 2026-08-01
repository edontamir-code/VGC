// The planner: lines ranked by what they GUARANTEE, with the guarantee's
// exact strength spelled out and the unknowns that would break it named.
import { useState } from "react";
import { useBattle } from "../state/store.tsx";
import { DEFAULT_SEARCH } from "../search/plan.ts";
import type { PlanLine, SearchOpts } from "../search/plan.ts";
import { usePlanner } from "../search/usePlanner.ts";
import { activeMons } from "../battle/resolver.ts";
import { scout, scoutingProgress } from "../battle/scouting.ts";
import { material } from "../search/evaluate.ts";

function Badge({ line }: { line: PlanLine }) {
  if (line.proven) return <span className="pin pin-proven">PROVEN PIN</span>;
  if (line.pinVsPossible) return <span className="pin pin-strong">PIN vs any set</span>;
  if (line.pinVsAssumed) return <span className="pin pin-cond">PIN if assumed set</span>;
  if (line.isPin) return <span className="pin pin-cond">holds at depth</span>;
  return <span className="pin pin-none">no guarantee</span>;
}

function LineCard({ line, rank }: { line: PlanLine; rank: number }) {
  const [open, setOpen] = useState(rank === 0);
  const m = line.worst.material;

  return (
    <div className={`planline ${line.pinVsPossible ? "is-pin" : ""}`}>
      <div className="planline-head" onClick={() => setOpen(!open)}>
        <span className="plan-rank mono">{rank + 1}</span>
        <span className="plan-label">{line.label}</span>
        <span className="spacer" />
        <Badge line={line} />
      </div>

      <div className="plan-worst">
        <span className="dim">worst case:</span>{" "}
        <span className="mono">
          {m.me}v{m.opp} alive
        </span>
        {line.worst.outcome !== "ongoing" && (
          <span className={`tag ${line.worst.outcome === "won" ? "confirmed" : "status"}`}>
            {line.worst.outcome === "won" ? "WIN" : "LOSS"}
          </span>
        )}
        <span className="dimmer"> · their best answer: {line.worst.replyLabel}</span>
      </div>

      {line.breakers.length > 0 && (
        <div className="breakers">
          <div className="breakers-title">This is a pin UNLESS:</div>
          {line.breakers.map((b, i) => (
            <div key={i} className="breaker">
              {b.monName} has <b>{b.moveName}</b>
            </div>
          ))}
          <div className="hint" style={{ marginTop: 4 }}>
            Rule these out or confirm them in the mon editor to make the answer
            deterministic.
          </div>
        </div>
      )}

      {line.unsimulated.length > 0 && (
        <div className="breakers unsim">
          <div className="breakers-title">Not simulated — judge these yourself:</div>
          {line.unsimulated.slice(0, 4).map((b, i) => (
            <div key={i} className="breaker">
              {b.monName} could have <b>{b.moveName}</b>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="plan-events">
          <div className="breakers-title">How the worst case plays out</div>
          {line.worst.events.length === 0 ? (
            <div className="dimmer tiny">nothing resolved</div>
          ) : (
            line.worst.events.map((e, i) => (
              <div key={i} className="plan-event mono">
                {e.text}
              </div>
            ))
          )}
        </div>
      )}

      <div className="assumptions">
        verified {line.horizon} turn{line.horizon === 1 ? "" : "s"} ahead ·{" "}
        {line.worst.exhaustive ? "every reply checked" : "replies beamed, not exhaustive"} ·
        my rolls minimum, theirs maximum · speed ties lost
      </div>
    </div>
  );
}

export default function PlanTab() {
  const { state } = useBattle();
  // Three turns by default: there is no reason to think less far ahead than the
  // engine can. It runs in a worker, so the cost is latency, never a freeze.
  const [depth, setDepth] = useState(3);
  const [mode, setMode] = useState<SearchOpts["arsenal"]>("possible");

  const foes = activeMons(state, "opp");
  const mineActive = activeMons(state, "me");
  const progress = scoutingProgress(foes);
  const canSearch = foes.length > 0 && mineActive.length > 0;

  const opts: SearchOpts = {
    depth,
    myBeam: depth > 2 ? 6 : DEFAULT_SEARCH.myBeam,
    theirBeam: depth > 2 ? 6 : DEFAULT_SEARCH.theirBeam,
    arsenal: mode,
  };

  const { lines, ms, searching, stale, error } = usePlanner(state, opts, canSearch);

  if (!foes.length || !mineActive.length) {
    return (
      <div className="panel">
        <div className="panel-title">Planner</div>
        <div className="empty-note">
          Put both sides on the board and the planner will search for lines they
          cannot beat.
        </div>
      </div>
    );
  }

  const base = material(state);
  const pins = lines.filter((l) => l.pinVsPossible).length;

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Planner
          <span className="count">
            {lines.length} plans · {ms}ms{stale ? " · updating" : ""}
          </span>
        </div>

        <div className="row">
          <span className="dim small">Look ahead</span>
          {[1, 2, 3].map((d) => (
            <button
              key={d}
              className={`btn sm ${depth === d ? "on" : ""}`}
              onClick={() => setDepth(d)}
            >
              {d} turn{d > 1 ? "s" : ""}
            </button>
          ))}
          {searching && <span className="searching mono">searching...</span>}
        </div>

        {error && (
          <div className="hint warn" style={{ marginTop: 8 }}>
            Search failed: {error}
          </div>
        )}

        <div className="row" style={{ marginTop: 8 }}>
          <span className="dim small">Plan against</span>
          <button
            className={`btn sm ${mode === "assumed" ? "on" : ""}`}
            onClick={() => setMode("assumed")}
          >
            assumed set
          </button>
          <button
            className={`btn sm ${mode === "possible" ? "on" : ""}`}
            onClick={() => setMode("possible")}
          >
            everything they could have
          </button>
        </div>

        <div className="hint" style={{ marginTop: 10 }}>
          {depth === 1 ? (
            <>
              Depth 1 checks <b>every</b> reply they have — a pin here is a proof.
            </>
          ) : (
            <>
              Depth {depth} beams their replies at the deeper plies, so a pin here is a
              strong indication rather than a proof. Each line says which it is, and
              depth 1 is available if you want the proof-grade answer.
            </>
          )}{" "}
          Currently {base.me}v{base.opp} on the board, {pins} line{pins === 1 ? "" : "s"}{" "}
          hold against any set they could be running. Searching runs off the main
          thread, so the app stays responsive while it thinks.
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Scouting
          <span className="count">
            {progress.confirmed}/{progress.slots} of their moves confirmed
          </span>
        </div>
        <div className="col">
          {foes.map((f) => {
            const s = scout(f);
            return (
              <div key={f.uid} className="scoutrow">
                <span className="tgt-name">{f.set.name}</span>
                <span className="spacer" />
                {s.fullyScouted ? (
                  <span className="tag confirmed">fully scouted</span>
                ) : (
                  <span className="tag assumed">
                    {s.slotsLeft} unknown of {s.possible.length} candidates
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Every move you confirm or rule out shrinks the search space and makes the
          guarantees stronger. Tap a Pokemon on the Battle tab to do it.
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Ranked by guaranteed floor
          <span className="count">not by best case</span>
        </div>
        {lines.slice(0, 12).map((l, i) => (
          <LineCard key={l.label} line={l} rank={i} />
        ))}
      </div>
    </>
  );
}
