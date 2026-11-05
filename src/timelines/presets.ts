import {
  CANON_FLEETS,
  CANON_SPECIAL,
  CANON_STRATEGIC,
  CANON_TECH,
  cloneRules,
  type RuleSet,
  type TechModifiers,
} from './rules';

const tech = (p: Partial<TechModifiers> = {}): TechModifiers => ({ ...CANON_TECH, ...p });

/**
 * PRESET 1 — Canon Mass Effect 3. All multipliers are 1. Player-dependent
 * world-state choices (genophage, geth/quarian, etc.) are configured on the
 * scenario, not here, and never alter these physics.
 */
export const CANON_ME3: RuleSet = Object.freeze({
  id: 'canon_me3',
  name: 'Canon Mass Effect 3',
  tagline: 'The Reaper War, 2186. As it happened.',
  category: 'canon',
  description:
    'The established Reaper War. Reaper capital ships are near-invulnerable to conventional fleets; the Crucible is the only strategic hope. Player-dependent outcomes from the trilogy are selected per scenario.',
  historyChanges: [],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS },
  strategic: { ...CANON_STRATEGIC },
}) as RuleSet;

/** Source-led alternative to the existing balanced canon calibration. Only
 * the Everest weapon's supported two-second base cadence is overridden;
 * unestablished numbers remain labelled simulation estimates. */
export const STRICT_LORE: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'strict_lore',
  name: 'Strict Lore — Mass Effect',
  tagline: 'Canonical technology and roster; sourced main-gun cadence.',
  description: 'Excludes AU-only hulls, crossover factions and speculative refits. The Alliance Everest-pattern main gun uses the Codex two-second base cycle. Heat, damage and firing solutions can delay shots. Other weapon rates, movement and compressed ranges remain simulation estimates.',
  strictLore: true,
};

export const MULTIVERSE_CROSSOVER: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'multiverse_crossover',
  name: 'Multiverse Crossover — Sandbox',
  tagline: 'Halo, Warhammer 40,000 and Mass Effect on a declared common game scale.',
  category: 'au',
  family: 'crossover',
  campaignCompatible: false,
  description: 'Crossover sandbox with setting-weighted hull and weapon conversions. Heavy Warhammer vessels greatly exceed conventional Mass Effect and Halo cruisers; shields, damage and ranges use shared simulator abstractions. All cross-universe power comparisons are AU estimates, not established canon. Use fleet points or explicit faction overrides to construct encounters.',
  historyChanges: ['Unrelated fictional settings share one battlespace for crossover encounters.', 'Original stand-in hulls use declared AU damage, shield, range and durability conversions; this is not a literal physical equivalence.'],
  strategic: { ...CANON_STRATEGIC, conventionalVictoryPossible: true, crucibleAvailable: false },
};

/** PRESET 2 — Prepared Galaxy. */
export const PREPARED_GALAXY: RuleSet = {
  id: 'prepared_galaxy',
  name: 'Prepared Galaxy',
  tagline: 'The Council listened. The fleets mobilised early.',
  category: 'au',
  family: 'human_au',
  preferredFaction: 'alliance',
  description:
    'After Sovereign’s attack the Council accepted the Reaper threat. Shipyards ran at war tempo for three years and the species trained together. Reaper technology is unchanged; the organics simply have more of what they already had.',
  historyChanges: [
    'Council acknowledges Reapers in 2183 instead of dismissing them.',
    'Alliance, Hierarchy and Republics expand fleets by roughly 40–60%.',
    'Joint fleet exercises raise coordination; Thanix refits reach cruiser squadrons.',
    'Reaper capabilities are unchanged.',
  ],
  organic: tech({ fireRate: 1.1, accuracy: 1.08, crewQuality: 1.1, barrierRegen: 1.15 }),
  reaper: tech(),
  factionOverrides: {},
  special: { ...CANON_SPECIAL, thanixAvailability: 'fleetwide' },
  fleetStrength: { ...CANON_FLEETS, alliance: 1.5, turian: 1.4, asari: 1.4, salarian: 1.3 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.85 },
};

