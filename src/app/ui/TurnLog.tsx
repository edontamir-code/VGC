// Turn log + the editable field durations.
import { useBattle, useHardReset } from "../state/store.tsx";
import type { Durations } from "../model/types.ts";

const DURATION_LABELS: { key: keyof Durations; label: string }[] = [
  { key: "weather", label: "Weather" },
  { key: "weatherRock", label: "Weather (rock)" },
  { key: "tailwind", label: "Tailwind" },
  { key: "trickRoom", label: "Trick Room" },
  { key: "screens", label: "Screens" },
  { key: "screensClay", label: "Screens (Clay)" },
  { key: "terrain", label: "Terrain" },
  { key: "gravity", label: "Gravity" },
];

export default function TurnLog() {
  const { state, dispatch } = useBattle();
  const reset = useHardReset();
  const entries = [...state.log].reverse();

  return (
    <>
      <div className="panel">
        <div className="panel-title">
          Turn log
          <span className="count">{state.log.length} entries</span>
        </div>
        <div className="log">
          {entries.map((e) => (
            <div className="log-entry" key={e.id}>
              <span className="log-turn">T{e.turn}</span>
              <span className={`log-${e.kind}`}>{e.text}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">
          Field durations
          <span className="count">editable - survives a balance patch</span>
        </div>
        <div className="grid2">
          {DURATION_LABELS.map(({ key, label }) => (
            <div key={key}>
              <label className="field">{label}</label>
              <input
                className="mono"
                type="number"
                min={0}
                max={20}
                value={state.durations[key]}
                onChange={(e) =>
                  dispatch({ type: "SET_DURATION", key, value: Number(e.target.value) })
                }
              />
            </div>
          ))}
        </div>
      </div>

      <div className="panel">
        <div className="panel-title">Danger zone</div>
        <button className="btn danger" onClick={reset}>
          Reset battle (clears the saved board)
        </button>
      </div>
    </>
  );
}
