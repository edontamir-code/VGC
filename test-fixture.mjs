// Shared test fixture.
//
// Every regression test builds its board from the FROZEN legacy team, never
// from the live team.js. That keeps the suite deterministic: swapping the team
// you are actually playing must not change whether the engine is correct.
import { TEAM as LEGACY } from "./src/data/team.legacy.js";
import { THREATS_LEGACY } from "./src/data/threats.legacy.js";
import {
  newBattleState, setFromTeam, setFromThreat, monFromThreatId,
} from "./src/app/model/factory.ts";
import { makeMonState } from "./src/app/state/reducer.ts";

export { LEGACY, THREATS_LEGACY };

/**
 * An opposing mon built from the FROZEN sets, for tests that assert exact
 * damage numbers. Tests about behaviour rather than numbers can keep using
 * monFromThreatId and the live data.
 */
export function legacyThreat(id) {
  const t = THREATS_LEGACY.find((x) => x.id === id);
  // Only the five sets the verified numbers depend on are frozen. Anything
  // else is a behavioural test, not a numeric one, so the live set is fine.
  return t
    ? makeMonState(setFromThreat(t), "opp", "threat")
    : monFromThreatId(id, "opp");
}

/** The legacy six as editable sets. */
export const legacySets = () => LEGACY.map((m) => setFromTeam(m));

/** A fresh battle with the legacy six on your side. */
export const legacyBattle = () => newBattleState(legacySets());
