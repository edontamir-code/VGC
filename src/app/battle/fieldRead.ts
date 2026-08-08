// ===========================================================================
// The exact field, in one readable block.
//
// This exists because reconstructing the board is the slow part of using a
// damage calculator mid-game. "He's +1 because he was -2 and then Intimidate
// wore off, and the sun is up, and my screen has two turns left" is four
// things to remember and one of them is always wrong.
//
// Everything here is READ from BattleState. Nothing is inferred or assumed at
// this layer - if a condition shows up in this list, the simulator put it
// there, which means the damage numbers already reflect it.
// ===========================================================================
import type { BattleState, MonState, SideId, Stages } from "../model/types.ts";
import { activeMons } from "./resolver.ts";
import { activeProfile } from "./stats.ts";

export type FieldTag = "weather" | "terrain" | "trickRoom" | "tailwind" | "screen" | "gravity";

export interface FieldLine {
  tag: FieldTag;
  /** "Sun", "Reflect (their side)", "Trick Room". */
  label: string;
  turnsLeft: number;
  /** Whose side this helps. null for field-wide effects. */
  side: SideId | null;
  /** What it does to the numbers, in the user's terms. */
  effect: string;
  /**
   * True when this ends BEFORE the turn after next - i.e. you can plan around
   * simply outlasting it. The single most actionable fact about a timer.
   */
  expiringSoon: boolean;
}

export interface StageLine {
  uid: string;
  name: string;
  side: SideId;
  /** Only the non-zero stages, pre-formatted: "+1 Atk", "-2 Spe". */
  parts: string[];
  /** Net across all stats - a crude but useful "who is ahead" read. */
  net: number;
}

export interface FieldRead {
  lines: FieldLine[];
  stages: StageLine[];
  /** One-line summary for the console. "Sun 3 | Trick Room 2 | their Reflect 4" */
  summary: string;
}

/** Only the stages that change damage or turn order - acc/eva are noise here. */
const STAGE_LABEL: Partial<Record<keyof Stages, string>> = {
  atk: "Atk", def: "Def", spa: "SpA", spd: "SpD", spe: "Spe",
};

const WEATHER_EFFECT: Record<string, string> = {
  sun: "Fire x1.5, Water x0.5",
  rain: "Water x1.5, Fire x0.5",
  sand: "Rock SpD x1.5, chip on non-Rock/Ground/Steel",
  snow: "Ice Def x1.5, enables Aurora Veil",
};

const TERRAIN_EFFECT: Record<string, string> = {
  electric: "Electric x1.3 on the ground, no sleep",
  grassy: "Grass x1.3, heals, Earthquake halved",
  misty: "Dragon x0.5 on the ground, no status",
  psychic: "Psychic x1.3, priority blocked on the ground",
};

function fmtStage(n: number): string {
  return n > 0 ? `+${n}` : `${n}`;
}

/** Which side's mons are labelled how, from my point of view. */
function sideWord(side: SideId): string {
  return side === "me" ? "yours" : "theirs";
}

export function fieldRead(state: BattleState): FieldRead {
  const lines: FieldLine[] = [];
  const soon = (t: number) => t > 0 && t <= 2;

  const w = state.field.weather;
  if (w && w.turnsLeft > 0) {
    lines.push({
      tag: "weather",
      label: w.kind,
      turnsLeft: w.turnsLeft,
      side: null,
      effect: WEATHER_EFFECT[w.kind] ?? "",
      expiringSoon: soon(w.turnsLeft),
    });
  }

  const t = state.field.terrain;
  if (t && t.turnsLeft > 0) {
    lines.push({
      tag: "terrain",
      label: `${t.kind} terrain`,
      turnsLeft: t.turnsLeft,
      side: null,
      effect: TERRAIN_EFFECT[t.kind] ?? "",
      expiringSoon: soon(t.turnsLeft),
    });
  }

  if (state.field.trickRoom > 0) {
    lines.push({
      tag: "trickRoom",
      label: "Trick Room",
      turnsLeft: state.field.trickRoom,
      side: null,
      effect: "slowest moves first",
      expiringSoon: soon(state.field.trickRoom),
    });
  }

  for (const side of ["me", "opp"] as SideId[]) {
    const tw = state.field.tailwind[side];
    if (tw > 0) {
      lines.push({
        tag: "tailwind",
        label: `Tailwind (${sideWord(side)})`,
        turnsLeft: tw,
        side,
        effect: "Spe x2",
        expiringSoon: soon(tw),
      });
    }
  }

  // Screens are listed from the point of view of the side they PROTECT, since
  // that is how you have to think about them when picking an attack.
  for (const side of ["me", "opp"] as SideId[]) {
    const s = state.field.screens[side];
    const each: [number, string, string][] = [
      [s.auroraVeil, "Aurora Veil", "physical AND special x0.667"],
      [s.reflect, "Reflect", "physical x0.667"],
      [s.lightScreen, "Light Screen", "special x0.667"],
    ];
    for (const [turns, label, effect] of each) {
      if (turns <= 0) continue;
      lines.push({
        tag: "screen",
        label: `${label} (${sideWord(side)})`,
        turnsLeft: turns,
        side,
        effect,
        expiringSoon: soon(turns),
      });
    }
  }

  if (state.field.gravity > 0) {
    lines.push({
      tag: "gravity",
      label: "Gravity",
      turnsLeft: state.field.gravity,
      side: null,
      effect: "accuracy x1.67, no Flying immunity",
      expiringSoon: soon(state.field.gravity),
    });
  }

  const stages: StageLine[] = [];
  for (const side of ["me", "opp"] as SideId[]) {
    for (const mon of activeMons(state, side)) {
      const parts: string[] = [];
      let net = 0;
      for (const k of Object.keys(STAGE_LABEL) as (keyof Stages)[]) {
        const v = mon.stages[k];
        if (!v) continue;
        parts.push(`${fmtStage(v)} ${STAGE_LABEL[k] ?? k}`);
        net += v;
      }
      if (parts.length === 0) continue;
      stages.push({
        uid: mon.uid,
        name: activeProfile(mon).displayName,
        side,
        parts,
        net,
      });
    }
  }

  const bits = [
    ...lines.map((l) => `${l.label} ${l.turnsLeft}`),
    ...stages.map((s) => `${s.name} ${s.parts.join(" ")}`),
  ];

  return { lines, stages, summary: bits.length ? bits.join(" | ") : "clear field" };
}

/**
 * How long a screen this Pokemon sets would last, and whether that is known.
 *
 * Light Clay is the difference between "wait it out" being a plan and not
 * being one. When we have not seen their item, both answers stay live: a
 * Grimmsnarl is holding Light Clay often enough that assuming 5 turns and
 * being wrong costs you the game three turns later.
 */
export interface ScreenLength {
  turns: number;
  /** The other possibility, when the item is unknown. */
  alternative: number | null;
  because: string;
}

export function screenLength(mon: MonState, state: BattleState): ScreenLength {
  const d = state.durations;
  const item = (mon.set.item ?? "").toLowerCase();
  if (item === "light clay") {
    return { turns: d.screensClay, alternative: null, because: "Light Clay confirmed" };
  }
  if (item) {
    return { turns: d.screens, alternative: null, because: `holding ${mon.set.item}` };
  }
  return {
    turns: d.screens,
    alternative: d.screensClay,
    because: "item unknown - Light Clay would make it 8",
  };
}
