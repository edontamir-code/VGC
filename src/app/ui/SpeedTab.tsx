// Field-aware speed order + the benchmark table.
import { useBattle } from "../state/store.tsx";
import { boardTurnOrder, currentSpeed, speedRow } from "../battle/speed.ts";
import { activeProfile } from "../battle/stats.ts";
import type { MonState } from "../model/types.ts";

export default function SpeedTab() {
  const { state } = useBattle();
  const order = boardTurnOrder(state);
  const all = Object.values(state.mons).sort(
    (a, b) => currentSpeed(b, state) - currentSpeed(a, state)
  );

  const f = state.field;
  const context = [
    f.trickRoom > 0 ? `Trick Room (${f.trickRoom})` : null,
    f.tailwind.me > 0 ? `your Tailwind (${f.tailwind.me})` : null,
    f.tailwind.opp > 0 ? `their Tailwind (${f.tailwind.opp})` : null,
    f.weather ? `${f.weather.kind} (${f.weather.turnsLeft})` : null,
  ].filter(Boolean);

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Turn order on the field
          <span className="count">
            {context.length ? context.join(" - ") : "no field effects"}
          </span>
        </div>
        {order.length === 0 ? (
          <div className="empty-note">Nothing active yet.</div>
        ) : (
          <div className="col">
            {order.map((o, i) => (
              <div className="tgt" key={o.uid}>
                <span className="mono dim" style={{ width: 18 }}>{i + 1}</span>
                <span className={`side-tag ${o.mon.side}`}>
                  {o.mon.side === "me" ? "YOU" : "OPP"}
                </span>
                <span className="tgt-name">{activeProfile(o.mon).displayName}</span>
                <span className="spacer" />
                <span className="mono">{o.speed}</span>
                {o.tie && <span className="tag assumed">TIE - coinflip</span>}
              </div>
            ))}
          </div>
        )}
        {f.trickRoom > 0 && (
          <div className="hint" style={{ marginTop: 8 }}>
            Trick Room is up, so this order is inverted: slower acts first.
          </div>
        )}
      </div>

      <div className="panel">
        <div className="panel-title">
          Speed benchmarks
          <span className="count">every mon in this battle</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Pokemon</th>
                <th>Now</th>
                <th>Base</th>
                <th>+Scarf</th>
                <th>+Tailwind</th>
                <th>-1</th>
                <th>Para</th>
              </tr>
            </thead>
            <tbody>
              {all.map((m: MonState) => {
                const b = speedRow(m);
                return (
                  <tr key={m.uid} className={m.side === "me" ? "is-me" : "is-opp"}>
                    <td>{activeProfile(m).displayName}</td>
                    <td className="num" style={{ fontWeight: 700 }}>
                      {currentSpeed(m, state)}
                    </td>
                    <td className="num">{b.base}</td>
                    <td className="num">{b.scarf}</td>
                    <td className="num">{b.tailwind}</td>
                    <td className="num">{b.minus1}</td>
                    <td className="num">{b.paralyzed}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          "Now" includes the current field, item, status and Speed stage. The other
          columns are hypotheticals off the mon's base Speed stat.
        </div>
      </div>
    </>
  );
}
