// Reverse SP survival optimizer: "what is the minimum bulk that lives this?"
import { useMemo, useState } from "react";
import { THREATS } from "../../data/threats.js";
import { TEAM } from "../../data/team.js";
import { useBattle } from "../state/store.tsx";
import { makeMonState } from "../state/reducer.ts";
import { setFromTeam, setFromThreat } from "../model/factory.ts";
import { minimumSPToSurvive } from "../battle/envelope.ts";
import type { SurviveGoal } from "../battle/envelope.ts";
import { resolveMatchup } from "../battle/damage.ts";
import { getMoveData } from "../battle/moves.ts";
import { SP_BUDGET, spTotal } from "../battle/stats.ts";
import { VERDICT_LABEL } from "../battle/damage.ts";

export default function OptimizerTab() {
  const { state } = useBattle();
  const [defName, setDefName] = useState(TEAM[0]?.name ?? "");
  const [threatId, setThreatId] = useState(THREATS[0]?.id ?? "");
  const [moveName, setMoveName] = useState(THREATS[0]?.defaultMove ?? "");
  const [goal, setGoal] = useState<SurviveGoal>("guaranteed");

  const threat = THREATS.find((t) => t.id === threatId) ?? THREATS[0];
  const teamMon = TEAM.find((t) => t.name === defName) ?? TEAM[0];

  const attackingMoves = useMemo(
    () => threat.moves.filter((m) => getMoveData(m)),
    [threat]
  );
  const effectiveMove = attackingMoves.includes(moveName)
    ? moveName
    : attackingMoves[0] ?? "";

  const { solution, current } = useMemo(() => {
    if (!teamMon || !threat || !effectiveMove) return { solution: null, current: null };
    const defender = makeMonState(setFromTeam(teamMon), "me", "team");
    const attacker = makeMonState(setFromThreat(threat), "opp", "threat");
    // Use a board carrying the threat's own weather so e.g. sun is respected.
    const field = threat.setsWeather
      ? { ...state, field: { ...state.field, weather: { kind: threat.setsWeather, turnsLeft: 5 } } }
      : state;
    return {
      solution: minimumSPToSurvive(defender, attacker, effectiveMove, field, goal),
      current: resolveMatchup(attacker, defender, effectiveMove, field),
    };
  }, [teamMon, threat, effectiveMove, goal, state]);

  const currentBulk =
    (teamMon?.sp.hp ?? 0) +
    (current?.category === "phys" ? teamMon?.sp.def ?? 0 : teamMon?.sp.spd ?? 0);

  return (
    <>
      <div className="panel">
        <div className="panel-title">Reverse SP optimizer</div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Minimum HP + Def/SpD investment that survives a given hit from full HP,
          and how much of the 66 SP budget is left for offence and Speed.
        </div>

        <div className="grid2">
          <div>
            <label className="field">My Pokemon</label>
            <select value={defName} onChange={(e) => setDefName(e.target.value)}>
              {TEAM.map((t) => (
                <option key={t.name} value={t.name}>{t.mega ?? t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Incoming from</label>
            <select
              value={threatId}
              onChange={(e) => {
                setThreatId(e.target.value);
                const t = THREATS.find((x) => x.id === e.target.value);
                setMoveName(t?.defaultMove ?? "");
              }}
            >
              {THREATS.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Move</label>
            <select value={effectiveMove} onChange={(e) => setMoveName(e.target.value)}>
              {attackingMoves.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="field">Condition</label>
            <select value={goal} onChange={(e) => setGoal(e.target.value as SurviveGoal)}>
              <option value="guaranteed">survive guaranteed</option>
              <option value="ninety">survive 90%+ of rolls</option>
            </select>
          </div>
        </div>
      </div>

      {current && (
        <div className="panel">
          <div className="panel-title">As currently built</div>
          <div className="row">
            <span className={`verdict big v-${current.verdictFull}`}>
              {VERDICT_LABEL[current.verdictFull]}
            </span>
            <div className="col" style={{ gap: 2 }}>
              <span className="mono">
                {current.minPct}% - {current.maxPct}% ({current.min}-{current.max} vs{" "}
                {current.defenderMaxHP} HP)
              </span>
              <span className="dim small mono">
                x{current.typeMult} - {current.koChance}
              </span>
            </div>
          </div>
          <div className="assumptions">
            {current.assumptions.join(" - ")}
            {current.modifiers.length ? ` | ${current.modifiers.join(" | ")}` : ""}
          </div>
          <div className="hint" style={{ marginTop: 8 }}>
            Current spread spends {spTotal(teamMon.sp as Record<string, number | undefined>)}/
            {SP_BUDGET} SP, of which {currentBulk} is in the relevant bulk.
          </div>
        </div>
      )}

      <div className="panel">
        <div className="panel-title">Minimum investment</div>
        {solution ? (
          <>
            <div className="row">
              <span className="verdict big v-LIVES">LIVES</span>
              <div className="col" style={{ gap: 2 }}>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                  {solution.hpSP} HP / {solution.defSP}{" "}
                  {current?.category === "phys" ? "Def" : "SpD"}
                </span>
                <span className="dim small mono">
                  {solution.maxPct}% max - {solution.koChance}
                </span>
              </div>
            </div>
            <div className="hint" style={{ marginTop: 10 }}>
              Spends {solution.spentOnBulk} SP on bulk, leaving{" "}
              <b className="mono">{solution.spLeft}</b> of the 66 for offence and Speed.
              Nature is held at the set's current nature.
            </div>
          </>
        ) : (
          <>
            <div className="row">
              <span className="verdict big v-DEAD">NOT POSSIBLE</span>
            </div>
            <div className="hint" style={{ marginTop: 10 }}>
              No HP/{current?.category === "phys" ? "Def" : "SpD"} split within the 66 SP
              budget survives this hit at the current nature. Try a defensive nature, a
              resist berry, or a screen.
            </div>
          </>
        )}
      </div>
    </>
  );
}