/** PRESET 3 — Humanity Ascendant. */
export const HUMANITY_ASCENDANT: RuleSet = {
  id: 'humanity_ascendant',
  name: 'Humanity Ascendant',
  tagline: 'Element zero on Mars, a century early.',
  category: 'au',
  family: 'human_au',
  preferredFaction: 'alliance',
  description:
    'Humanity found the Prothean archive on Mars in the 2040s and reached the relay network with a head start. The Alliance of 2186 fields a larger, more advanced navy, but a century of human expansion has strained relations with the Council.',
  historyChanges: [
    'Mars archive discovered ~2048; humanity industrialises eezo early.',
    'First Contact War is a prolonged border conflict; Human–Turian relations remain poor.',
    'Alliance fleet is ~2.2× canon with stronger mass accelerators and barriers.',
    'Council coordination with humanity is weaker than canon.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: {
    alliance: {
      massAcceleratorDamage: 1.5,
      massAcceleratorPenetration: 1.25,
      kineticBarrierStrength: 1.4,
      armourStrength: 1.3,
      hullIntegrity: 1.15,
      fireRate: 1.15,
      sensors: 1.3,
      accuracy: 1.1,
    },
  },
  special: { ...CANON_SPECIAL, thanixAvailability: 'fleetwide' },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.2, turian: 0.95 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.35 },
};

/** PRESET 4 — Cerberus Reformed. */
export const CERBERUS_REFORMED: RuleSet = {
  id: 'cerberus_reformed',
  name: 'Cerberus Reformed',
  tagline: 'The Illusive Man keeps his mind. Cerberus fights for humanity, on its own terms.',
  category: 'au',
  family: 'human_au',
  preferredFaction: 'cerberus',
  description:
    'Without indoctrination the Illusive Man treats the Reapers as the existential threat they are. Cerberus fleets cooperate with the Alliance against the Reapers while pursuing an explicitly pro-human agenda. Cerberus is not altruistic; it is pragmatic.',
  historyChanges: [
    'Illusive Man is never indoctrinated after the Collector Base.',
    'Cerberus ceases attacks on Alliance assets; a wary cooperation forms.',
    'Cerberus fleet strength roughly doubles through unmolested black-site production.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: { cerberus: { sensors: 1.2, electronicWarfare: 1.4, accuracy: 1.1 } },
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, cerberus: 2.0 },
  strategic: {
    ...CANON_STRATEGIC,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    alliedCoordination: 0.6,
  },
};

/** PRESET 5 — Reaper Escalation. */
export const REAPER_ESCALATION: RuleSet = {
  id: 'reaper_escalation',
  name: 'Reaper Escalation',
  tagline: 'They remember the Protheans. They will not make the same mistakes.',
  category: 'au',
  description:
    'The Reapers commit more capital ships to each front and adapt aggressively to organic tactics. An extremely difficult survival scenario.',
  historyChanges: [
    'Reaper fleet committed to the Milky Way is ~1.6× canon.',
    'Reaper targeting and coordination improve during each engagement.',
    'Indoctrination pressure on fleet crews is heightened.',
  ],
  organic: tech(),
  reaper: tech({ accuracy: 1.08, barrierRegen: 1.3, crewQuality: 1.15 }),
  factionOverrides: {},
  special: { ...CANON_SPECIAL },
  fleetStrength: { ...CANON_FLEETS, reaper: 1.6 },
  strategic: { ...CANON_STRATEGIC, reaperCompetence: 1.3, indoctrinationEffectiveness: 1.3, reaperReinforcements: 1.6 },
};

/**
 * PRESET 6 — Prime/Apex: Successful Refuse. Optional, player-selected AU.
 * Nothing in here touches canon mode.
 */
