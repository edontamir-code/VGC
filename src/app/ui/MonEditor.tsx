// Editable set + live state for one Pokemon. Every field here is editable:
// threats.js gives the DEFAULT common set, never a lock (BATTLE_MODEL.md).
import { useState } from "react";
import { MOVES } from "../../data/moves.js";
import { useBattle } from "../state/store.tsx";
import type { MonState, StatusKind } from "../model/types.ts";
import { activeProfile, rawStats, spTotal, SP_BUDGET, SP_MAX_PER_STAT } from "../battle/stats.ts";
import { STATUS_MOVES } from "../battle/statusMoves.ts";
import { scout, isSimulated } from "../battle/scouting.ts";
import type { SPSpread } from "../../engine.js";

const ALL_MOVE_NAMES = [...Object.keys(MOVES), ...Object.keys(STATUS_MOVES)].sort();
const SP_KEYS = ["hp", "atk", "def", "spa", "spd", "spe"] as const;
// Only the five stats that also exist on the stat line (acc/eva have no stat).
const STAGE_KEYS = ["atk", "def", "spa", "spd", "spe"] as const;
const STATUSES: (StatusKind | null)[] = [null, "par", "brn", "psn", "slp", "frz"];

export default function MonEditor({ mon, onClose }: { mon: MonState; onClose: () => void }) {
  const { state, dispatch } = useBattle();
  const p = activeProfile(mon);
  const stats = rawStats(mon);
  const isOpp = mon.side === "opp";
  const total = spTotal(mon.set.sp as Record<string, number | undefined>);
  const [poolDraft, setPoolDraft] = useState("");
  const sc = scout(mon);
  const pool = [
    ...new Set([...(mon.set.movePool ?? []), ...mon.set.moves.filter(Boolean)]),
  ];

  const setSP = (key: string, value: number) => {
    const sp: SPSpread = { ...mon.set.sp, [key]: Math.max(0, Math.min(SP_MAX_PER_STAT, value)) };
    dispatch({ type: "SET_SP", uid: mon.uid, sp });
  };

  const addToPool = () => {
    const name = poolDraft.trim();
    if (!name || pool.includes(name)) {
      setPoolDraft("");
      return;
    }
    dispatch({
      type: "EDIT_SET",
      uid: mon.uid,
      patch: { movePool: [...pool, name] },
    });
    setPoolDraft("");
  };

  const setMove = (i: number, name: string) => {
    const moves = [...mon.set.moves];
    moves[i] = name;
    dispatch({ type: "EDIT_SET", uid: mon.uid, patch: { moves } });
  };

  return (
    <>
      <div className="drawer-backdrop" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <span className={`side-tag ${mon.side}`}>{isOpp ? "OPP" : "YOU"}</span>
          <span className="drawer-title">{p.displayName}</span>
          <span className="spacer" />
          <button className="btn sm" onClick={onClose}>Close</button>
        </div>

        {mon.set.note && <div className="hint" style={{ marginBottom: 10 }}>{mon.set.note}</div>}
        {mon.set.dataConf === "std" && (
          <div className="hint warn" style={{ marginBottom: 10 }}>
            This spread is the standard competitive convention, not a scraped exact
            spread. Verify it for tight calcs, or edit it below as you scout.
          </div>
        )}

        {/* --- HP --- */}
        <div className="panel">
          <div className="panel-title">HP</div>
          <div className="grid2">
            <div>
              <label className="field">Exact</label>
              <input
                className="mono"
                type="number"
                min={0}
                max={mon.maxHP}
                value={mon.curHP}
                onChange={(e) =>
                  dispatch({ type: "SET_HP", uid: mon.uid, curHP: Number(e.target.value) })
                }
              />
            </div>
            <div>
              <label className="field">Percent (of {mon.maxHP})</label>
              <input
                className="mono"
                type="number"
                min={0}
                max={100}
                value={Math.round((100 * mon.curHP) / Math.max(1, mon.maxHP))}
                onChange={(e) =>
                  dispatch({ type: "SET_HP_PCT", uid: mon.uid, pct: Number(e.target.value) })
                }
              />
            </div>
          </div>
          <div className="row" style={{ marginTop: 8 }}>
            {[100, 75, 50, 25, 0].map((pct) => (
              <button
                key={pct}
                className="btn sm"
                onClick={() => dispatch({ type: "SET_HP_PCT", uid: mon.uid, pct })}
              >
                {pct}%
              </button>
            ))}
            <button
              className={`btn sm ${mon.fainted ? "on" : ""}`}
              onClick={() =>
                dispatch({ type: "SET_FAINTED", uid: mon.uid, fainted: !mon.fainted })
              }
            >
              Fainted
            </button>
          </div>
        </div>

        {/* --- stages / status --- */}
        <div className="panel">
          <div className="panel-title">
            Boosts &amp; status
            <span className="count">
              <button className="btn xs" onClick={() => dispatch({ type: "RESET_STAGES", uid: mon.uid })}>
                reset
              </button>
            </span>
          </div>
          {STAGE_KEYS.map((k) => (
            <div className="row" key={k} style={{ marginBottom: 6 }}>
              <span className="mono small" style={{ width: 34 }}>{k.toUpperCase()}</span>
              <button
                className="btn xs"
                onClick={() =>
                  dispatch({ type: "SET_STAGE", uid: mon.uid, key: k, value: mon.stages[k] - 1 })
                }
              >
                -
              </button>
              <span
                className="mono"
                style={{ width: 30, textAlign: "center", fontWeight: 700 }}
              >
                {mon.stages[k] > 0 ? `+${mon.stages[k]}` : mon.stages[k]}
              </span>
              <button
                className="btn xs"
                onClick={() =>
                  dispatch({ type: "SET_STAGE", uid: mon.uid, key: k, value: mon.stages[k] + 1 })
                }
              >
                +
              </button>
              <span className="dimmer tiny mono">base {stats[k]}</span>
            </div>
          ))}
          <div className="row" style={{ marginTop: 8 }}>
            {STATUSES.map((s) => (
              <button
                key={s ?? "none"}
                className={`btn sm ${mon.status === s ? "on" : ""}`}
                onClick={() => dispatch({ type: "SET_STATUS", uid: mon.uid, status: s })}
              >
                {s ? s.toUpperCase() : "none"}
              </button>
            ))}
          </div>
        </div>

        {/* --- set --- */}
        <div className="panel">
          <div className="panel-title">Set</div>
          <div className="grid2">
            <div>
              <label className="field">Item</label>
              <input
                value={mon.set.item}
                onChange={(e) =>
                  dispatch({ type: "EDIT_SET", uid: mon.uid, patch: { item: e.target.value } })
                }
              />
            </div>
            <div>
              <label className="field">Ability</label>
              <input
                value={mon.set.ability}
                onChange={(e) =>
                  dispatch({ type: "EDIT_SET", uid: mon.uid, patch: { ability: e.target.value } })
                }
              />
            </div>
          </div>

          <div className="row" style={{ marginTop: 8 }}>
            <button
              className={`btn sm ${mon.itemActive ? "on" : ""}`}
              onClick={() =>
                dispatch({ type: "SET_ITEM_ACTIVE", uid: mon.uid, active: !mon.itemActive })
              }
            >
              {mon.itemActive ? "Item held" : "Item consumed/knocked"}
            </button>
            {mon.set.baseForm && (
              <button
                className={`btn sm ${mon.hasMega ? "on" : ""}`}
                onClick={() => dispatch({ type: "TOGGLE_MEGA", uid: mon.uid })}
              >
                {mon.hasMega ? "Mega-evolved" : "Not yet Mega"}
              </button>
            )}
          </div>

          <div className="grid2" style={{ marginTop: 8 }}>
            <div>
              <label className="field">Nature +</label>
              <select
                value={mon.set.nature.plus ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "EDIT_SET",
                    uid: mon.uid,
                    patch: {
                      nature: {
                        ...mon.set.nature,
                        plus: (e.target.value || undefined) as never,
                      },
                    },
                  })
                }
              >
                <option value="">neutral</option>
                {["atk", "def", "spa", "spd", "spe"].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field">Nature -</label>
              <select
                value={mon.set.nature.minus ?? ""}
                onChange={(e) =>
                  dispatch({
                    type: "EDIT_SET",
                    uid: mon.uid,
                    patch: {
                      nature: {
                        ...mon.set.nature,
                        minus: (e.target.value || undefined) as never,
                      },
                    },
                  })
                }
              >
                <option value="">neutral</option>
                {["atk", "def", "spa", "spd", "spe"].map((k) => (
                  <option key={k} value={k}>{k}</option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* --- SP spread --- */}
        <div className="panel">
          <div className="panel-title">
            SP spread
            <span className={`count mono ${total > SP_BUDGET ? "warn" : ""}`}>
              {total}/{SP_BUDGET} used
            </span>
          </div>
          <div className="grid6">
            {SP_KEYS.map((k) => (
              <div key={k}>
                <label className="field">{k.toUpperCase()}</label>
                <input
                  className="mono"
                  type="number"
                  min={0}
                  max={SP_MAX_PER_STAT}
                  value={mon.set.sp[k] ?? 0}
                  onChange={(e) => setSP(k, Number(e.target.value))}
                />
                <div className="tiny dimmer mono" style={{ textAlign: "center", marginTop: 2 }}>
                  {stats[k]}
                </div>
              </div>
            ))}
          </div>
          {total > SP_BUDGET && (
            <div className="hint warn" style={{ marginTop: 8 }}>
              Over the 66 SP budget - this spread is not legal in Reg M-B.
            </div>
          )}
        </div>

        {/* --- moves + scouting --- */}
        <div className="panel">
          <div className="panel-title">
            Moves
            {isOpp && <span className="count">tick what you have actually seen</span>}
          </div>
          <datalist id="move-names">
            {ALL_MOVE_NAMES.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>
          {mon.set.moves.map((m, i) => {
            const seen = mon.revealed.moves.includes(m);
            return (
              <div className="row" key={i} style={{ marginBottom: 6 }}>
                <input
                  list="move-names"
                  value={m}
                  onChange={(e) => setMove(i, e.target.value)}
                  style={{ flex: 1 }}
                />
                {isOpp && (
                  <button
                    className={`btn sm ${seen ? "on" : ""}`}
                    title={seen ? "Confirmed - seen in game" : "Assumed from the common set"}
                    onClick={() =>
                      dispatch({
                        type: seen ? "UNREVEAL_MOVE" : "REVEAL_MOVE",
                        uid: mon.uid,
                        moveName: m,
                      })
                    }
                  >
                    {seen ? "seen" : "assumed"}
                  </button>
                )}
              </div>
            );
          })}
          <button
            className="btn sm"
            onClick={() =>
              dispatch({
                type: "EDIT_SET",
                uid: mon.uid,
                patch: { moves: [...mon.set.moves, ""] },
              })
            }
          >
            + add move slot
          </button>
        </div>

        {isOpp && (
          <div className="panel">
            <div className="panel-title">
              Move pool
              <span className="count">
                {sc.confirmed.length}/4 confirmed
                {sc.fullyScouted ? " - fully scouted" : `, ${sc.possible.length} still possible`}
              </span>
            </div>
            <div className="hint" style={{ marginBottom: 8 }}>
              They carry four of these. The planner assumes they have any move you have
              not ruled out, so every one you settle makes the guarantees stronger.
            </div>
            {pool.map((mv) => {
              const seen = sc.confirmed.includes(mv);
              const out = sc.ruledOut.includes(mv);
              return (
                <div key={mv} className={`poolmove ${seen ? "seen" : ""} ${out ? "out" : ""}`}>
                  <span style={{ flex: 1 }}>{mv}</span>
                  {!isSimulated(mv) && <span className="tag">not simulated</span>}
                  <button
                    className={`btn xs ${seen ? "on" : ""}`}
                    onClick={() =>
                      dispatch({
                        type: seen ? "UNREVEAL_MOVE" : "REVEAL_MOVE",
                        uid: mon.uid,
                        moveName: mv,
                      })
                    }
                  >
                    seen
                  </button>
                  <button
                    className={`btn xs ${out ? "on" : ""}`}
                    onClick={() =>
                      dispatch({
                        type: out ? "UNRULE_MOVE" : "RULE_OUT_MOVE",
                        uid: mon.uid,
                        moveName: mv,
                      })
                    }
                  >
                    ruled out
                  </button>
                </div>
              );
            })}
            <div className="row" style={{ marginTop: 8 }}>
              <input
                list="move-names"
                placeholder="add a move to this pool (e.g. Solar Beam)"
                value={poolDraft}
                onChange={(e) => setPoolDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addToPool();
                }}
                style={{ flex: 1 }}
              />
              <button className="btn sm" disabled={!poolDraft.trim()} onClick={addToPool}>
                add
              </button>
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              The pool is the set of moves the planner treats as possible. It is not a
              full learnset — the app has no legality data, so it will accept anything you
              type. Adding a move here lasts for this battle; to keep it, add it to that
              species in <span className="mono">src/data/threats.js</span>.
            </div>

            {sc.fullyScouted && (
              <div className="hint" style={{ marginTop: 8, color: "var(--live)" }}>
                All four slots are accounted for. Everything the planner says about this
                Pokemon is now deterministic.
              </div>
            )}
          </div>
        )}

        {isOpp && (
          <div className="panel">
            <div className="panel-title">Scouting</div>
            <div className="hint" style={{ marginBottom: 8 }}>
              Until you confirm the spread, KO claims against this mon are reported as a
              boundary ("unless they ran more bulk") rather than a certainty.
            </div>
            <div className="row">
              {(["item", "ability", "nature", "sp"] as const).map((f) => (
                <button
                  key={f}
                  className={`btn sm ${mon.revealed[f] ? "on" : ""}`}
                  onClick={() =>
                    dispatch({
                      type: "SET_REVEALED",
                      uid: mon.uid,
                      field: f,
                      value: !mon.revealed[f],
                    })
                  }
                >
                  {f === "sp" ? "spread" : f} {mon.revealed[f] ? "confirmed" : "assumed"}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* --- bench / removal --- */}
        <div className="panel">
          <div className="panel-title">Board</div>
          <div className="row">
            {state.sides[mon.side].active.map((uid, slot) =>
              uid === mon.uid ? null : (
                <button
                  key={slot}
                  className="btn sm"
                  onClick={() =>
                    dispatch({ type: "SWITCH_IN", side: mon.side, slot, uid: mon.uid })
                  }
                >
                  Move to slot {slot + 1}
                </button>
              )
            )}
            <button
              className="btn sm danger"
              onClick={() => {
                dispatch({ type: "REMOVE_MON", uid: mon.uid });
                onClose();
              }}
            >
              Remove from battle
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
