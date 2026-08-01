// Your own six. Saved separately from the battle so it survives a Reset and
// carries between games - which is what makes the app usable by anyone who is
// not the person whose team is hardcoded in team.js.
import { useMemo, useState } from "react";
import { useBattle } from "../state/store.tsx";
import { SPECIES } from "../model/species.ts";
import type { SpeciesEntry } from "../model/species.ts";
import { builtInTeam } from "../model/species.ts";
import { effectiveTeam, saveMyTeam, clearMyTeam, isCustomTeam } from "../state/myTeam.ts";
import type { MonSet } from "../model/types.ts";
import { computeStats } from "../../engine.js";
import { allMatches } from "../input/match.ts";
import { ROSTER_SIZE } from "../model/types.ts";

function statLine(set: MonSet): string {
  const s = computeStats(set.base, set.sp, set.nature);
  return `${s.hp}/${s.atk}/${s.def}/${s.spa}/${s.spd}/${s.spe}`;
}

export default function TeamTab() {
  const { dispatch } = useBattle();
  const [team, setTeam] = useState<MonSet[]>(() => effectiveTeam());
  const [picking, setPicking] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [saved, setSaved] = useState(false);

  const results = useMemo<SpeciesEntry[]>(() => {
    if (!query.trim()) return SPECIES;
    return allMatches(query, SPECIES, (s) => s.name, 40).map((m) => m.value);
  }, [query]);

  const commit = (next: MonSet[]) => {
    setTeam(next);
    saveMyTeam(next);
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  const choose = (slot: number, entry: SpeciesEntry) => {
    const next = [...team];
    next[slot] = entry.make();
    commit(next);
    setPicking(null);
    setQuery("");
  };

  const removeSlot = (slot: number) => commit(team.filter((_, i) => i !== slot));

  const applyToBattle = () => {
    dispatch({ type: "RESET", team });
  };

  const restoreBuiltIn = () => {
    clearMyTeam();
    setTeam(builtInTeam());
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1500);
  };

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Your team
          <span className="count">
            {team.length}/{ROSTER_SIZE}
            {isCustomTeam() ? " · custom, saved" : " · built-in"}
            {saved ? " · saved" : ""}
          </span>
        </div>
        <div className="hint" style={{ marginBottom: 10 }}>
          Changes here are saved to this device and survive resetting a battle. Tap a slot
          to swap the Pokemon; everything else about a set — item, ability, nature, SP,
          moves — is edited by tapping it on the Battle tab.
        </div>

        <div className="col">
          {team.map((set, i) => (
            <div key={`${set.speciesId}-${i}`} className="teamrow">
              <span className="mono dimmer" style={{ width: 14 }}>{i + 1}</span>
              <button className="btn sm" onClick={() => setPicking(picking === i ? null : i)}>
                {set.name}
              </button>
              <span className="dimmer tiny">{set.types.join("/")}</span>
              <span className="spacer" />
              <span className="mono tiny dimmer">{statLine(set)}</span>
              <button className="btn xs danger" onClick={() => removeSlot(i)}>
                remove
              </button>
            </div>
          ))}
          {team.length < ROSTER_SIZE && (
            <button
              className="btn sm"
              onClick={() => setPicking(picking === team.length ? null : team.length)}
            >
              + add a Pokemon
            </button>
          )}
        </div>

        <div className="row" style={{ marginTop: 10 }}>
          <button className="btn primary grow" onClick={applyToBattle}>
            Start a battle with this team
          </button>
          <button className="btn sm" onClick={restoreBuiltIn}>
            use built-in
          </button>
        </div>
        <div className="hint" style={{ marginTop: 6 }}>
          Starting a battle clears the current board.
        </div>
      </div>

      {picking !== null && (
        <div className="panel">
          <div className="panel-title">
            Choose for slot {picking + 1}
            <span className="count">{SPECIES.length} in the database</span>
          </div>
          <input
            autoFocus
            value={query}
            placeholder="search - zard, gambit, sinistcha..."
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="col" style={{ marginTop: 8, maxHeight: 340, overflowY: "auto" }}>
            {results.map((s) => (
              <button
                key={s.id}
                className="btn"
                style={{ justifyContent: "flex-start" }}
                onClick={() => choose(picking, s)}
              >
                <span>{s.name}</span>
                <span className="dimmer tiny">{s.types.join("/")}</span>
              </button>
            ))}
            {results.length === 0 && (
              <div className="empty-note">
                Nothing matches "{query}". Only Pokemon in the database can be picked —
                add new ones to src/data/threats.js.
              </div>
            )}
          </div>
          <button className="btn sm" style={{ marginTop: 8 }} onClick={() => setPicking(null)}>
            cancel
          </button>
        </div>
      )}
    </>
  );
}
