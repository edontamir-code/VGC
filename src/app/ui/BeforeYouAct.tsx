// The panel that answers "what happens to me before my move resolves".
import type { LeadRisk } from "../battle/leadRisk.ts";

const KIND_LABEL: Record<LeadRisk["kind"], string> = {
  flinch: "FLINCH",
  "ko-before-you": "KO FIRST",
  "sash-break": "SASH GONE",
  "combo-ko": "DOUBLE UP",
  "speed-tie": "SPEED TIE",
  redirect: "REDIRECT",
};

export default function BeforeYouAct({ risks }: { risks: LeadRisk[] }) {
  if (risks.length === 0) return null;

  return (
    <div className="panel risk-panel">
      <div className="panel-title">
        Before you act
        <span className="count">{risks.length} to account for</span>
      </div>
      <div className="col">
        {risks.map((r, i) => (
          <div key={`${r.kind}-${r.victimUid}-${i}`} className={`risk risk-${r.severity}`}>
            <div className="risk-head">
              <span className={`risk-tag risk-tag-${r.severity}`}>{KIND_LABEL[r.kind]}</span>
              <span className={`tag ${r.certain ? "confirmed" : "assumed"}`}>
                {r.certain ? "confirmed" : "assumed"}
              </span>
            </div>
            <div className="risk-text">{r.text}</div>
          </div>
        ))}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>
        These come from the opponent's current sets and the real priority/speed order.
        Anything marked <b>assumed</b> has not been seen yet - confirm moves in the mon
        editor to make it deterministic.
      </div>
    </div>
  );
}
