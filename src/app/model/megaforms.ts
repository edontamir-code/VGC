// ===========================================================================
// Pre-Mega profiles. DATA ONLY — kept out of the verified engine files.
//
// team.js stores `base` as the MEGA form's stat line (the in-battle profile)
// and `baseForm` as the pre-Mega line. It does NOT store the pre-Mega typing or
// ability, so those live here, sourced from the comments in team.js:
//   - Staraptor: "Mega typing (base form is Normal/Flying)" + "Intimidate on
//     entry before Mega."                                     (team.js:9, :17)
//   - Delphox:   "Mega ability = Levitate"                    (team.js:68)
//
// Anything marked `assumed` below is the species' standard profile rather than
// something the repo states. It is editable in the UI like any other field.
// ===========================================================================

export interface PreMegaProfile {
  types: string[];
  ability: string;
  /** Type immunities granted by the PRE-Mega ability (not the Mega one). */
  immuneTypes?: string[];
  /** True where the ability is inferred from the species, not from team.js. */
  assumed?: boolean;
}

export const PRE_MEGA: Record<string, PreMegaProfile> = {
  Staraptor: {
    types: ["Normal", "Flying"],
    ability: "Intimidate",
    // Flying already gives the Ground immunity via the type chart.
    immuneTypes: [],
  },
  Delphox: {
    types: ["Fire", "Psychic"],
    ability: "Blaze",
    // Levitate is the MEGA ability — pre-Mega Delphox is hit by Ground.
    immuneTypes: [],
    assumed: true,
  },

  // --- Opposing Megas -----------------------------------------------------
  // The abilities below are what pikalytics reports for the SPECIES in Reg M-B
  // S3 — which is the un-Mega'd form. The Mega ability lives on the threat
  // entry itself. The distinction matters: a Mawile that has not Mega Evolved
  // yet has Intimidate and normal Attack, NOT Huge Power and double Attack.
  swampert: { types: ["Water", "Ground"], ability: "Torrent", immuneTypes: [] },
  metagross: { types: ["Steel", "Psychic"], ability: "Clear Body", immuneTypes: [] },
  mawile: { types: ["Steel", "Fairy"], ability: "Intimidate", immuneTypes: [] },
  sableye: { types: ["Dark", "Ghost"], ability: "Prankster", immuneTypes: [], assumed: true },
};
