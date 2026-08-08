// ===========================================================================
// The live damage calculator.
//
// Every move, into every legal target, under the EXACT current field - the
// thing you would otherwise be typing into an external calc one line at a
// time while a timer runs.
//
// This deliberately does not rank or recommend. The planner does that. This
// is the raw board so you can work in parallel with it and disagree with it.
// ===========================================================================
import type { BattleState, MonState, SideId } from "../model/types.ts";
import { activeMons } from "./resolver.ts";
import { activeProfile } from "./stats.ts";
import { resolveMatchup } from "./damage.ts";
import type { ResolvedMatchup, Verdict } from "./damage.ts";
import { getMoveData } from "./moves.ts";
import { effectiveAccuracy } from "./abilities.ts";
import { STATUS_MOVES } from "./statusMoves.ts";
import { canMegaNow } from "../sim/actions.ts";
import { computeStats } from "../../engine.js";

export interface CalcCell {
  targetUid: string;
  targetName: string;
  /** null when the move cannot touch this target at all. */
  result: ResolvedMatchup | null;
  /** "IMMUNE", or the damage band as a percentage of CURRENT hp. */
  text: string;
  verdict: Verdict | "STATUS";
  /** Percent of the target's CURRENT hp, worst roll. Sort key. */
  minPct: number;
  maxPct: number;
}

export interface CalcRow {
  attackerUid: string;
  attackerName: string;
  side: SideId;
  moveName: string;
  /** True when this row assumes the attacker Mega Evolves first. */
  mega: boolean;
  category: "phys" | "spec" | "status";
  /** After No Guard, Gravity and the rest. */
  accuracy: number;
  spread: boolean;
  /** Non-damaging moves carry their effect text instead of numbers. */
  statusEffect: string | null;
  cells: CalcCell[];
  /** Every modifier the engine actually applied, deduped across targets. */
  modifiers: string[];
  /**
   * Worst-roll damage summed over everything it hits, as a share of a full
   * health bar. This is what makes a spread move comparable to a nuke: two
   * 45%s beat one 80%, and the flat list of cells does not say that.
   */
  boardMin: number;
  boardMax: number;
  /** Guaranteed kills at worst roll, before accuracy. */
  guaranteedKOs: number;
}

export interface CalcGrid {
  /** My moves outgoing. */
  mine: CalcRow[];
  /** Their moves incoming - what I am actually choosing between surviving. */
  theirs: CalcRow[];
  /** Anything the numbers below are ASSUMING rather than knowing. */
  assumptions: string[];
}

const DEAD_SET = new Set<Verdict>(["DEAD"]);

/** A copy of the state in which `uid` has Mega Evolved. */
function withMega(state: BattleState, uid: string): BattleState {
  const mon = state.mons[uid];
  if (!mon) return state;
  const stats = computeStats(mon.set.base, mon.set.sp, mon.set.nature);
  const frac = mon.maxHP > 0 ? mon.curHP / mon.maxHP : 1;
  return {
    ...state,
    mons: {
      ...state.mons,
      [uid]: {
        ...mon,
        hasMega: true,
        maxHP: stats.hp,
        curHP: Math.max(1, Math.min(stats.hp, Math.round(stats.hp * frac))),
      },
    },
  };
}

function band(r: ResolvedMatchup): string {
  const lo = Math.round(r.minPctCur);
  const hi = Math.round(r.maxPctCur);
  if (r.typeMult === 0) return "immune";
  return lo === hi ? `${lo}%` : `${lo}-${hi}%`;
}

