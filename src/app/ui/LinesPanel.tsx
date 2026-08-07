// "If I click X, do I outspeed and KO?" - ranked, with the guarantee spelled out.
import { useEffect, useMemo } from "react";
import { useBattle } from "../state/store.tsx";
import { publishAdvice } from "../history/advice.ts";
import { incomingThreats, activeMons } from "../battle/resolver.ts";
import type { LineTarget } from "../battle/resolver.ts";
import { rankedLinesWithRisk } from "../battle/leadRisk.ts";
import type { RankedLine } from "../battle/leadRisk.ts";
import { VERDICT_LABEL } from "../battle/damage.ts";
import BeforeYouAct from "./BeforeYouAct.tsx";

function SpeedNote({ t }: { t: LineTarget }) {
  const s = t.speed;
  if (s.tie) {
    return <span className="speed-note speed-tie">SPEED TIE {s.aSpeed} - coinflip</span>;
  }
  if (s.byPriority) {
    return (
      <span className={`speed-note ${s.first === "a" ? "speed-first" : "speed-second"}`}>
        {s.first === "a" ? "you first" : "they first"} (priority)
      </span>
    );
  }
  return (
    <span className={`speed-note ${s.first === "a" ? "speed-first" : "speed-second"}`}>
      {s.first === "a" ? "you first" : "they first"} {s.aSpeed} v {s.bSpeed}
    </span>
  );
}

function TargetRow({ t }: { t: LineTarget }) {
  const r = t.result;
  const name = t.target.hasMega || !t.target.set.baseForm
    ? t.target.set.name
    : t.target.set.speciesId;

  return (
    <div>
      <div className="tgt">
        <span className={`verdict v-${r.verdict}`}>{VERDICT_LABEL[r.verdict]}</span>
        <span className="tgt-name">{name}</span>
        {r.verdict !== "IMMUNE" && (
          <>
            <span className="tgt-num">
              {r.minPctCur}-{r.maxPctCur}% of current
            </span>
            <span className="tgt-num dimmer">
              ({r.min}-{r.max} vs {r.defenderCurHP} HP)
            </span>
          </>
        )}
        <span className="spacer" />
        <SpeedNote t={t} />
      </div>

      {t.koBeforeTheyAct && (
        <div className="boundary certain">KO lands before they act.</div>
      )}

      {t.boundary && (
        <div className={`boundary ${t.boundary.kind}`}>{t.boundary.text}</div>
      )}

      {r.modifiers.length > 0 && (
        <div className="assumptions">{r.modifiers.join(" | ")}</div>
      )}
      <div className="assumptions">
        {r.resolvedType} {r.power} BP
        {r.hits > 1 ? ` x${r.hits} hits` : ""} - x{r.typeMult} - {r.assumptions.join(" - ")}
      </div>
    </div>
  );
}

function LineCard({ line, top }: { line: RankedLine; top: boolean }) {
  if (line.kind !== "attack") {
    return (
      <div className="line">
        <div className="line-head">
          <span className="line-move">{line.moveName}</span>
          <span className="line-by">{line.attacker.set.name}</span>
        </div>
        <div className="notes">{line.headline.replace(`${line.moveName} - `, "")}</div>
        {line.notes.map((n) => (
          <div className="notes" key={n}>{n}</div>
        ))}
      </div>
    );
  }

  return (
    <div className={`line ${top ? "top" : ""} ${line.discounted ? "discounted" : ""}`}>
      <div className="line-head">
        <span className="line-move">{line.moveName}</span>
        <span className="line-by">
          {line.attacker.hasMega || !line.attacker.set.baseForm
            ? line.attacker.set.name
            : line.attacker.set.speciesId}
        </span>
        {line.spread && <span className="tag">SPREAD - hits both</span>}
        <span className="spacer" />
        <span className={`tag ${line.certainty === "assumed" ? "assumed" : "confirmed"}`}>
          {line.certainty}
        </span>
      </div>

      {line.risks.length > 0 && (
        <div className="line-risk">
          {line.risks.map((r, i) => (
            <div key={i}>{r.text}</div>
          ))}
        </div>
      )}

      <div className="line-targets">
        {line.targets.map((t) => (
          <TargetRow key={t.uid} t={t} />
        ))}
      </div>

      {line.notes.map((n) => (
        <div className="notes" key={n}>Note: {n}</div>
      ))}
    </div>
  );
}

