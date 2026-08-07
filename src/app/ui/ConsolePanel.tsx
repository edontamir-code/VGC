// One box for the whole game: their six, the leads, then every turn.
// The reply is the coaching - you should never have to leave this panel.
import { useEffect, useMemo, useRef, useState } from "react";
import { useBattle } from "../state/store.tsx";
import { runCommand, phaseOf, PHASE_PROMPT } from "../input/command.ts";
import type { Phase } from "../input/command.ts";
import { briefFor, plannerBrief } from "../battle/brief.ts";
import type { Brief, PlannerBrief } from "../battle/brief.ts";
import { usePlanner } from "../search/usePlanner.ts";
import { DEFAULT_SEARCH } from "../search/plan.ts";
import type { SearchOpts } from "../search/plan.ts";
import { activeMons } from "../battle/resolver.ts";

interface Entry {
  id: number;
  /** What I typed. */
  said: string;
  /** What the tool understood. */
  echo: string;
  problems: string[];
  brief: Brief | null;
  /** The board this reply describes - used to match a late planner result. */
  forState: unknown;
  /** Filled in when the multi-turn search answers. */
  planner: PlannerBrief | null;
  error: boolean;
}

const PHASE_LABEL: Record<Phase, string> = {
  roster: "Team preview",
  leads: "Leads",
  turn: "Turn",
};

/**
 * The move the fast reply recommended, if it recommended one at all.
 *
 * Only the TURN brief picks a move. The bring-four and lead briefs give advice
 * of a different shape entirely ("deny the Tailwind"), and comparing the
 * planner's move against those would flag a disagreement on every single lead
 * turn - a warning that fires constantly is a warning nobody reads.
 */
function movePickOf(brief: Brief | null): string | null {
  if (!brief || brief.phase !== "turn") return null;
  return brief.advice[0] ?? null;
}

function BriefView({ brief }: { brief: Brief }) {
  return (
    <>
      {brief.headline && <div className="con-headline">{brief.headline}</div>}
      {brief.urgent.map((u) => (
        <div key={u} className="con-urgent">{u}</div>
      ))}
      {brief.advice.map((a) => (
        <div key={a} className="because">{a}</div>
      ))}
      {brief.notes.map((n) => (
        <div key={n} className="assumptions con-note">{n}</div>
      ))}
    </>
  );
}

/** The deeper answer, once the worker has one. */
function PlannerView({ p, searching }: { p: PlannerBrief | null; searching: boolean }) {
  if (!p) {
    return searching ? (
      <div className="con-thinking">Looking further ahead...</div>
    ) : null;
  }
  return (
    <div className={`con-planner ${p.pinVsPossible ? "proven" : ""}`}>
      <div className="con-headline">
        {p.headline}
        <span className={`pin ${p.pinVsPossible ? "pin-strong" : p.isPin ? "pin-cond" : "pin-none"}`}>
          {p.pinVsPossible ? "GUARANTEED" : p.isPin ? "BEST FLOOR" : "NO PIN"}
        </span>
      </div>
      {p.disagrees && (
        <div className="con-urgent">
          This is NOT what the one-turn read suggested. Looking further ahead changes the
          answer - the deeper line is the one to trust.
        </div>
      )}
      {p.notes.map((n) => (
        <div key={n} className="assumptions con-note">{n}</div>
      ))}
    </div>
  );
}

