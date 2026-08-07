// Team preview: do I have an answer to each of their six, and which four
// should I bring? This is the decision the whole tool exists to support.
//
// Two things this screen must never get wrong:
//  - only ONE of my Pokemon Mega Evolves, so a four with two Megas is not a
//    team I can play and must not be recommended
//  - a matchup can depend on an item I have not seen, and "it kills if it has
//    Life Orb" is a different piece of advice from "it kills"
import { useMemo, useState } from "react";
import { useBattle } from "../state/store.tsx";
import {
  buildAnswerMatrix,
  suggestBringFour,
  megaCapableMons,
  ANSWER_MAX_HITS,
} from "../battle/answers.ts";
import type { AnswerCell, AnswerVerdict } from "../battle/answers.ts";
import { conditionalPlans, CONDITION_LABEL } from "../battle/conditions.ts";
import { itemSensitivity } from "../battle/itemRisk.ts";
import { activeProfile } from "../battle/stats.ts";
import { koThreat } from "../battle/inference.ts";
import { uncertainty } from "../battle/candidates.ts";
import type { MonState } from "../model/types.ts";

const VERDICT_CLASS: Record<AnswerVerdict, string> = {
  answer: "v-answer",
  slow: "v-slow",
  trade: "v-trade",
  loses: "v-loses",
  walled: "v-walled",
};
const VERDICT_SHORT: Record<AnswerVerdict, string> = {
  answer: "WIN",
  slow: "SLOW",
  trade: "TIE",
  loses: "LOSE",
  walled: "-",
};

const nameOf = (m: MonState) => activeProfile(m).displayName;

/**
 * The item question, spelled out. Shown wherever a number could move because of
 * something we have not seen yet.
 */
function ItemSwing({ cell }: { cell: AnswerCell }) {
  const { state } = useBattle();
  const sens = useMemo(() => {
    if (!cell.theirBest) return null;
    return itemSensitivity(cell.theirs, cell.mine, cell.theirBest.moveName, state);
  }, [cell, state]);

  if (!sens || sens.known || !sens.text) return null;
  return (
    <div className="itemswing">
      <span className="tag assumed">ITEM</span>
      <span>{sens.text}</span>
    </div>
  );
}

/**
 * The item warning for a whole threat, rather than one arbitrary matchup.
 *
 * Scans every one of my Pokemon it could be facing and shows the swing that
 * matters most: an item that turns a hit you survive into one you do not is
 * worth far more than an item that makes an already-lethal hit lethal-er.
 */
function ThreatItemSwing({ cells }: { cells: AnswerCell[] }) {
  const { state } = useBattle();
  const pick = useMemo(() => {
    let fallback: { cell: AnswerCell; text: string } | null = null;
    for (const cell of cells) {
      if (!cell.theirBest) continue;
      const s = itemSensitivity(cell.theirs, cell.mine, cell.theirBest.moveName, state);
      if (!s || s.known || !s.text) continue;
      // A verdict swing against a Pokemon you were counting on is the headline.
      if (s.swings) return { cell, text: s.text };
      if (!fallback) fallback = { cell, text: s.text };
    }
    return fallback;
  }, [cells, state]);

  if (!pick) return null;
  return (
    <div className="itemswing">
      <span className="tag assumed">ITEM</span>
      <span>
        <b>vs {nameOf(pick.cell.mine)}:</b> {pick.text}
      </span>
    </div>
  );
}