export const PRIME_APEX: RuleSet = {
  id: 'prime_apex',
  name: 'Prime/Apex — Successful Refuse',
  tagline: 'No Crucible shortcut. A galaxy prepared to win the war by force.',
  category: 'au',
  family: 'human_au',
  preferredFaction: 'alliance',
  description:
    'An exceptionally successful Shepard and an extraordinarily well prepared humanity and allied galaxy. HADES ammunition, hyper-mass accelerators and hardened defences let Alliance and Turian fleets genuinely threaten Reaper capital ships. The Homeworld Defence Rule applies: Earth and Palaven can each resist invasion without rescue. Victory is still earned in combat — selecting this preset declares nothing won.',
  historyChanges: [
    'Shepard combines Paragon and Renegade strengths; diplomacy and strategy succeed beyond normal limits.',
    'Alliance industrial base and R&D expanded massively after Sovereign; Turian Hierarchy follows.',
    'HADES rounds enter service: kinetic penetrators with a nuclear warhead that detonates after penetration; they bypass half of Reaper armour and pierce barriers more efficiently.',
    'Hyper-mass accelerators refit all Alliance and Turian dreadnoughts (AU weapon, ~3× canon slug energy).',
    'Barriers, armour, sensors and fleet coordination substantially improved.',
    'Cerberus Black Fleet optionally cooperates with Shepard and the Alliance; Cerberus remains Cerberus.',
    'Homeworld Defence Rule: Earth and Palaven can hold without allied rescue.',
    'The Catalyst’s options are refused; the Reapers must be defeated conventionally.',
  ],
  organic: tech({
    massAcceleratorDamage: 1.25,
    massAcceleratorPenetration: 1.3,
    massAcceleratorRange: 1.0,
    fireRate: 1.1,
    heatCapacity: 1.3,
    kineticBarrierStrength: 1.35,
    barrierRegen: 1.4,
    armourStrength: 1.3,
    hullIntegrity: 1.15,
    speed: 1.08,
    sensors: 1.4,
    electronicWarfare: 1.3,
    accuracy: 1.1,
    fighterStrength: 1.3,
    torpedoDamage: 1.4,
    gardianEffectiveness: 1.4,
    beamDamage: 1.35,
    crewQuality: 1.15,
  }),
  reaper: tech(),
  factionOverrides: {
    cerberus: { electronicWarfare: 1.6, sensors: 1.6 },
  },
  special: {
    hyperMassAccelerators: true,
    hadesRounds: true,
    thanixAvailability: 'fleetwide',
    reaperCommandVulnerability: true,
    indoctrinationDisabled: false,
  },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.0, turian: 1.6, asari: 1.3, salarian: 1.3, cerberus: 1.5 },
  strategic: {
    ...CANON_STRATEGIC,
    alliedCoordination: 0.9,
    conventionalVictoryPossible: true,
    crucibleAvailable: true,
    shepardEffectiveness: 1.8,
    illusiveManIndoctrinated: false,
    cerberusStance: 'cooperative',
    homeworldIndependence: true,
    indoctrinationEffectiveness: 0.5,
  },
};

/**
 * PRESET 7 — Cerberus Ascendant. A separate continuity: Shepard died at the
 * Collector Base; the unindoctrinated Illusive Man seizes control of the
 * Reaper fleet. Harbinger alone remains independent.
 */
export const CERBERUS_ASCENDANT: RuleSet = {
  id: 'cerberus_ascendant',
  name: 'Cerberus Ascendant',
  tagline: 'Shepard died at the Collector Base. The Illusive Man kept his mind — and took the Reapers.',
  category: 'au',
  family: 'human_au',
  preferredFaction: 'cerberus',
  description:
    'Shepard is killed in 2185. The Collector Base survives intact and the Illusive Man is never indoctrinated. Cerberus perfects a control solution: the Catalyst is destroyed, indoctrination is permanently disabled, and the Illusive Man alone commands the captured Reaper fleet. Harbinger stays independent and is destroyed by the controlled Reapers. Twenty years of Cerberus-led reconstruction follow, ending with the dismantling of the Reapers once humanity can defend itself.',
  historyChanges: [
    'Shepard dies at the conclusion of the Collector Base operation (2185).',
    'Collector Base preserved; Cerberus reverse-engineers Reaper command architecture.',
    'Catalyst destroyed; Reaper indoctrination permanently disabled.',
    'Illusive Man gains exclusive control of the Reaper fleet. No shared authority, no successor.',
    'Harbinger remains independent and is destroyed by controlled Reapers.',
    'Post-war 2186–2206: Cerberus directs reconstruction and a 20-year plan to replace Reaper superiority with human conventional fleets, then dismantle the Reapers.',
  ],
  organic: tech(),
  reaper: tech(),
  factionOverrides: { cerberus: { sensors: 1.3, electronicWarfare: 1.5, accuracy: 1.1, crewQuality: 1.1 } },
  special: { ...CANON_SPECIAL, indoctrinationDisabled: true, reaperCommandVulnerability: false },
  fleetStrength: { ...CANON_FLEETS, cerberus: 1.6 },
  strategic: {
    ...CANON_STRATEGIC,
    shepardAlive: false,
    shepardEffectiveness: 0,
    illusiveManIndoctrinated: false,
    cerberusStance: 'controls_reapers',
    catalystOperational: false,
    harbingerOperational: true,
    crucibleAvailable: false,
    conventionalVictoryPossible: true,
    indoctrinationEffectiveness: 0,
  },
};

