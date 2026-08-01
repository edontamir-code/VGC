// Type the turn as it plays out. The order you type IS the speed evidence.
import { useMemo, useState } from "react";
import { useBattle } from "../state/store.tsx";
import { parseTurn } from "../input/parseTurn.ts";
import { activeMons } from "../battle/resolver.ts";
import { deriveObservations, applyObservations, speedRange } from "../battle/speedInference.ts";
import { detectContradictions } from "../input/contradictions.ts";

const EXAMPLES = [
  "I protect, he protects, he tailwinds",
  "chomp eq, gambit sucker on whims, whims tw, incin fo chomp",
  "1 protect, 3 fake out on glim, 2 heat wave, 4 moonblast",
];

export default function TurnInput() {
  const { state, dispatch } = useBattle();
  const [text, setText] = useState("");
  const [showHelp, setShowHelp] = useState(false);

  const foes = activeMons(state, "opp");
  const mine = activeMons(state, "me");
  const ready = foes.length > 0 && mine.length > 0;

  const parsed = useMemo(
    () => (text.trim() && ready ? parseTurn(text, state) : null),
    [text, state, ready]
  );

  // Preview what the order would teach us about their Speed, before committing.
  const speedPreview = useMemo(() => {
    if (!parsed) return [];
    const entries = parsed.entries
      .filter((e) => e.actorUid)
      .map((e) => ({ actorUid: e.actorUid!, moveName: e.moveName }));
    const updates = applyObservations(state, deriveObservations(state, entries));
    return Object.entries(updates).map(([uid, candidates]) => {
      const before = speedRange(state.mons[uid]);
      const after = { min: candidates[0], max: candidates[candidates.length - 1] };
      return {
        uid,
        name: state.mons[uid].set.name,
        before: `${before.min}-${before.max}`,
        after: `${after.min}-${after.max}`,
        exact: candidates.length === 1,
      };
    });
  }, [parsed, state]);

  const contradictions = useMemo(() => {
    if (!parsed) return [];
    return detectContradictions(
      state,
      parsed.entries
        .filter((e) => e.actorUid && e.moveName)
        .map((e) => ({ actorUid: e.actorUid!, moveName: e.moveName }))
    );
  }, [parsed, state]);

  const apply = () => {
    if (!parsed) return;
    const entries = parsed.entries
      .filter((e) => e.actorUid && e.action)
      .map((e) => ({ actorUid: e.actorUid!, moveName: e.moveName, action: e.action! }));
    const effects = parsed.effects.map((f) =>
      f.kind === "faint"
        ? ({ kind: "faint", uid: f.uid } as const)
        : ({ kind: "hp", uid: f.uid, pct: f.pct, exact: f.exact } as const)
    );
    if (!entries.length && !effects.length) return;
    dispatch({ type: "APPLY_TURN_SCRIPT", entries, effects, script: text.trim() });
    setText("");
  };

  if (!ready) return null;

  return (
    <div className="panel">
      <div className="panel-title">
        Record the turn
        <span className="count">type it in the order it happened</span>
      </div>

      <textarea
        className="turn-input mono"
        rows={2}
        value={text}
        placeholder="I protect, he protects, he tailwinds"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) apply();
        }}
      />

      {parsed && (
        <div className="parse-preview">
          {parsed.entries.map((e) => (
            <div key={e.index} className={`parse-row ${e.problem ? "bad" : ""}`}>
              <span className="parse-idx mono">{e.index}</span>
              <span className="parse-actor">{e.actorName}</span>
              <span className="dim">→</span>
              <span className="parse-move">{e.moveName ?? "?"}</span>
              {e.targetName && <span className="dimmer">on {e.targetName}</span>}
              {e.problem && <span className="tag status">{e.problem}</span>}
              {e.actorAmbiguity.length > 1 && !e.problem && (
                <span className="tag assumed">
                  assumed {e.actorName} of {e.actorAmbiguity.length}
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {parsed && parsed.effects.length > 0 && (
        <div className="parse-preview">
          {parsed.effects.map((f, i) => (
            <div key={i} className="parse-row">
              <span className="parse-idx mono">•</span>
              <span className="parse-actor">{f.name}</span>
              <span className="dim">→</span>
              <span className="parse-move">
                {f.kind === "faint"
                  ? "fainted"
                  : f.pct !== undefined
                    ? `${f.pct}% HP`
                    : `${f.exact} HP`}
              </span>
              <span className="dimmer tiny">overrides the simulated roll</span>
            </div>
          ))}
        </div>
      )}

      {contradictions.length > 0 && (
        <div className="contradiction">
          <div className="breakers-title">That order should not be possible</div>
          {contradictions.map((c, i) => (
            <div key={i} style={{ marginBottom: 6 }}>
              <div className="risk-text">{c.text}</div>
              <div className="tiny" style={{ color: "var(--roll)", marginTop: 2 }}>
                {c.suggestion}
              </div>
            </div>
          ))}
          <div className="hint">
            Recording it anyway is fine — but one of the assumed sets is wrong, and this
            is a free chance to fix it.
          </div>
        </div>
      )}

      {speedPreview.length > 0 && (
        <div className="speed-learn">
          <div className="breakers-title">This order tells us</div>
          {speedPreview.map((s) => (
            <div key={s.uid} className="breaker mono">
              {s.name} Speed {s.before} → <b>{s.after}</b>
              {s.exact ? " (exact)" : ""}
            </div>
          ))}
        </div>
      )}

      <div className="row" style={{ marginTop: 8 }}>
        <button className="btn primary grow" disabled={!parsed?.entries.length} onClick={apply}>
          Apply turn {state.turn}
        </button>
        <button className="btn sm" onClick={() => setShowHelp(!showHelp)}>
          {showHelp ? "hide" : "how"}
        </button>
      </div>

      {showHelp && (
        <div className="hint" style={{ marginTop: 8 }}>
          Separate actions with commas, in the order they resolved. Refer to a Pokemon by
          name or shorthand (<span className="mono">chomp</span>,{" "}
          <span className="mono">gambit</span>, <span className="mono">whims</span>), by
          slot number 1-4 (yours are 1-2), or just say <span className="mono">I</span> /{" "}
          <span className="mono">he</span>. Moves take shorthand too (
          <span className="mono">eq</span>, <span className="mono">cc</span>,{" "}
          <span className="mono">fo</span>, <span className="mono">tw</span>). Add a target
          with <span className="mono">on glim</span>. Ctrl/Cmd+Enter applies.
          <div style={{ marginTop: 6 }}>
            {EXAMPLES.map((ex) => (
              <div key={ex}>
                <button className="btn xs" onClick={() => setText(ex)}>
                  {ex}
                </button>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 6 }}>
            Damage is applied at the average roll, since the turn already happened —
            correct any HP on the board if you can see the real numbers.
          </div>
        </div>
      )}
    </div>
  );
}