export default function ConsolePanel() {
  const { state, dispatch } = useBattle();
  const [text, setText] = useState("");
  const [log, setLog] = useState<Entry[]>([]);
  const nextId = useRef(1);
  const endRef = useRef<HTMLDivElement | null>(null);

  const phase = phaseOf(state);
  // Preview what the current input would do, so a misread is visible BEFORE
  // committing it rather than after.
  const preview = useMemo(
    () => (text.trim() ? runCommand(text, state) : null),
    [text, state]
  );

  // The multi-turn search, in a worker, so the console stays responsive and the
  // answer arrives as an upgrade to a reply that is already on screen.
  //
  // Three turns with NARROW beams, measured rather than guessed. On a busy
  // board (both sides full, four on each bench) the Plan tab's 6/6 beams take
  // ~12s; 4/4 returns the same top line in ~3.4s. Dropping to two turns is the
  // wrong trade - depth 2 misses the resource-preservation switch entirely and
  // recommends attacking instead, so it is fast and wrong.
  const canSearch =
    activeMons(state, "opp").length > 0 && activeMons(state, "me").length > 0;
  const opts: SearchOpts = {
    depth: 3,
    myBeam: 4,
    theirBeam: 4,
    arsenal: DEFAULT_SEARCH.arsenal,
  };
  const { lines, searching, stale } = usePlanner(state, opts, canSearch);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "nearest" });
  }, [log.length]);

  const send = () => {
    const said = text.trim();
    if (!said) return;
    const result = runCommand(said, state);

    for (const a of result.actions) dispatch(a);

    setLog((l) => [
      ...l,
      {
        id: nextId.current++,
        said,
        echo: result.echo,
        problems: result.problems,
        // The brief is computed on the NEXT render, once the actions have
        // landed - see the effect below.
        brief: null,
        forState: null,
        planner: null,
        error: result.kind === "error",
      },
    ]);
    setText("");
  };

  // Fill in the fast brief for the most recent entry once the board has updated.
  useEffect(() => {
    setLog((l) => {
      if (l.length === 0) return l;
      const last = l[l.length - 1];
      if (last.brief || last.error) return l;
      return [...l.slice(0, -1), { ...last, brief: briefFor(state), forState: state }];
    });
  }, [state]);

  // ...and upgrade it when the deeper search answers.
  //
  // Only the entry computed for THIS board gets the upgrade. A result that
  // arrives after another turn has been recorded belongs to a position that no
  // longer exists, and attaching it to the newest reply would be attributing
  // advice to a board it was never about.
  useEffect(() => {
    if (searching || stale || lines.length === 0) return;
    setLog((l) => {
      if (l.length === 0) return l;
      const last = l[l.length - 1];
      if (last.forState !== state || last.planner) return l;
      const p = plannerBrief(lines, movePickOf(last.brief));
      if (!p) return l;
      return [...l.slice(0, -1), { ...last, planner: p }];
    });
  }, [lines, searching, stale, state]);

  const live = briefFor(state);
  const livePlanner =
    !searching && !stale && lines.length
      ? plannerBrief(lines, movePickOf(live))
      : null;

  return (
    <div className="panel console">
      <div className="panel-title">
        {PHASE_LABEL[phase]}
        <span className="count">one box - their six, the leads, then every turn</span>
      </div>

      {log.length > 0 && (
        <div className="con-log">
          {log.map((e) => (
            <div key={e.id} className="con-entry">
              <div className="con-said">
                <span className="con-caret">&gt;</span> {e.said}
              </div>
              {e.echo && <div className="con-echo">{e.echo}</div>}
              {e.problems.map((p) => (
                <div key={p} className="con-problem">{p}</div>
              ))}
              {e.brief && <BriefView brief={e.brief} />}
              {e.brief && (
                <PlannerView
                  p={e.planner}
                  searching={searching && e.forState === state}
                />
              )}
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}

      {log.length === 0 && (
        <>
          <BriefView brief={live} />
          {canSearch && <PlannerView p={livePlanner} searching={searching} />}
        </>
      )}

      <textarea
        className="turn-input mono"
        rows={2}
        placeholder={PHASE_PROMPT[phase]}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            send();
          }
        }}
      />

      {preview && (
        <div className={`con-preview ${preview.kind === "error" ? "bad" : ""}`}>
          {preview.kind === "error"
            ? preview.problems[0] ?? "Not understood."
            : preview.echo || "..."}
        </div>
      )}

      <div className="row" style={{ gap: 6, marginTop: 6 }}>
        <button className="btn primary grow" onClick={send} disabled={!text.trim()}>
          Send
        </button>
        {log.length > 0 && (
          <button className="btn sm" onClick={() => setLog([])}>
            Clear chat
          </button>
        )}
      </div>

      <div className="hint" style={{ marginTop: 6 }}>
        Enter sends, Shift+Enter for a new line. {PHASE_PROMPT[phase]}
      </div>
    </div>
  );
}