/** AU branches deliberately stay on Mass Effect's technology tree. Exact
 * performance multipliers and campaign transit times are simulation estimates. */
export const ALIGNED_HUMANITY: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'aligned_humanity', name: 'Concordant Earth — Alliance and Cerberus', category: 'au', family: 'human_au', preferredFaction: 'alliance',
  tagline: 'One human strategic command, with shared intelligence and competing methods.',
  description: 'Cerberus develops as the Alliance’s compartmentalised research and intelligence arm rather than a hostile breakaway. Joint targeting, electronic warfare and sustained defensive fire replace secret fleets fighting one another. The Council still negotiates its own commitments, and conventional human guns do not suddenly erase Reaper superiority.',
  historyChanges: ['Cerberus remains ideologically aligned with Alliance strategic command; the Illusive Man avoids indoctrination.', 'Black-site intelligence, countermeasures and defensive research reach both human fleets.', 'Reaper technology, numbers and command competence are unchanged; all human performance conversions are AU estimates.'],
  factionOverrides: {
    alliance: { massAcceleratorDamage: 1.18, kineticBarrierStrength: 1.25, armourStrength: 1.1, heatCapacity: 1.25, sensors: 1.35, electronicWarfare: 1.35, crewQuality: 1.12 },
    cerberus: { massAcceleratorDamage: 1.12, kineticBarrierStrength: 1.2, heatCapacity: 1.25, sensors: 1.5, electronicWarfare: 1.6, crewQuality: 1.12 },
  },
  fleetStrength: { ...CANON_FLEETS, alliance: 1.3, cerberus: 1.6 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.84, illusiveManIndoctrinated: false, cerberusStance: 'cooperative', indoctrinationEffectiveness: 0.8 },
};

export const IRON_DAWN: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'iron_dawn', name: 'Iron Dawn — First Contact Victors', category: 'au', family: 'human_au', preferredFaction: 'alliance',
  tagline: 'Humanity wins at Shanxi, and keeps the war economy.',
  description: 'An earlier, heavily militarised Alliance wins the First Contact War and expands from a position of force. Its long gun lines and armoured capitals are dangerous but slower; Council distrust weakens coalition command. This is a harder human state, not limitless technology: Reapers retain their original capabilities and exploit the political divisions.',
  historyChanges: ['Humanity mobilises before First Contact, wins the Shanxi campaign and continues military expansion.', 'Armoured hulls and penetrator development receive resources at the expense of manoeuvrability and diplomacy.', 'Council support and joint coordination decline. These are AU history and performance estimates.'],
  factionOverrides: { alliance: { massAcceleratorDamage: 1.55, massAcceleratorPenetration: 1.35, armourStrength: 1.75, hullIntegrity: 1.3, kineticBarrierStrength: 1.1, heatCapacity: 1.25, speed: 0.85, sensors: 1.1 } },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.0, turian: 0.95 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.3 },
};

export const BEACON_1800: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'beacon_1800', name: 'The Sealed Relay — Warning of 1800', category: 'au', family: 'human_au', preferredFaction: 'alliance',
  tagline: 'A Prothean warning. Two hundred and ninety years to prepare.',
  description: 'Humanity recovers an intelligible Prothean warning in 1800. Following its instructions, Earth leaves Charon sealed until 2090 while developing industry, barriers and a dispersed military infrastructure in isolation. By 2186 its navy can sustain losses that would break the original Alliance, but centuries of preparation are not a free counter to Reaper weapons.',
  historyChanges: ['A Prothean beacon warns humanity in 1800, an explicitly alternate discovery.', 'Charon remains sealed until the instructed opening in 2090: 290 years of isolated development and military construction.', 'Survivability, heat management, sensors and trained reserves take priority over speculative superweapons.', 'Reapers retain their original technology and fleets. All industrial and combat multipliers are AU estimates.'],
  factionOverrides: { alliance: { massAcceleratorDamage: 1.5, massAcceleratorPenetration: 1.3, massAcceleratorRange: 1.15, kineticBarrierStrength: 1.75, armourStrength: 1.4, hullIntegrity: 1.2, heatCapacity: 1.5, sensors: 1.6, electronicWarfare: 1.45, torpedoDamage: 1.2, crewQuality: 1.25, fireRate: 1.05 } },
  fleetStrength: { ...CANON_FLEETS, alliance: 2.4, cerberus: 1.2 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.7, homeworldIndependence: true, indoctrinationEffectiveness: 0.65 },
};

