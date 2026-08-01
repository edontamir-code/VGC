// Field banner: weather / Tailwind / Trick Room / screens WITH turn counters.
import { useBattle } from "../state/store.tsx";
import type { SideId, TerrainKind, WeatherKind } from "../model/types.ts";

const TERRAINS: { kind: TerrainKind; label: string; hint: string }[] = [
  {
    kind: "psychic",
    label: "Psychic Terr.",
    hint: "Blocks ALL priority moves against grounded targets - no Fake Out, Sucker Punch, Aqua Jet or Prankster status.",
  },
  { kind: "electric", label: "Electric Terr.", hint: "Electric moves x1.3 from grounded attackers; no sleep." },
  { kind: "grassy", label: "Grassy Terr.", hint: "Grass moves x1.3; Earthquake halved against grounded targets." },
  { kind: "misty", label: "Misty Terr.", hint: "Dragon moves halved against grounded targets; no status." },
];

const WEATHERS: { kind: WeatherKind; label: string }[] = [
  { kind: "sun", label: "Sun" },
  { kind: "rain", label: "Rain" },
  { kind: "sand", label: "Sand" },
  { kind: "snow", label: "Snow" },
];

function Timer({ n }: { n: number }) {
  return <span className="t">{n}</span>;
}

export default function FieldBar() {
  const { state, dispatch } = useBattle();
  const f = state.field;

  return (
    <div className="panel">
      <div className="panel-title">
        Field
        <span className="count">tap to toggle - counters tick on Next turn</span>
      </div>

      <div className="fieldbar">
        {WEATHERS.map((w) => {
          const on = f.weather?.kind === w.kind;
          return (
            <button
              key={w.kind}
              className={`chip ${w.kind} ${on ? "active" : ""}`}
              onClick={() =>
                dispatch({ type: "SET_WEATHER", kind: on ? null : w.kind })
              }
            >
              {w.label}
              {on && <Timer n={f.weather!.turnsLeft} />}
            </button>
          );
        })}

        {(["me", "opp"] as SideId[]).map((side) => {
          const on = f.tailwind[side] > 0;
          return (
            <button
              key={`tw-${side}`}
              className={`chip tw ${on ? "active" : ""}`}
              onClick={() => dispatch({ type: "SET_TAILWIND", side, on: !on })}
            >
              <span className={`side-tag ${side}`}>{side === "me" ? "YOU" : "OPP"}</span>
              Tailwind
              {on && <Timer n={f.tailwind[side]} />}
            </button>
          );
        })}

        <button
          className={`chip tr ${f.trickRoom > 0 ? "active" : ""}`}
          onClick={() => dispatch({ type: "SET_TRICK_ROOM", on: f.trickRoom === 0 })}
        >
          Trick Room
          {f.trickRoom > 0 && <Timer n={f.trickRoom} />}
        </button>

        {TERRAINS.map((t) => {
          const on = f.terrain?.kind === t.kind;
          return (
            <button
              key={t.kind}
              className={`chip terrain ${on ? "active" : ""}`}
              title={t.hint}
              onClick={() => dispatch({ type: "SET_TERRAIN", kind: on ? null : t.kind })}
            >
              {t.label}
              {on && <Timer n={f.terrain!.turnsLeft} />}
            </button>
          );
        })}

        {(["me", "opp"] as SideId[]).map((side) => (
          <span key={`sc-${side}`} style={{ display: "contents" }}>
            {(
              [
                ["reflect", "Reflect"],
                ["lightScreen", "L.Screen"],
                ["auroraVeil", "Veil"],
              ] as const
            ).map(([kind, label]) => {
              const n = f.screens[side][kind];
              return (
                <button
                  key={`${side}-${kind}`}
                  className={`chip screen ${n > 0 ? "active" : ""}`}
                  onClick={() => dispatch({ type: "SET_SCREEN", side, kind, on: n === 0 })}
                >
                  <span className={`side-tag ${side}`}>{side === "me" ? "YOU" : "OPP"}</span>
                  {label}
                  {n > 0 && <Timer n={n} />}
                </button>
              );
            })}
          </span>
        ))}
      </div>
    </div>
  );
}
