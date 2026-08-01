// ===========================================================================
// Speed / turn order over the live board. Thin adapter onto src/speed.js.
// ===========================================================================
import { effectiveSpeed, faster, turnOrder, benchmarks } from "../../speed.js";
import type { SpeedField, SpeedMon } from "../../speed.js";
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { activeProfile, rawStats } from "./stats.ts";
import { effectivePriority } from "./moves.ts";

/**
 * Build the shape speed.js reads.
 * Spe is RAW here - `effectiveSpeed` applies the Spe stage, Scarf, Tailwind,
 * paralysis and weather-speed abilities itself (speed.js:14-27).
 */
export function speedMonOf(mon: MonState): SpeedMon {
  const p = activeProfile(mon);
  return {
    spe: rawStats(mon).spe,
    side: mon.side,
    item: mon.itemActive ? mon.set.item : "",
    ability: p.ability,
    status: mon.status,
    stages: { spe: mon.stages.spe },
    unburdened: mon.unburdened,
  };
}

export function speedFieldOf(state: BattleState): SpeedField {
  const tailwind: SideId[] = [];
  if (state.field.tailwind.me > 0) tailwind.push("me");
  if (state.field.tailwind.opp > 0) tailwind.push("opp");
  return {
    tailwind,
    trickRoom: state.field.trickRoom > 0,
    weather: state.field.weather?.kind ?? null,
  };
}

export function currentSpeed(mon: MonState, state: BattleState): number {
  return effectiveSpeed(speedMonOf(mon), speedFieldOf(state));
}

export interface SpeedVerdict {
  /** Does the first mon act before the second? */
  first: "a" | "b" | "tie";
  aSpeed: number;
  bSpeed: number;
  tie: boolean;
  /** True when priority, not raw speed, decided it. */
  byPriority: boolean;
  aPriority: number;
  bPriority: number;
  label: string;
}

function priorityOf(moveName: string | null, mon: MonState): number {
  if (!moveName) return 0;
  return effectivePriority(moveName, mon);
}

/**
 * Who acts first, accounting for the priority bracket as well as speed.
 * `faster()` alone assumes equal priority (speed.js:30), so anything involving
 * Sucker Punch / Aqua Jet / Bullet Punch has to consider priority explicitly.
 */
export function movesFirst(
  a: MonState,
  b: MonState,
  state: BattleState,
  aMove: string | null = null,
  bMove: string | null = null
): SpeedVerdict {
  const field = speedFieldOf(state);
  const aPriority = priorityOf(aMove, a);
  const bPriority = priorityOf(bMove, b);

  const raw = faster(speedMonOf(a), speedMonOf(b), field);
  const aSpeed = raw.aSpeed;
  const bSpeed = raw.bSpeed;

  if (aPriority !== bPriority) {
    const aFirst = aPriority > bPriority;
    return {
      first: aFirst ? "a" : "b",
      aSpeed, bSpeed, tie: false, byPriority: true, aPriority, bPriority,
      label: `${aFirst ? "you" : "they"} move first on priority (+${Math.max(aPriority, bPriority)})`,
    };
  }

  const tie = raw.first === "tie";
  const label = tie
    ? `SPEED TIE at ${aSpeed} - coinflip`
    : raw.first === "a"
      ? `you move first (${aSpeed} vs ${bSpeed})`
      : `they move first (${bSpeed} vs ${aSpeed})`;

  return { first: raw.first, aSpeed, bSpeed, tie, byPriority: false, aPriority, bPriority, label };
}

export interface OrderedMon {
  uid: string;
  mon: MonState;
  moveName: string | null;
  speed: number;
  priority: number;
  tie: boolean;
}

/** Full turn order across every mon on the field. */
export function boardTurnOrder(
  state: BattleState,
  moveChoices: Record<string, string | null> = {}
): OrderedMon[] {
  const actives: MonState[] = [];
  for (const side of ["me", "opp"] as SideId[]) {
    for (const uid of state.sides[side].active) {
      if (!uid) continue;
      const m = state.mons[uid];
      if (m && !m.fainted) actives.push(m);
    }
  }
  const ordered = turnOrder(
    actives.map((m) => ({
      id: m.uid,
      mon: speedMonOf(m),
      priority: priorityOf(moveChoices[m.uid] ?? null, m),
    })),
    speedFieldOf(state)
  );
  return ordered.map((o) => ({
    uid: o.id,
    mon: state.mons[o.id],
    moveName: moveChoices[o.id] ?? null,
    speed: o.speed,
    priority: o.priority,
    tie: o.tie,
  }));
}

/** Speed-tier row for the benchmark table. */
export function speedRow(mon: MonState) {
  return benchmarks(speedMonOf(mon));
}