export const RELAY_FREE_HUMANITY: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'relay_free_humanity', name: 'The Unbound Route — Non-eezo FTL', category: 'au', family: 'human_au', preferredFaction: 'alliance',
  tagline: 'Human fleets can bypass relay corridors; combat thrust still has limits.',
  description: 'Humanity develops an independent FTL transit architecture rather than depending entirely on relay routes. Alliance and cooperative Cerberus fleets can take three-week direct campaign transits, avoiding intervening systems while remaining unavailable for defence or reinforcement in transit. The travel time is an abstract AU estimate. It does not multiply combat speed or remove the Reaper threat.',
  historyChanges: ['Humanity develops a non-eezo FTL drive alongside, rather than replacing, the Mass Effect combat technology tree.', 'Human fleets gain relay-independent campaign routes with a declared three-week transit abstraction.', 'Normal combat speeds remain unchanged; modest armour, sensor and gun improvements reflect a different industrial path.'],
  factionOverrides: { alliance: { massAcceleratorDamage: 1.15, massAcceleratorRange: 1.15, armourStrength: 1.25, hullIntegrity: 1.15, kineticBarrierStrength: 1.1, sensors: 1.3, crewQuality: 1.1 } },
  fleetStrength: { ...CANON_FLEETS, alliance: 1.35 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.55, relayIndependentHumanFTL: true },
};

export const PROTHEAN_VICTORY: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'prothean_victory', name: 'Prothean Victory — The Broken Harvest', category: 'au', family: 'historical_au', preferredFaction: 'prothean', campaignCompatible: false,
  tagline: 'A previous cycle survives, and faces the returning remnants.',
  description: 'A counterfactual Prothean victory interrupts the harvest. Original estimated Prothean hulls and weapons can fight remnant or renewed Reaper incursions in custom battles. This is a historical battle sandbox, not the modern 2186 campaign with its governments relabelled; no surviving Prothean ship specification is claimed as established lore.',
  historyChanges: ['The Protheans win a conventional survival campaign in their own cycle.', 'Their empire and its subject civilizations remain politically contested after the harvest is broken.', 'Future Reaper encounters are counterfactual battle scenarios; Prothean hardware and performance are AU estimates.'],
  factionOverrides: { prothean: { massAcceleratorDamage: 1.2, beamDamage: 1.25, kineticBarrierStrength: 1.25, sensors: 1.2 } },
  strategic: { ...CANON_STRATEGIC, conventionalVictoryPossible: true, crucibleAvailable: false, shepardAlive: false, shepardEffectiveness: 0 },
};

export const PAST_CYCLES: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'past_cycles', name: 'Past Cycles — Lost Civilizations', category: 'au', family: 'historical_au', preferredFaction: 'past_cycle', campaignCompatible: false,
  tagline: 'Generate a civilization, its doctrine and the fleet that faced the harvest.',
  description: 'An explicitly invented past-cycle sandbox using original estimated hulls. A seeded civilization can supply identity, political choices, fleet composition and per-fleet technology. The seed changes a declared simulation setup, not the trilogy’s account of any unnamed civilization. It launches battles rather than silently replacing the 2186 campaign.',
  historyChanges: ['An original civilization is created for a prior harvest cycle.', 'Its political structure, armament and fleet strength are authored or seeded AU estimates.', 'Reaper capabilities remain those of the selected battle rules; past history does not guarantee survival.'],
  strategic: { ...CANON_STRATEGIC, crucibleAvailable: false, shepardAlive: false, shepardEffectiveness: 0 },
};

