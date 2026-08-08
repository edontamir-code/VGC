// The live damage calculator.
//
// Every move, into every target, under the exact field that is up right now.
// Deliberately not a recommendation - the Plan tab does that. This is the raw
// board, so you can read the numbers yourself and disagree.
import { useMemo } from "react";
import { useBattle } from "../state/store.tsx";
import { calcGrid, byBoardImpact } from "../battle/calcGrid.ts";
import type { CalcRow, CalcCell } from "../battle/calcGrid.ts";
import { fieldRead } from "../battle/fieldRead.ts";
import { activeMons } from "../battle/resolver.ts";

/** Colour by how close the hit is to removing the target. */
function toneOf(c: CalcCell): string {
  if (!c.result || c.result.typeMult === 0) return "calc-immune";
  if (c.verdict === "DEAD") return "calc-ko";
  if (c.verdict === "SASH") return "calc-sash";
  if (c.verdict === "ROLL") return "calc-roll";
  if (c.minPct >= 50) return "calc-big";
  if (c.minPct >= 25) return "calc-mid";
  return "calc-small";
}

function Cell({ c }: { c: CalcCell }) {
  const r = c.result;
  const eff =
    r && r.typeMult !== 1 && r.typeMult !== 0 ? `x${r.typeMult}` : null;
  return (
    <td className={`calc-cell ${toneOf(c)}`}>
      <div className="calc-pct">{c.text}</div>
      <div className="calc-sub">
        {r && r.typeMult === 0 ? "immune" : c.verdict}
        {eff && <span className="calc-eff"> {eff}</span>}
      </div>
    </td>
  );
}

function Row({ row, targets }: { row: CalcRow; targets: string[] }) {
  const byTarget = new Map(row.cells.map((c) => [c.targetUid, c]));
  return (
    <tr className={row.mega ? "calc-megarow" : undefined}>
      <th className="calc-move">
        <span className="calc-attacker">{row.attackerName}</span>
        {row.mega && <span className="calc-megatag">MEGA</span>}
        <span className="calc-movename">{row.moveName}</span>
        {row.spread && <span className="calc-tag">spread</span>}
        {row.accuracy < 100 && (
          <span className="calc-acc" title="chance to hit">
            {row.accuracy}%
          </span>
        )}
      </th>
      {row.category === "status" ? (
        <td className="calc-status" colSpan={targets.length + 1}>
          {row.statusEffect}
        </td>
      ) : (
        <>
          {targets.map((uid) => {
            const c = byTarget.get(uid);
            return c ? <Cell key={uid} c={c} /> : <td key={uid} className="calc-cell">-</td>;
          })}
          <td className="calc-board">
            {Math.round(row.boardMin)}-{Math.round(row.boardMax)}%
            {row.guaranteedKOs > 0 && (
              <span className="calc-kos">
                {row.guaranteedKOs} KO{row.guaranteedKOs > 1 ? "s" : ""}
              </span>
            )}
          </td>
        </>
      )}
    </tr>
  );
}

function Grid({
  rows,
  targets,
  targetNames,
  title,
}: {
  rows: CalcRow[];
  targets: string[];
  targetNames: string[];
  title: string;
}) {
  if (rows.length === 0) return null;
  return (
    <section className="calc-section">
      <h3>{title}</h3>
      <div className="calc-scroll">
        <table className="calc-table">
          <thead>
            <tr>
              <th />
              {targetNames.map((n, i) => (
                <th key={targets[i]}>{n}</th>
              ))}
              <th title="worst-roll damage summed over everything it hits, as a share of a full health bar">
                board
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <Row key={`${r.attackerUid}-${r.moveName}-${r.mega}-${i}`} row={r} targets={targets} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export default function CalcTab() {
  const { state } = useBattle();

  const grid = useMemo(() => calcGrid(state), [state]);
  const field = useMemo(() => fieldRead(state), [state]);

  const theirActives = activeMons(state, "opp");
  const myActives = activeMons(state, "me");

  if (myActives.length === 0 || theirActives.length === 0) {
    return (
      <div className="pad">
        <p className="muted">
          Put both sides out first - the calc is about the four Pokemon actually
          on the field.
        </p>
      </div>
    );
  }

  const theirUids = theirActives.map((m) => m.uid);
  const myUids = myActives.map((m) => m.uid);

  // Their rows target MY actives, so the header flips.
  const mineSorted = [...grid.mine].sort(byBoardImpact);
  const theirsSorted = [...grid.theirs].sort(byBoardImpact);

  const nameFor = (uid: string) => {
    const row =
      grid.mine.flatMap((r) => r.cells).find((c) => c.targetUid === uid) ??
      grid.theirs.flatMap((r) => r.cells).find((c) => c.targetUid === uid);
    return row?.targetName ?? "?";
  };

  return (
    <div className="calc-tab">
      {/* The field first: every number below already has these applied, and
          reconstructing this by hand is the slow part of using a real calc. */}
      <section className="calc-field">
        <h3>Field</h3>
        {field.lines.length === 0 && field.stages.length === 0 ? (
          <p className="muted">Clear field, no stat changes.</p>
        ) : (
          <ul className="calc-fieldlist">
            {field.lines.map((l, i) => (
              <li key={i} className={l.expiringSoon ? "expiring" : undefined}>
                <b>{l.label}</b>
                <span className="calc-turns">{l.turnsLeft}t</span>
                <span className="calc-effect">{l.effect}</span>
              </li>
            ))}
            {field.stages.map((s) => (
              <li key={s.uid} className="calc-stage">
                <b>{s.name}</b>
                <span className="calc-effect">{s.parts.join(", ")}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <Grid
        title="Your moves"
        rows={mineSorted}
        targets={theirUids}
        targetNames={theirUids.map(nameFor)}
      />
      <Grid
        title="What they do to you"
        rows={theirsSorted}
        targets={myUids}
        targetNames={myUids.map(nameFor)}
      />

      {grid.assumptions.length > 0 && (
        <section className="calc-assume">
          <h3>Assuming</h3>
          <ul>
            {grid.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
          <p className="muted">
            Type what their moves actually did and these tighten - every hit is a
            measurement.
          </p>
        </section>
      )}
    </div>
  );
}
