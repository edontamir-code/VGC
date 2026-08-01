// One Pokemon on the board. Assumed data is dimmed; confirmed data is solid.
import { useBattle } from "../state/store.tsx";
import type { MonState, StageKey } from "../model/types.ts";
import { activeProfile, hpPct } from "../battle/stats.ts";
import { currentSpeed } from "../battle/speed.ts";

const BOOSTABLE: StageKey[] = ["atk", "def", "spa", "spd", "spe"];
const STATUS_LABEL: Record<string, string> = {
  par: "PAR", brn: "BRN", psn: "PSN", slp: "SLP", frz: "FRZ",
};

export function MonCard({
  mon,
  selected,
  onClick,
}: {
  mon: MonState;
  selected?: boolean;
  onClick?: () => void;
}) {
  const { state } = useBattle();
  const p = activeProfile(mon);
  const pct = hpPct(mon);
  const spe = currentSpeed(mon, state);
  const isOpp = mon.side === "opp";
  const fullyAssumed = isOpp && !mon.revealed.sp;

  const boosts = BOOSTABLE.filter((k) => mon.stages[k] !== 0);

  return (
    <button
      className={`moncard ${mon.side} ${selected ? "selected" : ""} ${mon.fainted ? "fainted" : ""}`}
      onClick={onClick}
      aria-label={`${p.displayName}, ${mon.side === "me" ? "yours" : "opponent"}, ${
        mon.fainted ? "fainted" : `${pct.toFixed(0)} percent HP`
      }, ${spe} Speed. Edit.`}
    >
      <div className="mc-top">
        <span className="mc-name">{p.displayName}</span>
        {mon.set.baseForm && (
          <span className="tag">{mon.hasMega ? "MEGA" : "pre-Mega"}</span>
        )}
        <span className="mc-spe">{spe} Spe</span>
      </div>

      <div className="mc-types">
        {p.types.map((t) => (
          <span key={t} className="type">{t}</span>
        ))}
      </div>

      <div className="hpbar">
        <div
          className={`hpfill ${pct > 50 ? "hi" : pct > 20 ? "mid" : "lo"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="hp-line">
        <span>{mon.fainted ? "fainted" : `${mon.curHP}/${mon.maxHP}`}</span>
        <span>{pct.toFixed(0)}%</span>
      </div>

      <div className="mc-tags">
        <span className={`tag ${isOpp && !mon.revealed.item ? "" : ""}`}>
          <span className={isOpp && !mon.revealed.item ? "assumed-text" : ""}>
            {mon.itemActive ? mon.set.item || "no item" : "item gone"}
          </span>
        </span>
        <span className="tag">
          <span className={isOpp && !mon.revealed.ability ? "assumed-text" : ""}>
            {p.ability}
          </span>
        </span>
        {mon.status && <span className="tag status">{STATUS_LABEL[mon.status]}</span>}
        {mon.unburdened && <span className="tag boost">UNBURDEN</span>}
        {boosts.map((k) => (
          <span key={k} className="tag boost">
            {k.toUpperCase()} {mon.stages[k] > 0 ? `+${mon.stages[k]}` : mon.stages[k]}
          </span>
        ))}
        {isOpp && (
          <span className={`tag ${fullyAssumed ? "assumed" : "confirmed"}`}>
            {fullyAssumed ? "ASSUMED SET" : "SPREAD CONFIRMED"}
          </span>
        )}
      </div>
    </button>
  );
}

export function EmptySlot({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button className="moncard empty" onClick={onClick}>
      + {label}
    </button>
  );
}