function buildRow(
  attacker: MonState,
  moveName: string,
  state: BattleState,
  mega: boolean
): CalcRow | null {
  const foes = activeMons(state, attacker.side === "me" ? "opp" : "me");
  const data = getMoveData(moveName);
  const status = STATUS_MOVES[moveName];
  const name = activeProfile(attacker).displayName;

  if (!data) {
    if (!status) return null;
    return {
      attackerUid: attacker.uid,
      attackerName: name,
      side: attacker.side,
      moveName,
      mega,
      category: "status",
      accuracy: 100,
      spread: false,
      statusEffect: status.effect,
      cells: [],
      modifiers: [],
      boardMin: 0,
      boardMax: 0,
      guaranteedKOs: 0,
    };
  }

  const cells: CalcCell[] = [];
  const mods = new Set<string>();
  let boardMin = 0;
  let boardMax = 0;
  let kos = 0;

  for (const foe of foes) {
    const r = resolveMatchup(attacker, foe, moveName, state);
    const tName = activeProfile(foe).displayName;
    if (!r) {
      cells.push({
        targetUid: foe.uid, targetName: tName, result: null,
        text: "-", verdict: "IMMUNE", minPct: 0, maxPct: 0,
      });
      continue;
    }
    for (const m of r.modifiers) mods.add(m);
    cells.push({
      targetUid: foe.uid,
      targetName: tName,
      result: r,
      text: band(r),
      verdict: r.verdict,
      minPct: r.minPctCur,
      maxPct: r.maxPctCur,
    });
    // Percent of a FULL bar, so spread chip across two targets adds up to
    // something meaningful rather than being averaged away.
    boardMin += Math.min(100, r.minPct);
    boardMax += Math.min(100, r.maxPct);
    if (DEAD_SET.has(r.verdict)) kos++;
  }

  // A spread move only hits both if it is actually a spread move; single
  // target rows list both cells so you can compare, but only ever land one.
  if (!data.spread) {
    const best = cells.reduce(
      (a, c) => (c.minPct > a.minPct ? c : a),
      cells[0] ?? { minPct: 0, maxPct: 0 } as CalcCell
    );
    boardMin = Math.min(100, best.result?.minPct ?? 0);
    boardMax = Math.min(100, best.result?.maxPct ?? 0);
    kos = Math.min(kos, 1);
  }

  const acc = effectiveAccuracy(data.accuracy, attacker, foes[0] ?? attacker);

  return {
    attackerUid: attacker.uid,
    attackerName: name,
    side: attacker.side,
    moveName,
    mega,
    category: cells[0]?.result?.category ?? "phys",
    accuracy: acc.accuracy,
    spread: Boolean(data.spread),
    statusEffect: null,
    cells,
    modifiers: [...mods],
    boardMin,
    boardMax,
    guaranteedKOs: kos,
  };
}

function rowsFor(state: BattleState, side: SideId): CalcRow[] {
  const out: CalcRow[] = [];
  for (const mon of activeMons(state, side)) {
    for (const moveName of mon.set.moves) {
      if (!moveName) continue;
      const row = buildRow(mon, moveName, state, false);
      if (row) out.push(row);
    }
    // Mega Evolving changes the stats, the ability and sometimes the typing,
    // so it changes every number in the row. Show it as its own line rather
    // than silently picking one - committing the Mega is the decision.
    if (canMegaNow(mon, state)) {
      const megaState = withMega(state, mon.uid);
      const megaMon = megaState.mons[mon.uid];
      for (const moveName of mon.set.moves) {
        if (!moveName) continue;
        const row = buildRow(megaMon, moveName, megaState, true);
        if (row) out.push(row);
      }
    }
  }
  return out;
}

export function calcGrid(state: BattleState): CalcGrid {
  const mine = rowsFor(state, "me");
  const theirs = rowsFor(state, "opp");

  const assumptions: string[] = [];
  for (const mon of activeMons(state, "opp")) {
    const p = activeProfile(mon);
    if (p.inferred) assumptions.push(`${p.displayName}: form/ability assumed`);
    if (!mon.set.item) assumptions.push(`${p.displayName}: item unknown`);
    const spread = mon.set.sp;
    const known = Object.keys(mon.statBounds ?? {}).length > 0;
    if (spread && !known) {
      assumptions.push(`${p.displayName}: SP spread assumed from usage, not measured`);
    }
  }

  return { mine, theirs, assumptions: [...new Set(assumptions)] };
}

/** Sort helper for the UI: biggest board impact first, ties to accuracy. */
export function byBoardImpact(a: CalcRow, b: CalcRow): number {
  return (
    b.guaranteedKOs - a.guaranteedKOs ||
    b.boardMin - a.boardMin ||
    b.accuracy - a.accuracy
  );
}