export const PLAYER_CIVILIZATION: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'player_civilization', name: 'Player Civilization — Founding Charter', category: 'au', family: 'human_au', preferredFaction: 'player_civ', campaignCompatible: false,
  tagline: 'A persistent polity, the ships it builds and the consequences it chooses.',
  description: 'A player-authored civilization with an origin, government, ethics and fleet doctrine. Monthly industry, research and political choices affect a real inventory and explicit per-fleet technology; combat casualties return to that inventory. This compact layer is separate from the 2186 galactic campaign.',
  historyChanges: ['An original civilization is founded with a seeded identity and a bounded starting fleet.', 'Political legitimacy, stability and cooperation affect resource output and fleet effectiveness.', 'Ship construction, research and battle losses persist; hardware and all conversions are declared AU estimates.'],
  strategic: { ...CANON_STRATEGIC, crucibleAvailable: false, shepardAlive: false, shepardEffectiveness: 0 },
};

export const HFY_TERRAN_ASCENDANCY: RuleSet = {
  ...cloneRules(CANON_ME3),
  id: 'hfy_terran_ascendancy', name: 'HFY — Terran Ascendancy', category: 'au', family: 'hfy', preferredFaction: 'alliance',
  tagline: 'Deliberate power fantasy: humanity can overwhelm the harvest.',
  description: 'A clearly labelled HFY power fantasy, intentionally beyond the challenge calibration of the ordinary AUs. Humanity combines massive industry, mature hyper-mass accelerators, internal HADES warheads and unusually hardened defences. Reaper statistics are unchanged; the point of this branch is to let a prepared human fleet become the dominant encounter.',
  historyChanges: ['DELIBERATE HFY POWER FANTASY: human industry and military technology far exceed the ordinary AU branches.', 'Hyper-mass accelerators, HADES and mature countermeasures reach human fleets at scale.', 'These are authored AU multipliers, not canonical human feats or a balanced difficulty preset.'],
  factionOverrides: {
    alliance: { massAcceleratorDamage: 5, massAcceleratorPenetration: 3, massAcceleratorRange: 1.6, fireRate: 1.8, heatCapacity: 3, kineticBarrierStrength: 5, barrierRegen: 3, armourStrength: 4, hullIntegrity: 3, speed: 1.3, sensors: 2.5, electronicWarfare: 2, accuracy: 1.3, crewQuality: 1.6 },
    cerberus: { massAcceleratorDamage: 4, massAcceleratorPenetration: 2.5, heatCapacity: 2.5, kineticBarrierStrength: 4, armourStrength: 3, hullIntegrity: 2.5, sensors: 2, electronicWarfare: 2 },
  },
  special: { ...CANON_SPECIAL, hyperMassAccelerators: true, hadesRounds: true, thanixAvailability: 'fleetwide', reaperCommandVulnerability: true, indoctrinationDisabled: true },
  fleetStrength: { ...CANON_FLEETS, alliance: 3, cerberus: 2 },
  strategic: { ...CANON_STRATEGIC, alliedCoordination: 0.95, illusiveManIndoctrinated: false, cerberusStance: 'cooperative', conventionalVictoryPossible: true, homeworldIndependence: true, indoctrinationEffectiveness: 0 },
};

/** Custom timelines start as a copy of the balanced canon calibration. */
export const makeCustom = (): RuleSet => {
  const r = cloneRules(CANON_ME3);
  r.id = 'custom';
  r.name = 'Custom Timeline';
  r.tagline = 'Your rules.';
  r.category = 'custom';
  r.description = 'A player-authored rule set. Starts identical to canon.';
  return r;
};

export const PRESETS: RuleSet[] = [
  CANON_ME3,
  STRICT_LORE,
  MULTIVERSE_CROSSOVER,
  PREPARED_GALAXY,
  HUMANITY_ASCENDANT,
  CERBERUS_REFORMED,
  REAPER_ESCALATION,
  PRIME_APEX,
  CERBERUS_ASCENDANT,
  ALIGNED_HUMANITY,
  IRON_DAWN,
  BEACON_1800,
  RELAY_FREE_HUMANITY,
  PROTHEAN_VICTORY,
  PAST_CYCLES,
  PLAYER_CIVILIZATION,
  HFY_TERRAN_ASCENDANCY,
];

export const getPreset = (id: string): RuleSet => {
  const p = PRESETS.find((x) => x.id === id);
  if (!p) {
    if (id === 'custom') return makeCustom();
    throw new Error(`Unknown timeline preset ${id}`);
  }
  return cloneRules(p);
};
