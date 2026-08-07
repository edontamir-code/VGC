// Your own games, and what they say. The only data in this tool that nobody
// else has - so it is exportable, and it never pretends a five-game sample is
// a trend.
import { useMemo, useState } from "react";
import { useBattle } from "../state/store.tsx";
import {
  allGames, clearLog, currentGame, deleteGame, exportJSON, importJSON, setLesson,
} from "../history/store.ts";
import { snapshot } from "../history/gamelog.ts";
import type { GameRecord } from "../history/gamelog.ts";
import {
  comparePriors, describeMatch, observedMoves, recallSimilar, summarise, THIN_EVIDENCE,
} from "../history/recall.ts";
import { usageFor } from "../../data/usage.js";
import { activeProfile } from "../battle/stats.ts";

const when = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(
    d.getMinutes()
  ).padStart(2, "0")}`;
};

function GameCard({ game, onChange }: { game: GameRecord; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [lesson, setLessonText] = useState(game.lesson ?? "");

  return (
    <div className={`threatcard ${game.result === "loss" ? "uncovered" : ""}`}>
      <div className="threatcard-head">
        <span className={`tag ${game.result === "win" ? "confirmed" : game.result === "loss" ? "status" : "assumed"}`}>
          {game.result === "unfinished" ? "OPEN" : game.result.toUpperCase()}
        </span>
        <span className="tgt-name">{game.theirRoster.slice(0, 4).join(", ") || "no roster"}</span>
        <span className="spacer" />
        <span className="dimmer tiny">{when(game.startedAt)}</span>
        <span className="dimmer tiny">{game.turns.length} turns</span>
        <button className="btn xs" onClick={() => setOpen((v) => !v)}>
          {open ? "Hide" : "Open"}
        </button>
      </div>

      {game.myBrought.length > 0 && (
        <div className="assumptions">
          you brought {game.myBrought.join(", ")}
          {game.myMega ? ` (Mega ${game.myMega.replace(/^Mega /, "")})` : ""}
        </div>
      )}
      {game.lesson && !open && <div className="because">{game.lesson}</div>}

      {open && (
        <>
          <div className="col" style={{ marginTop: 8 }}>
            {game.turns.map((t) => (
              <div key={t.turn}>
                <div className="logline">
                  <span className="mono dimmer">T{t.turn}</span>
                  <span className="logline-text">{t.script}</span>
                  <span className="tgt-num">
                    {t.damageDealt > 0 ? `-${t.damageDealt.toFixed(0)}%` : "-"}
                  </span>
                  {t.faintsTheirs.length > 0 && (
                    <span className="tag confirmed">KO {t.faintsTheirs.join(", ")}</span>
                  )}
                  {t.faintsMine.length > 0 && (
                    <span className="tag status">lost {t.faintsMine.join(", ")}</span>
                  )}
                  {t.followedAdvice !== null && (
                    <span className={`tag ${t.followedAdvice ? "confirmed" : "assumed"}`}>
                      {t.followedAdvice ? "took advice" : "went own way"}
                    </span>
                  )}
                </div>
                {t.advice && (
                  <div className="assumptions" style={{ paddingLeft: 6 }}>
                    tool said: {t.advice}
                    {t.adviceSource === "planner"
                      ? ` (depth ${t.adviceDepth}${t.adviceProven ? ", proven" : ""})`
                      : " (single-turn ranking)"}
                    {t.adviceDiverged.length > 0 && ` - ${t.adviceDiverged.join("; ")}`}
                  </div>
                )}
              </div>
            ))}
            {game.turns.length === 0 && <div className="empty-note">No turns recorded.</div>}
          </div>

          <div className="row" style={{ marginTop: 8, gap: 6 }}>
            <input
              className="mono grow"
              placeholder="What did you learn? e.g. 'his Incineroar had Fake Out, cost me the Trick Room'"
              value={lesson}
              onChange={(e) => setLessonText(e.target.value)}
              onBlur={() => {
                setLesson(game.id, lesson);
                onChange();
              }}
            />
            <button
              className="btn xs danger"
              onClick={() => {
                deleteGame(game.id);
                onChange();
              }}
            >
              Delete
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export default function HistoryTab() {
  const { state } = useBattle();
  const [tick, setTick] = useState(0);
  const [importText, setImportText] = useState("");
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  const games = useMemo(() => allGames(), [tick]);
  const summary = useMemo(() => summarise(games), [games]);
  const refresh = () => setTick((t) => t + 1);

  // Which of their Pokemon are on the board right now - those are the ones
  // worth comparing against the usage data.
  const theirSpecies = useMemo(
    () =>
      [...new Set(
        Object.values(state.mons)
          .filter((m) => m.side === "opp")
          .map((m) => activeProfile(m).displayName)
      )],
    [state.mons]
  );

  const matches = useMemo(() => {
    const here = snapshot(state);
    if (!here.opp.active.some(Boolean)) return [];
    // The game in progress is the one being recorded, so without this it
    // "recalls" the turn you played ninety seconds ago and calls it a lesson.
    return recallSimilar(games, here, { limit: 4, excludeGameId: currentGame()?.id });
  }, [games, state]);

  const download = () => {
    const blob = new Blob([exportJSON()], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `champions-gamelog-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Your record
          <span className="count">{games.length} game{games.length === 1 ? "" : "s"} logged</span>
        </div>
        <div className="bring-row">
          <div className="bring-mon">
            <div className="bring-name mono">{summary.wins}-{summary.losses}</div>
            <div className="bring-types">win-loss</div>
          </div>
          <div className="bring-mon">
            <div className="bring-name mono">{summary.turns}</div>
            <div className="bring-types">turns recorded</div>
          </div>
          <div className="bring-mon">
            <div className="bring-name mono">{summary.unfinished}</div>
            <div className="bring-types">unfinished</div>
          </div>
        </div>
        {summary.adviceOffered > 0 && (
          <div className="assumptions" style={{ marginTop: 8 }}>
            You took the recommendation on {summary.adviceFollowed} of {summary.adviceOffered}{" "}
            advised turns ({summary.fromPlanner} from the planner, {summary.fromLines} from the
            single-turn ranking).
            {summary.adviceMissing > 0 &&
              ` ${summary.adviceMissing} turn${summary.adviceMissing === 1 ? "" : "s"} had no recommendation yet when you moved.`}
            {summary.winRateFollowing !== null && (
              <>
                {" "}Win rate following the planner: <b>{summary.winRateFollowing}%</b>
                {summary.winRateIgnoring !== null && ` vs ${summary.winRateIgnoring}% when not.`}
              </>
            )}
          </div>
        )}
        {!summary.enoughToTrust && (
          <div className="hint" style={{ marginTop: 8 }}>
            Under {THIN_EVIDENCE * 2} finished games this is a diary, not evidence. Everything
            below is shown as "here is what happened", never as "here is what works" - a win
            rate over four games tells you nothing and the tool will not pretend otherwise.
          </div>
        )}
      </div>

      {matches.length > 0 && (
        <div className="panel">
          <div className="panel-title">
            You have been here before
            <span className="count">positions like the one on the board now</span>
          </div>
          <div className="col">
            {matches.map((m) => (
              <div key={`${m.game.id}-${m.turn.turn}`} className="plancard">
                <div className="threatcard-head">
                  <span className={`tag ${m.result === "win" ? "confirmed" : m.result === "loss" ? "status" : "assumed"}`}>
                    {Math.round(m.score * 100)}% alike
                  </span>
                  <span className="dimmer tiny">
                    {when(m.game.startedAt)} - turn {m.turn.turn}
                  </span>
                </div>
                <div className="risk-text">{describeMatch(m)}</div>
                <div className="assumptions">{m.matched.join(" - ")}</div>
                {m.game.lesson && <div className="because">{m.game.lesson}</div>}
              </div>
            ))}
          </div>
        </div>
      )}

      {theirSpecies.length > 0 && (
        <div className="panel">
          <div className="panel-title">
            What you have actually seen
            <span className="count">your games vs the usage data</span>
          </div>
          <div className="col">
            {theirSpecies.map((name) => {
              const mon = Object.values(state.mons).find(
                (m) => m.side === "opp" && activeProfile(m).displayName === name
              );
              const seen = observedMoves(games, name);
              if (seen.length === 0) return null;
              const rows = comparePriors(games, name, usageFor(mon?.set.speciesId ?? "")?.moves)
                .filter((r) => r.yoursPct !== null)
                .slice(0, 6);
              return (
                <div key={name} className="threatcard">
                  <div className="threatcard-head">
                    <span className="tgt-name">{name}</span>
                    <span className="spacer" />
                    <span className="tag assumed">
                      seen in {seen[0].outOf} game{seen[0].outOf === 1 ? "" : "s"}
                    </span>
                  </div>
                  {rows.map((r) => (
                    <div key={r.name} className="tgt">
                      <span className="tgt-name">{r.name}</span>
                      <span className="tgt-num dimmer">ladder {Math.round(r.laddderPct)}%</span>
                      <span className="tgt-num">
                        yours {r.yoursPct}% ({r.count}/{r.outOf})
                      </span>
                      {r.thin && <span className="tag assumed">thin</span>}
                    </div>
                  ))}
                  {rows.some((r) => r.note) && (
                    <div className="hint warn">
                      {rows.find((r) => r.note)?.note} Not applied automatically - your sample is
                      yours to judge.
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Games</div>
        <div className="col">
          {[...games].reverse().map((g) => (
            <GameCard key={g.id} game={g} onChange={refresh} />
          ))}
          {games.length === 0 && (
            <div className="empty-note">
              Nothing logged yet. Turns are recorded automatically as you type them on the
              Battle tab; hit New game when one ends and say whether you won.
            </div>
          )}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Keep it safe
          <span className="count">the log never leaves this device on its own</span>
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap" }}>
          <button className="btn sm" onClick={download}>Export JSON</button>
          {confirmClear ? (
            <>
              <button
                className="btn sm danger"
                onClick={() => {
                  clearLog();
                  setConfirmClear(false);
                  refresh();
                }}
              >
                Delete everything
              </button>
              <button className="btn sm" onClick={() => setConfirmClear(false)}>Cancel</button>
            </>
          ) : (
            <button className="btn sm" onClick={() => setConfirmClear(true)}>Clear log</button>
          )}
        </div>
        <textarea
          className="turn-input mono"
          rows={2}
          placeholder="Paste an exported log here to merge it back in"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          style={{ marginTop: 8 }}
        />
        <div className="row" style={{ gap: 6, marginTop: 6 }}>
          <button
            className="btn sm"
            disabled={!importText.trim()}
            onClick={() => {
              const r = importJSON(importText);
              setImportMsg(
                r.error ?? `Added ${r.added}, skipped ${r.skipped} already present.`
              );
              if (!r.error) setImportText("");
              refresh();
            }}
          >
            Import
          </button>
          {importMsg && <span className="assumptions">{importMsg}</span>}
        </div>
      </div>
    </>
  );
}