function ItemTable({ cell }: { cell: AnswerCell }) {
  const { state } = useBattle();
  const sens = useMemo(() => {
    if (!cell.theirBest) return null;
    return itemSensitivity(cell.theirs, cell.mine, cell.theirBest.moveName, state);
  }, [cell, state]);

  if (!sens || sens.known || sens.outcomes.length < 2) return null;
  return (
    <div className="panel">
      <div className="panel-title">
        If they are holding...
        <span className="count">
          {cell.theirBest?.moveName} into {nameOf(cell.mine)}
        </span>
      </div>
      <div className="col">
        {sens.outcomes.map((o) => (
          <div key={o.item} className="tgt">
            <span className={`tag ${o.verdict === "DEAD" ? "status" : "confirmed"}`}>
              {o.verdict}
            </span>
            <span className="tgt-name">{o.item}</span>
            <span className="tgt-num dimmer">{Math.round(o.pct)}% of sets</span>
            <span className="tgt-num">
              {o.minPct}-{o.maxPct}%
            </span>
          </div>
        ))}
      </div>
      <div className="assumptions" style={{ marginTop: 8 }}>
        {sens.koProbability}% of their plausible sets score the KO here.
      </div>
    </div>
  );
}

function CellDetail({ cell, onClose }: { cell: AnswerCell; onClose: () => void }) {
  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <span className={`pin ${cell.verdict === "answer" ? "pin-strong" : "pin-none"}`}>
            {VERDICT_SHORT[cell.verdict]}
          </span>
          <span className="drawer-title">
            {nameOf(cell.mine)} vs {nameOf(cell.theirs)}
          </span>
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>

        <div className="panel">
          <div className="panel-title">The race</div>
          <div className="risk-text">{cell.reason}</div>
          <div className="assumptions" style={{ marginTop: 8 }}>
            confidence {cell.confidence}% - their Speed {cell.theirSpeed.min}-{cell.theirSpeed.max}
            {cell.theirSpeed.known ? " (exact)" : ""}
          </div>
          <ItemSwing cell={cell} />
        </div>

        <div className="panel">
          <div className="panel-title">Best hits</div>
          <div className="col">
            <div className="tgt">
              <span className="tag confirmed">YOURS</span>
              <span className="tgt-name">
                {cell.myBest ? cell.myBest.moveName : "nothing that damages it"}
              </span>
              {cell.myBest && (
                <>
                  <span className="tgt-num">{cell.myBest.hitsToKO} hit{cell.myBest.hitsToKO === 1 ? "" : "s"}</span>
                  <span className="tgt-num dimmer">
                    {cell.myBest.minPct}-{cell.myBest.maxPct}% x{cell.myBest.typeMult}
                  </span>
                </>
              )}
            </div>
            <div className="tgt">
              <span className="tag status">THEIRS</span>
              <span className="tgt-name">
                {cell.theirBest ? cell.theirBest.moveName : "nothing that damages you"}
              </span>
              {cell.theirBest && (
                <>
                  <span className="tgt-num">{cell.theirBest.hitsToKO} hit{cell.theirBest.hitsToKO === 1 ? "" : "s"}</span>
                  <span className="tgt-num dimmer">
                    {cell.theirBest.minPct}-{cell.theirBest.maxPct}%
                  </span>
                </>
              )}
            </div>
          </div>
        </div>

        <ItemTable cell={cell} />
      </div>
    </>
  );
}

