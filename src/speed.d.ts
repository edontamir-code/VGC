// Type declarations for the VERIFIED speed engine (src/speed.js).
import type { WeatherKind } from "./engine.js";

export type SideId = "me" | "opp";
export type StatusKind = "par" | "brn" | "psn" | "slp" | "frz";

/** The shape `effectiveSpeed` reads. `spe` is the already-computed Spe stat. */
export interface SpeedMon {
  spe: number;
  side?: SideId;
  item?: string;
  ability?: string;
  status?: StatusKind | null;
  stages?: { spe?: number };
  unburdened?: boolean;
}

export interface SpeedField {
  tailwind?: SideId[];
  trickRoom?: boolean;
  weather?: WeatherKind | null;
}

export function stageMult(stage: number): number;
export function effectiveSpeed(mon: SpeedMon, field?: SpeedField): number;

export interface FasterResult {
  first: "a" | "b" | "tie";
  aSpeed: number;
  bSpeed: number;
}
export function faster(a: SpeedMon, b: SpeedMon, field?: SpeedField): FasterResult;

export interface SpeedAction<T = unknown> {
  id: T;
  mon: SpeedMon;
  priority?: number;
}
export interface OrderedAction<T = unknown> {
  id: T;
  mon: SpeedMon;
  priority: number;
  speed: number;
  tie: boolean;
}
export function turnOrder<T>(
  actions: SpeedAction<T>[],
  field?: SpeedField
): OrderedAction<T>[];

export interface Benchmarks {
  base: number;
  scarf: number;
  tailwind: number;
  minus1: number;
  paralyzed: number;
}
export function benchmarks(mon: SpeedMon): Benchmarks;