export default function LinesPanel() {
  const { state } = useBattle();
  const myActive = activeMons(state, "me");
  const oppActive = activeMons(state, "opp");

  const { lines, risks } = useMemo(
    () =>
      oppActive.length ? rankedLinesWithRisk(state) : { lines: [], risks: [] },
    [state, oppActive.length]
  );
  const threats = useMemo(
    () => (oppActive.length && myActive.length ? incomingThreats(state).slice(0, 6) : []),
    [state, oppActive.length, myActive.length]
  );

  // Hand the top line to the game log. This is the fallback source: it is
  // always available, whereas the planner only publishes if the Plan tab has
  // been open long enough for the worker to answer. Planner advice takes
  // precedence for the same board.
  useEffect(() => {
    const top = lines.find((l) => l.kind === "attack") ?? lines[0];
    if (!top) return;
    const target = top.targets[0]?.uid;
    publishAdvice(state, {
      label: `${top.attacker.set.name}: ${top.moveName}`,
      plan: { [top.attackerUid]: { kind: "move", moveName: top.moveName, targetUid: target } },
      source: "lines",
      depth: null,
      proven: false,
    });
  }, [state, lines]);

  if (!oppActive.length) {
    return (
      <div className="panel">
        <div className="panel-title">Your lines</div>
        <div className="empty-note">
          Add the opponent's active Pokemon to get speed + KO verdicts.
        </div>
      </div>
    );
  }

  return (
    <>
      <BeforeYouAct risks={risks} />

      <div className="panel">
        <div className="panel-title">
          Your lines
          <span className="count">ranked - accounts for what they do first</span>
        </div>
        {lines.length === 0 ? (
          <div className="empty-note">No actions available.</div>
        ) : (
          lines.map((l, i) => (
            <LineCard key={`${l.attackerUid}-${l.moveName}`} line={l} top={i === 0} />
          ))
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          Incoming
          <span className="count">what they can do to you right now</span>
        </div>
        {threats.length === 0 ? (
          <div className="empty-note">Nothing to resolve yet.</div>
        ) : (
          threats.map((t) => (
            <div className="tgt" key={`${t.attacker.uid}-${t.moveName}-${t.defender.uid}`}>
              <span className={`verdict v-${t.result.verdict}`}>
                {VERDICT_LABEL[t.result.verdict]}
              </span>
              <span className="tgt-name">
                {t.attacker.set.name} {t.moveName}
              </span>
              <span className="dim small">to</span>
              <span className="tgt-name">
                {t.defender.hasMega || !t.defender.set.baseForm
                  ? t.defender.set.name
                  : t.defender.set.speciesId}
              </span>
              <span className="tgt-num">
                {t.result.minPctCur}-{t.result.maxPctCur}%
              </span>
              <span className="spacer" />
              <span
                className={`speed-note ${
                  t.speed.tie ? "speed-tie" : t.speed.first === "a" ? "speed-second" : "speed-first"
                }`}
              >
                {t.speed.tie
                  ? `TIE ${t.speed.aSpeed}`
                  : t.speed.first === "a"
                    ? `they first ${t.speed.aSpeed} v ${t.speed.bSpeed}`
                    : `you first ${t.speed.bSpeed} v ${t.speed.aSpeed}`}
              </span>
              {t.killsFirst && <span className="tag status">KOs you first</span>}
            </div>
          ))
        )}
        <div className="hint" style={{ marginTop: 8 }}>
          Opponent moves shown are from their assumed common set unless you have
          confirmed them in the mon editor.
        </div>
      </div>
    </>
  );
}