export default function PreviewTab() {
  const { state, dispatch } = useBattle();
  const [detail, setDetail] = useState<AnswerCell | null>(null);

  const mine = useMemo(
    () => Object.values(state.mons).filter((m) => m.side === "me" && !m.fainted),
    [state.mons]
  );
  const theirs = useMemo(
    () => Object.values(state.mons).filter((m) => m.side === "opp" && !m.fainted),
    [state.mons]
  );
  const megaOptions = useMemo(() => megaCapableMons(state, "me"), [state]);

  const bring = useMemo(() => {
    if (!theirs.length || !mine.length) return null;
    return suggestBringFour(state, Math.min(4, mine.length));
  }, [state, mine.length, theirs.length]);

  // The Mega actually in force comes from the BOARD, not from a local toggle -
  // picking one here is a real decision that the battle screen and the planner
  // both have to see.
  const activeMega = useMemo(
    () => megaOptions.find((m) => m.hasMega)?.uid ?? null,
    [megaOptions]
  );

  const view = state;
  const matrix = useMemo(() => {
    if (!theirs.length || !mine.length) return null;
    return buildAnswerMatrix(view);
  }, [view, mine.length, theirs.length]);
  const viewMine = mine;
  const plans = useMemo(() => {
    if (!theirs.length || !mine.length) return [];
    return conditionalPlans(state, activeMega);
  }, [state, activeMega, mine.length, theirs.length]);

  if (!theirs.length) {
    return (
      <div className="panel">
        <div className="panel-title">Team preview</div>
        <div className="empty-note">
          Enter their team on the Battle tab and this becomes the bring-four advisor.
        </div>
      </div>
    );
  }
  if (!matrix || !bring) return null;

  const covered = matrix.coverage.filter((c) => c.covered).length;
  const totalThreats = matrix.coverage.length;
  const allCovered = matrix.uncovered.length === 0;

  // The matrix describes the board AS IT STANDS, but the recommendation is free
  // to prefer a different Mega. Left implicit that reads as a contradiction -
  // "4/6" above "covers 5 of 6" - so the gap is stated and made one tap to fix.
  const recMega = megaOptions.find((m) => m.uid === bring.megaUid) ?? null;
  const megaMismatch = bring.megaUid !== activeMega;
  const recCovered = megaMismatch
    ? bring.matrix.coverage.filter((c) => c.covered).length
    : covered;

  return (
    <>
      {/* --- which Mega am I built around? ----------------------------------- */}
      {megaOptions.length > 1 && (
        <div className="panel">
          <div className="panel-title">
            Your Mega
            <span className="count">only one Pokemon Mega Evolves per battle</span>
          </div>
          <div className="mega-row">
            {megaOptions.map((m) => {
              const on = activeMega === m.uid;
              return (
                <button
                  key={m.uid}
                  className={`chip-mega ${on ? "on" : ""}`}
                  onClick={() =>
                    dispatch({ type: "SET_MEGA", side: "me", uid: on ? null : m.uid })
                  }
                >
                  {m.set.megaName ?? m.set.name}
                  {bring.megaUid === m.uid && <span className="chip-rec">rec</span>}
                </button>
              );
            })}
            <button
              className={`chip-mega ${activeMega === null ? "on" : ""}`}
              onClick={() => dispatch({ type: "SET_MEGA", side: "me", uid: null })}
            >
              No Mega
            </button>
          </div>
          <div className="hint">
            This sets it on the actual board - the battle screen and the planner both use
            it. Every number below is computed with this one Mega Evolved and the rest in
            their base forms.
            {bring.megaUid !== activeMega && (
              <>
                {" "}
                <b className="warn">
                  Against this team the recommendation prefers{" "}
                  {megaOptions.find((m) => m.uid === bring.megaUid)?.set.megaName ?? "no Mega"}.
                </b>
              </>
            )}
          </div>
        </div>
      )}

      {/* --- the headline --------------------------------------------------- */}
      <div className={`panel headline ${allCovered ? "good" : "bad"}`}>
        <div className="headline-num mono">
          {covered}<span className="dimmer">/{totalThreats}</span>
        </div>
        <div className="headline-text">
          <div className="headline-main">
            {allCovered
              ? "You have an answer to everything they brought."
              : `No answer to ${matrix.uncovered.map((c) => nameOf(c.threat)).join(", ")}.`}
          </div>
          {megaMismatch && (
            <div className="megagap">
              Counted with{" "}
              <b>{megaOptions.find((m) => m.uid === activeMega)?.set.megaName ?? "no Mega"}</b> as
              your Mega.{" "}
              {recCovered > covered ? (
                <>
                  <b className="warn">
                    {recMega?.set.megaName ?? "No Mega"} covers {recCovered} instead.
                  </b>
                </>
              ) : (
                <>The recommendation uses {recMega?.set.megaName ?? "no Mega"}.</>
              )}
              <button
                className="btn xs"
                style={{ marginLeft: 8 }}
                onClick={() => dispatch({ type: "SET_MEGA", side: "me", uid: bring.megaUid })}
              >
                Use {recMega?.set.megaName ?? "no Mega"}
              </button>
            </div>
          )}
          <div className="hint">
            An "answer" KOs it in {ANSWER_MAX_HITS} hits or fewer AND does so before being
            KO'd, using your worst damage rolls against their best. Anything slower is
            marked SLOW and does not count - in doubles the game is over before a
            four-turn grind finishes.
            {state.field.weather && (
              <>
                {" "}
                <b className="warn">
                  Conditioned on {state.field.weather.kind} being up
                </b>{" "}
                - that changes Fire and Water matchups significantly.
              </>
            )}
          </div>
        </div>
      </div>

      {/* --- the recommendation --------------------------------------------- */}
      <div className="panel">
        <div className="panel-title">
          Bring these four
          <span className="count">covers {bring.covers.length} of {totalThreats}</span>
        </div>
        <div className="bring-row">
          {bring.team.map((m) => (
            <div key={m.uid} className={`bring-mon ${m.uid === bring.megaUid ? "is-mega" : ""}`}>
              <div className="bring-name">{nameOf(m)}</div>
              <div className="bring-types">{activeProfile(m).types.join("/")}</div>
              {m.uid === bring.megaUid && <div className="bring-mega">MEGA</div>}
            </div>
          ))}
        </div>
        <div className="col" style={{ marginTop: 10 }}>
          {bring.reasons.map((r) => (
            <div key={r} className="because">{r}</div>
          ))}
          {bring.conditionalReasons.map((r) => (
            <div key={r} className="because conditional">{r}</div>
          ))}
        </div>
        {bring.conditionalCovers.length > 0 && (
          <div className="hint" style={{ marginTop: 8 }}>
            <b>{bring.conditionalCovers.join(", ")}</b>{" "}
            {bring.conditionalCovers.length === 1 ? "is" : "are"} only covered once that
            condition is up. That is a turn spent and it can be stopped - it is a plan you
            execute, not a matchup you already have.
          </div>
        )}
        {bring.megaBenched.length > 0 && (
          <div className="hint" style={{ marginTop: 8 }}>
            <b>{bring.megaBenched.join(" and ")}</b> {bring.megaBenched.length === 1 ? "comes" : "come"}{" "}
            as the base form - {bring.megaName ?? "nothing"} has the Mega. Those matchups are
            scored on base stats, not Mega stats.
          </div>
        )}
        {bring.misses.length > 0 && (
          <div className="hint warn" style={{ marginTop: 8 }}>
            Still no answer to <b>{bring.misses.join(", ")}</b> - no four from this team
            covers it, so plan to handle {bring.misses.length === 1 ? "it" : "them"} some
            other way.
          </div>
        )}
      </div>

      {/* --- conditional cores ----------------------------------------------- */}
      {plans.length > 0 && (
        <div className="panel">
          <div className="panel-title">
            Conditional plans
            <span className="count">what turns your slow hitters on</span>
          </div>
          <div className="col">
            {plans.map((p) => (
              <div key={p.condition} className="plancard">
                <div className="threatcard-head">
                  <span className="tgt-name">{CONDITION_LABEL[p.condition]}</span>
                  <span className="spacer" />
                  <span className="tag confirmed">+{p.gained.filter((g) => g.after === "answer").length}</span>
                  {p.lost.filter((l) => l.before === "answer").length > 0 && (
                    <span className="tag status">
                      -{p.lost.filter((l) => l.before === "answer").length}
                    </span>
                  )}
                </div>
                {p.text && <div className="risk-text">{p.text}</div>}
                {p.abusers.length > 0 && (
                  <div className="answer-row">
                    {p.abusers.map((a) => (
                      <span key={a.mon.uid} className="chip-answer static">
                        {nameOf(a.mon)}
                        <span className="dimmer"> beats {a.gains.join(", ")}</span>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- per threat ------------------------------------------------------ */}
      <div className="panel">
        <div className="panel-title">
          Their team
          <span className="count">tap any matchup for the arithmetic</span>
        </div>
        <div className="col">
          {matrix.coverage.map((c) => {
            const threat = koThreat(c.threat, viewMine[0], view);
            // Losing matchups first: that is where an item swing actually hurts.
            const forThreat = [
              ...c.losesTo,
              ...matrix.cells.filter(
                (x) => x.theirs.uid === c.threat.uid && !c.losesTo.includes(x)
              ),
            ];
            return (
              <div key={c.threat.uid} className={`threatcard ${c.covered ? "" : "uncovered"}`}>
                <div className="threatcard-head">
                  <span className="tgt-name">{nameOf(c.threat)}</span>
                  <span className="dimmer tiny">{activeProfile(c.threat).types.join("/")}</span>
                  <span className="spacer" />
                  <span className={`tag ${c.covered ? "confirmed" : "status"}`}>
                    {c.covered ? `${c.answers.length} answer${c.answers.length === 1 ? "" : "s"}` : "NO ANSWER"}
                  </span>
                  <span className="tag assumed">{uncertainty(c.threat)}% unknown</span>
                </div>

                {c.answers.length > 0 && (
                  <div className="answer-row">
                    {c.answers.map((a) => (
                      <button
                        key={a.mine.uid}
                        className="chip-answer"
                        onClick={() => setDetail(a)}
                      >
                        {nameOf(a.mine)}
                        <span className="dimmer"> {a.myBest?.moveName}</span>
                      </button>
                    ))}
                  </div>
                )}
                {c.losesTo.length > 0 && (
                  <div className="loses-row">
                    loses to it:{" "}
                    {c.losesTo.map((l) => nameOf(l.mine)).join(", ")}
                  </div>
                )}
                <ThreatItemSwing cells={forThreat} />
                {threat.killers.length > 0 && (
                  <div className="assumptions">
                    {Math.round(threat.probability * 100)}% to hold a KO on {nameOf(viewMine[0])}
                    {" - "}
                    {threat.killers.map((k) => `${k.move} ${Math.round(k.p * 100)}%`).join(", ")}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* --- the grid -------------------------------------------------------- */}
      <div className="panel">
        <div className="panel-title">
          Full matrix
          <span className="count">your team down, theirs across</span>
        </div>
        <div className="table-wrap">
          <table className="matrix">
            <thead>
              <tr>
                <th />
                {theirs.map((t) => (
                  <th key={t.uid} className="matrix-col">{nameOf(t)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {viewMine.map((m) => (
                <tr key={m.uid}>
                  <td className="matrix-row">
                    {nameOf(m)}
                    {m.uid === activeMega && <span className="row-mega">M</span>}
                  </td>
                  {theirs.map((t) => {
                    const cell = matrix.cells.find(
                      (c) => c.mine.uid === m.uid && c.theirs.uid === t.uid
                    );
                    if (!cell) return <td key={t.uid} />;
                    return (
                      <td key={t.uid} className="matrix-cell">
                        <button
                          className={`cellbtn ${VERDICT_CLASS[cell.verdict]}`}
                          onClick={() => setDetail(cell)}
                          title={cell.reason}
                        >
                          {VERDICT_SHORT[cell.verdict]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="legend">
          <span className="legend-item"><i className="sw v-answer" />answer</span>
          <span className="legend-item"><i className="sw v-slow" />wins but too slow</span>
          <span className="legend-item"><i className="sw v-trade" />trade</span>
          <span className="legend-item"><i className="sw v-loses" />loses</span>
          <span className="legend-item"><i className="sw v-walled" />can't damage</span>
        </div>
      </div>

      {detail && <CellDetail cell={detail} onClose={() => setDetail(null)} />}
    </>
  );
}
