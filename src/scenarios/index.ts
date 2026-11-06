import { v3, type Vec3 } from '@/core/vec3';
import { EXPANDED_BATTLES } from './expandedBattles';
import { getPreset } from '@/timelines/presets';
import { TECH_KEYS, type RuleSet, type TechModifiers } from '@/timelines/rules';
import { TECH_RANGE } from '@/timelines/schema';
import { isCrossoverFaction, isMassEffectFaction, type FactionId } from '@/data/types';
import { assertLoreCompatible, isShipAllowedInRules } from '@/timelines/lore';
import type { BattleConfig, Environment, FleetSpec, FormationType, ShipSpec, Side } from '@/simulation/types';
import { SHIP_CLASSES } from '@/data/ships';
import { FACTIONS } from '@/data/factions';

/**
 * Battle scenarios. Each scenario builds a BattleConfig from a rule set and a
 * seed. Fleet sizes marked SIMULATION_ESTIMATE are compressed representations
 * of much larger canon engagements so that the battle is watchable.
 */

export interface WorldStateOption {
  id: string;
  label: string;
  /** Provenance category for the UI. */
  kind: 'player_dependent' | 'extrapolation' | 'au';
  description: string;
  choices: { id: string; label: string; description: string }[];
  default: string;
}

export interface ScenarioDef {
  id: string;
  name: string;
  subtitle: string;
  environment: Environment;
  description: string;
  /** Which timelines this scenario is designed for (others still run). */
  recommendedRules: string[];
  /** Scenario is only meaningful in AU timelines. */
  auOnly?: boolean;
  worldState?: WorldStateOption[];
  objective: string;
  maxDuration: number;
  build: (rules: RuleSet, seed: number, worldState: Record<string, string>) => BattleConfig;
  /** Short lore note displayed in the briefing. */
  briefing: string[];
}

/**
 * World-state key that controls whether scenario fleets scale with the rule
 * set's fleetStrength. Comparison mode fixes fleets so only technology and
 * doctrine differ between the two runs.
 */
export const FLEET_SCALING_KEY = 'fleet_scaling';

const ALLIANCE_DN_NAMES = ['SSV Kilimanjaro', 'SSV Orizaba', 'SSV Fuji', 'SSV Elbrus', 'SSV Aconcagua', 'SSV Logan', 'SSV Tai Shan', 'SSV Shasta', 'SSV Everest', 'SSV Denali'];
const ALLIANCE_CRUISER_NAMES = ['SSV Emden', 'SSV Geneva', 'SSV Warsaw', 'SSV Cairo', 'SSV Madrid', 'SSV Shanghai', 'SSV Cape Town', 'SSV Jakarta', 'SSV Hastings', 'SSV Agincourt', 'SSV Trafalgar', 'SSV Midway', 'SSV Leyte', 'SSV Jutland', 'SSV Salamis', 'SSV Lepanto'];
const ALLIANCE_FRIGATE_NAMES = ['SSV Hong Kong', 'SSV Iwo Jima', 'SSV Cheyenne', 'SSV Agamemnon', 'SSV Achilles', 'SSV Perugia', 'SSV Hyderabad', 'SSV Trident', 'SSV Lexington', 'SSV Saratoga'];
const TURIAN_DN_NAMES = ['PFS Indomitable', 'PFS Vengeance', 'PFS Cipritine', 'PFS Digeris', 'PFS Taetrus', 'PFS Invictus', 'PFS Macedyn', 'PFS Oma Ker'];
const TURIAN_CRUISER_NAMES = ['PFS Resolute', 'PFS Steadfast', 'PFS Unyielding', 'PFS Adamant', 'PFS Vigilant', 'PFS Relentless', 'PFS Spirit of Menae', 'PFS Bastion', 'PFS Rampart', 'PFS Ardent', 'PFS Stalwart', 'PFS Tenacious'];
const ASARI_DN_NAMES = ['Cyone', 'Serrice Guard', 'Armali', 'Lusia'];
const ASARI_CRUISER_NAMES = ['Tevura', 'Athame', 'Lucen', 'Piares', 'Nevos', 'Dilinaga', 'Anthea', 'Illium Dawn', 'Thessia Star', 'Nos Astra', 'Sanves', 'Niacal'];
const CERBERUS_NAMES = ['Minuteman', 'Cronos', 'Elbrus', 'Horizon', 'Sanctum', 'Covenant', 'Lazarus', 'Overlord', 'Firewalker', 'Arrival'];

/** Canonical name lists by class (names are original where canon gives none). */
const NAMES: Record<string, string[]> = {
  alliance_dreadnought: ALLIANCE_DN_NAMES,
  alliance_cruiser: ALLIANCE_CRUISER_NAMES,
  alliance_frigate: ALLIANCE_FRIGATE_NAMES,
  alliance_carrier: ['SSV Einstein', 'SSV Hawking', 'SSV Newton'],
  alliance_frigate_thanix: ['SSV Normandy SR-2'],
  turian_dreadnought: TURIAN_DN_NAMES,
  turian_cruiser: TURIAN_CRUISER_NAMES,
  asari_dreadnought: ASARI_DN_NAMES,
  asari_cruiser: ASARI_CRUISER_NAMES,
  destiny_ascension: ['Destiny Ascension'],
  salarian_dreadnought: ['Sur’Kesh', 'Mannovai', 'Jaëto', 'Erinle'],
  salarian_cruiser: ['Talat', 'Nasurn', 'Aegohr', 'Halegeuse', 'Gorot', 'Heshtok', 'Dagnes', 'Senoquol', 'Tuchanka Watch', 'Kirrahe', 'Virmire', 'Solus'],
  salarian_frigate: ['STG Scalpel', 'STG Needle', 'STG Lancet', 'STG Quill', 'STG Thorn', 'STG Barb', 'STG Sliver', 'STG Spine', 'STG Awl', 'STG Stylus'],
  cerberus_cruiser: CERBERUS_NAMES,
  cerberus_dreadnought: ['Black Fleet Flagship Prometheus'],
  harbinger: ['Harbinger'],
  quarian_liveship: ['Rayya', 'Shellen', 'Tonbay'],
  quarian_heavy: ['Qwib-Qwib', 'Alarei', 'Neema', 'Idenna', 'Moreh', 'Iktomi'],
  quarian_cruiser: ['Usela', 'Tesleya', 'Chayym', 'Defrahnz', 'Honorata', 'Konesh', 'Rannoch Hope', 'Tasi', 'Ulnay', 'Yaska'],
  geth_dreadnought: ['Geth dreadnought'],
};

/** Scale a ship count by a fleet strength multiplier, never below 1 if the base was >= 1. */
export const scaleCount = (base: number, mult: number): number => (base <= 0 ? 0 : Math.max(1, Math.round(base * mult)));

const fleetMult = (rules: RuleSet, faction: FactionId, ws: Record<string, string>): number =>
  ws[FLEET_SCALING_KEY] === 'fixed' || !isMassEffectFaction(faction) ? 1 : rules.fleetStrength[faction];

export interface FleetOpts {
  /** Ship counts by class id (before scaling). */
  counts: Record<string, number>;
  /** Classes that do not scale with fleet strength (named single ships). */
  fixedClasses?: string[];
  name: string;
  side?: Side;
  formation?: FormationType;
  position?: Vec3;
  heading?: Vec3;
  mult?: number;
  arrivalTime?: number;
  playerControlled?: boolean;
  ws?: Record<string, string>;
  initialOrder?: FleetSpec['initialOrder'];
  techOverride?: Partial<TechModifiers>;
}

/** Generic fleet builder for any faction. */
export function fleet(id: string, faction: FactionId, rules: RuleSet, opts: FleetOpts): FleetSpec {
  const m = opts.mult ?? fleetMult(rules, faction, opts.ws ?? {});
  const ships: ShipSpec[] = [];
  for (const [classId, base] of Object.entries(opts.counts)) {
    if (base <= 0) continue;
    if (rules.strictLore && SHIP_CLASSES[classId] && !isShipAllowedInRules(SHIP_CLASSES[classId], rules)) continue;
    const fixed = opts.fixedClasses?.includes(classId);
    // Carriers scale more conservatively than the line.
    const mult = fixed ? 1 : classId.endsWith('carrier') ? Math.min(m, 1.5) : m;
    const count = scaleCount(base, mult);
    ships.push({ classId, count, names: NAMES[classId] });
  }
  const side = opts.side ?? (faction === 'reaper' ? 'B' : 'A');
  return {
    id,
    name: opts.name,
    faction,
    side,
    ships,
    formation: opts.formation ?? (faction === 'reaper' ? 'strike_wedge' : 'defensive_screen'),
    position: opts.position ?? (side === 'A' ? v3(0, 0, -36) : v3(0, 0, 40)),
    heading: opts.heading ?? (side === 'A' ? v3(0, 0, 1) : v3(0, 0, -1)),
    playerControlled: opts.playerControlled ?? side === 'A',
    arrivalTime: opts.arrivalTime,
    initialOrder: opts.initialOrder,
    techOverride: opts.techOverride,
  };
}

const reaperFleet = (id: string, rules: RuleSet, opts: { capitals: number; destroyers: number; harbinger?: boolean; name?: string; side?: Side; position?: Vec3; heading?: Vec3; arrivalTime?: number; mult?: number; ws?: Record<string, string>; formation?: FormationType }): FleetSpec =>
  fleet(id, 'reaper', rules, {
    counts: { ...(opts.harbinger ? { harbinger: 1 } : {}), reaper_capital: opts.capitals, reaper_destroyer: opts.destroyers },
    fixedClasses: ['harbinger'],
    name: opts.name ?? 'Reaper harvest group',
    side: opts.side,
    position: opts.position,
    heading: opts.heading,
    arrivalTime: opts.arrivalTime,
    mult: opts.mult,
    ws: opts.ws,
    formation: opts.formation,
    playerControlled: opts.side === 'A',
  });

const SHEPARD_WORLD_STATE: WorldStateOption = {
  id: 'normandy',
  label: 'Normandy SR-2 present',
  kind: 'player_dependent',
  description: 'Whether Shepard’s Normandy takes part in the engagement.',
  choices: [
    { id: 'yes', label: 'Normandy present', description: 'The Normandy SR-2 joins the fleet with its Thanix cannon.' },
    { id: 'no', label: 'Normandy absent', description: 'The Normandy is elsewhere.' },
  ],
  default: 'yes',
};

const base = (id: string, name: string, scenarioId: string, seed: number, rules: RuleSet, environment: Environment, maxDuration: number, objective: string, ws: Record<string, string>, fleets: FleetSpec[]): BattleConfig => ({
  id: `${id}-${rules.id}-${seed}`,
  name,
  scenarioId,
  alternateHistory: SCENARIOS.some(s => s.id === scenarioId && s.auOnly),
  seed,
  rules,
  environment,
  maxDuration,
  perspectiveSide: 'A',
  objective,
  worldState: ws,
  fleets,
});

export const SCENARIOS: ScenarioDef[] = [
  {
    id: 'battle_of_earth',
    name: 'Battle of Earth',
    subtitle: 'Sol system, 2186 — Reaper invasion of Earth',
    environment: 'earth_orbit',
    description:
      'The Reapers arrive through the Charon relay and overwhelm Arcturus Station before falling on Earth. Alliance fleets in Sol orbit attempt to hold long enough for the evacuation. In canon the Alliance is forced to withdraw; this is the simulator’s vertical-slice engagement.',
    recommendedRules: ['canon_me3', 'prime_apex'],
    objective: 'Hold Earth orbit: destroy or drive off the Reaper harvest group.',
    maxDuration: 420,
    worldState: [
      SHEPARD_WORLD_STATE,
      {
        id: 'fleet_commitment',
        label: 'Alliance fleet commitment',
        kind: 'extrapolation',
        description: 'How much of the home fleet is in Sol when the Reapers arrive (canon does not give numbers).',
        choices: [
          { id: 'standard', label: 'Home fleet elements', description: '6 dreadnoughts, 1 carrier, 14 cruisers, 24 frigates.' },
          { id: 'heavy', label: 'Fleet concentration', description: '8 dreadnoughts, 2 carriers, 18 cruisers, 30 frigates.' },
          { id: 'light', label: 'Dispersed fleet', description: '4 dreadnoughts, 1 carrier, 10 cruisers, 18 frigates.' },
        ],
        default: 'standard',
      },
    ],
    briefing: [
      'Reaper forces have entered Sol in strength. Arcturus Station is lost.',
      'Fleet command intends to delay the harvest group in low Earth orbit while evacuation transports clear the gravity well.',
      'Reaper capital ships cannot be engaged in the open on equal terms. Concentrate fire; protect the dreadnoughts.',
    ],
    build: (rules, seed, ws) => {
      const commitment = ws.fleet_commitment ?? 'standard';
      const c = commitment === 'heavy' ? { alliance_dreadnought: 8, alliance_carrier: 2, alliance_cruiser: 18, alliance_frigate: 30 } : commitment === 'light' ? { alliance_dreadnought: 4, alliance_carrier: 1, alliance_cruiser: 10, alliance_frigate: 18 } : { alliance_dreadnought: 6, alliance_carrier: 1, alliance_cruiser: 14, alliance_frigate: 24 };
      return base('battle_of_earth', 'Battle of Earth', 'battle_of_earth', seed, rules, 'earth_orbit', 420, 'Hold Earth orbit against the Reaper harvest group.', ws, [
        fleet('alliance-5th', 'alliance', rules, { counts: { ...c, alliance_frigate_thanix: (ws.normandy ?? 'yes') === 'yes' ? 1 : 0 }, fixedClasses: ['alliance_frigate_thanix'], name: 'Alliance Fifth Fleet', position: v3(0, 0, -34), ws }),
        reaperFleet('reaper-sol', rules, { capitals: 3, destroyers: 7, position: v3(6, 2, 46), heading: v3(-0.12, 0, -1), ws }),
        reaperFleet('reaper-sol-2', rules, { capitals: 1, destroyers: 3, position: v3(-40, -3, 70), heading: v3(0.4, 0, -1), arrivalTime: 55, name: 'Reaper second wave', ws }),
      ]);
    },
  },
  {
    id: 'defence_of_palaven',
    name: 'Defence of Palaven',
    subtitle: 'Trebia system, 2186 — the Hierarchy holds the line over Menae',
    environment: 'palaven_orbit',
    description:
      'Palaven is under full Reaper assault. The Hierarchy’s fleets fight in orbit while ground forces hold on the moon Menae. Turian doctrine: rigid formations, aggressive closure, dreadnought line.',
    recommendedRules: ['canon_me3', 'prime_apex', 'prepared_galaxy'],
    objective: 'Break the Reaper assault group over Menae.',
    maxDuration: 420,
    worldState: [
      {
        id: 'alliance_support',
        label: 'Alliance detachment',
        kind: 'extrapolation',
        description: 'Whether an Alliance cruiser group reinforces the Hierarchy (not established in canon).',
        choices: [
          { id: 'none', label: 'Hierarchy alone', description: 'No allied ships.' },
          { id: 'cruisers', label: 'Alliance cruiser group', description: '4 cruisers and 8 frigates arrive at T+60s.' },
        ],
        default: 'none',
      },
    ],
    briefing: [
      'Palaven burns. Primarch Fedorian is dead; the fleets answer to Menae command.',
      'Hierarchy dreadnoughts will form line and close. Cruisers screen, frigates hunt destroyers.',
      'Under Prime/Apex rules the Homeworld Defence Rule applies: the Hierarchy can hold Palaven unaided.',
    ],
    build: (rules, seed, ws) => {
      const fleets = [
        fleet('hierarchy-palaven', 'turian', rules, { counts: { turian_dreadnought: 7, turian_cruiser: 14, turian_frigate: 22 }, name: 'Hierarchy Palaven Fleet', formation: 'line_abreast', position: v3(0, 0, -34), ws }),
        reaperFleet('reaper-trebia', rules, { capitals: 3, destroyers: 8, position: v3(0, 0, 44), ws }),
        reaperFleet('reaper-trebia-2', rules, { capitals: 1, destroyers: 4, position: v3(42, 0, 66), heading: v3(-0.4, 0, -1), arrivalTime: 70, name: 'Reaper flanking group', ws }),
      ];
      if (ws.alliance_support === 'cruisers') fleets.push(fleet('alliance-detachment', 'alliance', rules, { counts: { alliance_cruiser: 4, alliance_frigate: 8 }, name: 'Alliance detachment', position: v3(-30, 0, -50), heading: v3(0.3, 0, 1), arrivalTime: 60, mult: 1 }));
      return base('defence_of_palaven', 'Defence of Palaven', 'defence_of_palaven', seed, rules, 'palaven_orbit', 420, 'Break the Reaper assault group over Menae.', ws, fleets);
    },
  },
  {
    id: 'fall_of_thessia',
    name: 'Fall of Thessia',
    subtitle: 'Athena Nebula, 2186 — the Republics resist the harvest',
    environment: 'thessia_orbit',
    description:
      'The asari homeworld, thought untouchable, is attacked in force. Republic dreadnoughts and cruisers fight at range with superior barriers but thinner plating. In canon Thessia falls.',
    recommendedRules: ['canon_me3', 'prepared_galaxy', 'prime_apex'],
    objective: 'Hold Thessia orbit long enough to evacuate the capital.',
    maxDuration: 420,
    worldState: [
      {
        id: 'ascension',
        label: 'Destiny Ascension',
        kind: 'player_dependent',
        description: 'Whether the Destiny Ascension survived the Battle of the Citadel in 2183 and is present.',
        choices: [
          { id: 'present', label: 'Ascension saved, present', description: 'The flagship anchors the defence.' },
          { id: 'absent', label: 'Ascension lost or elsewhere', description: 'No flagship.' },
        ],
        default: 'present',
      },
    ],
    briefing: [
      'Reaper forces have entered the Athena Nebula. The Republics’ councillors withheld the warning.',
      'Asari doctrine: engage at maximum range, keep the dreadnoughts covered, withdraw damaged hulls early.',
      'The Destiny Ascension, if present, carries the heaviest gun in Citadel space.',
    ],
    build: (rules, seed, ws) =>
      base('fall_of_thessia', 'Fall of Thessia', 'fall_of_thessia', seed, rules, 'thessia_orbit', 420, 'Hold Thessia orbit long enough to evacuate the capital.', ws, [
        fleet('republics-thessia', 'asari', rules, { counts: { destiny_ascension: ws.ascension === 'absent' ? 0 : 1, asari_dreadnought: 4, asari_cruiser: 20 }, fixedClasses: ['destiny_ascension'], name: 'Republics Home Fleet', formation: 'defensive_screen', position: v3(0, 0, -36), ws }),
        reaperFleet('reaper-athena', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 46), ws }),
      ]),
  },
  {
    id: 'defence_of_surkesh',
    name: 'Defence of Sur’Kesh',
    subtitle: 'Annos Basin, 2186 — a Reaper raid reaches the salarian homeworld',
    environment: 'surkesh_orbit',
    description:
      'In the game’s timeframe Sur’Kesh is spared a full assault; this engagement is a simulation estimate of a Reaper raiding group reaching the Annos Basin. The Union’s Third Fleet fights the way salarians fight: on sensors, electronic warfare and precise fire, with STG stealth frigates pressing torpedo runs from outside the Reapers’ targeting envelope.',
    recommendedRules: ['canon_me3', 'prepared_galaxy', 'prime_apex'],
    objective: 'Repel the raid before it reaches low orbit.',
    maxDuration: 420,
    worldState: [
      {
        id: 'stg_warning',
        label: 'STG early warning',
        kind: 'extrapolation',
        description: 'How much notice the Special Tasks Group gives the fleet.',
        choices: [
          { id: 'early', label: 'Early warning', description: 'The fleet is deployed in depth; the Reaper flanking group arrives late.' },
          { id: 'late', label: 'Late warning', description: 'The flanking group arrives almost at once, from the flank.' },
        ],
        default: 'early',
      },
    ],
    briefing: [
      'STG reconnaissance has tracked a Reaper raiding group through the relay. The Third Fleet holds high orbit.',
      'Union doctrine: fight at range on sensor data, kill the identified threat first, withdraw hulls before they are lost.',
      'The scenario is not a canon event; it is labelled a simulation estimate.',
    ],
    build: (rules, seed, ws) => {
      const early = (ws.stg_warning ?? 'early') === 'early';
      return base('defence_of_surkesh', 'Defence of Sur’Kesh', 'defence_of_surkesh', seed, rules, 'surkesh_orbit', 420, 'Repel the raid before it reaches low orbit.', ws, [
        fleet('union-third', 'salarian', rules, { counts: { salarian_dreadnought: 2, salarian_cruiser: 10, salarian_frigate: 16 }, name: 'Salarian Third Fleet', formation: early ? 'line_abreast' : 'defensive_screen', position: v3(0, 0, -34), ws }),
        reaperFleet('reaper-annos', rules, { capitals: 3, destroyers: 8, position: v3(0, 0, 44), ws }),
        reaperFleet('reaper-annos-2', rules, { capitals: 1, destroyers: 4, position: early ? v3(-40, 0, 70) : v3(50, 0, 20), heading: early ? v3(0.3, 0, -1) : v3(-1, 0, -0.3), arrivalTime: early ? 90 : 25, name: 'Reaper flanking group', ws }),
      ]);
    },
  },
  {
    id: 'cerberus_intervention',
    name: 'Cerberus Intervention',
    subtitle: 'Horsehead Nebula, 2186 — Cerberus fleet meets an Alliance task force',
    environment: 'deep_space',
    description:
      'In canon Cerberus is a hostile faction: a Cerberus strike fleet ambushes an Alliance task force near a Cerberus facility. In timelines where the Illusive Man is not indoctrinated and Cerberus cooperates, the same two fleets instead fight together against a Reaper group.',
    recommendedRules: ['canon_me3', 'cerberus_reformed', 'prime_apex'],
    objective: 'Canon: defeat the Cerberus fleet. Cooperative AU: defeat the Reaper group together.',
    maxDuration: 360,
    worldState: [SHEPARD_WORLD_STATE],
    briefing: [
      'Cerberus activity confirmed. Fleet composition: cruisers, frigates, fighters; black, white and orange identification.',
      'The timeline’s Cerberus stance decides the engagement: hostile in canon; cooperative in Cerberus Reformed and Prime/Apex.',
    ],
    build: (rules, seed, ws) => {
      const cooperative = rules.strategic.cerberusStance === 'cooperative' || rules.strategic.cerberusStance === 'controls_reapers';
      const alliance = fleet('alliance-tf', 'alliance', rules, { counts: { alliance_dreadnought: 2, alliance_cruiser: 8, alliance_frigate: 14, alliance_frigate_thanix: (ws.normandy ?? 'yes') === 'yes' ? 1 : 0 }, fixedClasses: ['alliance_frigate_thanix'], name: 'Alliance task force', position: v3(0, 0, -34), formation: 'line_abreast', ws });
      if (!cooperative) {
        return base('cerberus_intervention', 'Cerberus Intervention', 'cerberus_intervention', seed, rules, 'deep_space', 360, 'Defeat the Cerberus strike fleet.', ws, [
          alliance,
          fleet('cerberus-strike', 'cerberus', rules, { counts: { cerberus_cruiser: 10, cerberus_frigate: 16 }, name: 'Cerberus strike fleet', side: 'B', position: v3(0, 0, 36), heading: v3(0, 0, -1), formation: 'strike_wedge', ws }),
        ]);
      }
      return base('cerberus_intervention', 'Cerberus Intervention (cooperative)', 'cerberus_intervention', seed, rules, 'deep_space', 360, 'Defeat the Reaper group with Cerberus support.', ws, [
        alliance,
        fleet('cerberus-black', 'cerberus', rules, { counts: { cerberus_dreadnought: rules.id === 'prime_apex' ? 2 : 0, cerberus_cruiser: 8, cerberus_frigate: 12 }, name: rules.id === 'prime_apex' ? 'Cerberus Black Fleet' : 'Cerberus expeditionary fleet', position: v3(34, 0, -40), heading: v3(-0.2, 0, 1), formation: 'strike_wedge', ws }),
        reaperFleet('reaper-horsehead', rules, { capitals: 2, destroyers: 6, position: v3(10, 0, 44), ws }),
      ]);
    },
  },
  {
    id: 'rannoch_campaign',
    name: 'Rannoch Campaign',
    subtitle: 'Tikkun system, 2186 — the Migrant Fleet and the geth',
    environment: 'rannoch_orbit',
    description:
      'The quarians attack the geth over Rannoch while the geth, upgraded with Reaper code, counter-attack. How the conflict ends is a player-dependent ME3 outcome: war, or a peace that turns both fleets on the Reapers.',
    recommendedRules: ['canon_me3', 'prime_apex'],
    objective: 'War: protect the liveships and defeat the geth fleet. Peace: defend Rannoch against the Reapers.',
    maxDuration: 420,
    worldState: [
      {
        id: 'outcome',
        label: 'Geth–quarian outcome',
        kind: 'player_dependent',
        description: 'The state of the Rannoch conflict when this battle is fought.',
        choices: [
          { id: 'war', label: 'War: Migrant Fleet vs Reaper-upgraded geth', description: 'The geth fight with Reaper upgrades (+40 % barriers, +20 % accuracy, better crews). Protect the liveships.' },
          { id: 'war_unupgraded', label: 'War: geth without Reaper upgrades', description: 'The Reaper signal is cut; geth fight at baseline capability.' },
          { id: 'peace', label: 'Peace: geth and quarians vs Reapers', description: 'Both fleets under joint command face a Reaper group.' },
        ],
        default: 'war',
      },
    ],
    briefing: [
      'The Migrant Fleet has committed its Heavy and Patrol Fleets. The liveships are in orbit and must not be lost.',
      'Geth fleets under Reaper influence fight with inhuman coordination.',
      'Admiral Koris’ Civilian Fleet is not present in this engagement.',
    ],
    build: (rules, seed, ws) => {
      const outcome = ws.outcome ?? 'war';
      if (outcome === 'peace') {
        return base('rannoch_campaign', 'Rannoch — United Fleet', 'rannoch_campaign', seed, rules, 'rannoch_orbit', 420, 'Defend Rannoch against the Reapers.', ws, [
          fleet('migrant-fleet', 'quarian', rules, { counts: { quarian_liveship: 1, quarian_heavy: 3, quarian_cruiser: 12 }, fixedClasses: ['quarian_liveship'], name: 'Migrant Fleet', position: v3(-18, 0, -36), formation: 'defensive_screen', ws }),
          fleet('geth-fleet', 'geth', rules, { counts: { geth_dreadnought: 1, geth_cruiser: 8, geth_frigate: 12 }, fixedClasses: ['geth_dreadnought'], name: 'Geth Consensus fleet', position: v3(22, 0, -34), formation: 'strike_wedge', ws }),
          reaperFleet('reaper-tikkun', rules, { capitals: 3, destroyers: 8, position: v3(0, 0, 44), ws }),
        ]);
      }
      const upgraded = outcome === 'war';
      return base('rannoch_campaign', upgraded ? 'Rannoch — Migrant Fleet vs upgraded geth' : 'Rannoch — Migrant Fleet vs geth', 'rannoch_campaign', seed, rules, 'rannoch_orbit', 420, 'Protect the liveships and defeat the geth fleet.', ws, [
        fleet('migrant-fleet', 'quarian', rules, { counts: { quarian_liveship: 2, quarian_heavy: 4, quarian_cruiser: 18 }, fixedClasses: ['quarian_liveship'], name: 'Migrant Fleet (Heavy and Patrol Fleets)', position: v3(0, 0, -36), formation: 'defensive_screen', ws }),
        {
          ...fleet('geth-fleet', 'geth', rules, { counts: { geth_dreadnought: 1, geth_cruiser: 14, geth_frigate: 22 }, fixedClasses: ['geth_dreadnought'], name: upgraded ? 'Reaper-upgraded geth fleet' : 'Geth fleet', side: 'B', position: v3(0, 0, 40), heading: v3(0, 0, -1), formation: 'strike_wedge', ws }),
          techOverride: upgraded ? { kineticBarrierStrength: 1.4, accuracy: 1.2, crewQuality: 1.2, barrierRegen: 1.4, massAcceleratorDamage: 1.15 } : undefined,
        },
      ]);
    },
  },
  {
    id: 'battle_of_the_citadel',
    name: 'Battle of the Citadel',
    subtitle: 'Serpent Nebula, 2183 — Sovereign and the geth attack the Citadel',
    environment: 'citadel',
    description:
      'Three years before the Reaper War: Sovereign arrives with a geth fleet while the Citadel fleet, the Destiny Ascension and the Alliance Fifth Fleet engage. In canon Sovereign’s barriers fall only when Saren dies; here the fleet must bring it down conventionally while deciding whether to save the Ascension.',
    recommendedRules: ['canon_me3', 'prepared_galaxy'],
    objective: 'Destroy Sovereign and its geth escort.',
    maxDuration: 420,
    worldState: [
      {
        id: 'ascension',
        label: 'Alliance priority',
        kind: 'player_dependent',
        description: 'Shepard’s choice: send the Alliance fleet to save the Destiny Ascension or concentrate on Sovereign.',
        choices: [
          { id: 'save', label: 'Save the Destiny Ascension', description: 'The Ascension is present and the Alliance fleet protects it.' },
          { id: 'sovereign', label: 'Concentrate on Sovereign', description: 'The Ascension is lost before the Alliance arrives.' },
        ],
        default: 'save',
      },
    ],
    briefing: [
      'The Citadel’s arms are closing. Sovereign has docked with the Tower; its geth escort holds the approaches.',
      'Citadel Fleet (turian and asari) is engaged. The Alliance Fifth Fleet is arriving through the relay.',
      'Sovereign is a single capital Reaper: its barriers will absorb everything until they are overwhelmed.',
    ],
    build: (rules, seed, ws) => {
      const save = (ws.ascension ?? 'save') === 'save';
      return base('battle_of_the_citadel', 'Battle of the Citadel', 'battle_of_the_citadel', seed, rules, 'citadel', 420, 'Destroy Sovereign and its geth escort.', ws, [
        fleet('citadel-fleet', 'turian', rules, { counts: { turian_dreadnought: 3, turian_cruiser: 10, turian_frigate: 14 }, name: 'Citadel Fleet (Hierarchy)', position: v3(-16, 0, -34), formation: 'line_abreast', ws }),
        fleet('republics-guard', 'asari', rules, { counts: { destiny_ascension: save ? 1 : 0, asari_cruiser: 6 }, fixedClasses: ['destiny_ascension'], name: 'Citadel Fleet (Republics)', position: v3(18, 0, -40), formation: 'defensive_screen', ws }),
        fleet('alliance-5th', 'alliance', rules, { counts: { alliance_dreadnought: 3, alliance_cruiser: 10, alliance_frigate: 16, alliance_frigate_thanix: 0 }, name: 'Alliance Fifth Fleet', position: v3(0, 6, -70), formation: 'strike_wedge', arrivalTime: 40, initialOrder: save ? { order: 'escort', targetId: 'republics-guard-destiny_ascension-1', protectCapitals: true } : undefined, ws } as FleetOpts),
        {
          ...reaperFleet('sovereign', rules, { capitals: 1, destroyers: 0, name: 'Sovereign', position: v3(0, 0, 46), mult: 1, formation: 'capital_column' }),
          ships: [{ classId: 'reaper_capital', count: 1, names: ['Sovereign'] }],
        },
        fleet('geth-escort', 'geth', rules, { counts: { geth_dreadnought: 2, geth_cruiser: 14, geth_frigate: 22 }, name: 'Geth escort fleet', side: 'B', position: v3(0, 0, 36), heading: v3(0, 0, -1), formation: 'defensive_screen', ws }),
      ]);
    },
  },
  {
    id: 'final_battle_of_earth',
    name: 'Final Battle of Earth',
    subtitle: 'Sol, 2186 — the combined fleets return for the Crucible',
    environment: 'earth_orbit',
    description:
      'Every fleet the galaxy can still field returns to Earth to clear the Reaper blockade for the Crucible. When a campaign is in progress its surviving allied fleets and the Reapers’ remaining strength set the forces; otherwise the canon-shaped combined fleet faces Harbinger’s armada.',
    recommendedRules: ['canon_me3', 'prime_apex', 'prepared_galaxy'],
    objective: 'Break the Reaper blockade of Earth.',
    maxDuration: 540,
    worldState: [
      {
        id: 'forces',
        label: 'Order of battle',
        kind: 'extrapolation',
        description: 'Use the current campaign’s fleets, or the default combined fleet.',
        choices: [
          { id: 'campaign', label: 'From campaign (if one is saved)', description: 'Surviving allied fleets vs remaining Reaper fleets.' },
          { id: 'default', label: 'Default combined fleet', description: 'Alliance, Hierarchy, Republics, Migrant Fleet and geth vs Harbinger’s armada.' },
        ],
        default: 'campaign',
      },
      {
        id: 'genophage',
        label: 'Genophage cure',
        kind: 'player_dependent',
        description: 'In canon the Dalatrass commits the Salarian First Fleet only if Shepard sabotages the cure.',
        choices: [
          { id: 'cured', label: 'Cure deployed', description: 'No salarian fleet joins Sword (krogan ground forces instead, not modelled here).' },
          { id: 'sabotaged', label: 'Cure sabotaged', description: 'The Salarian First Fleet joins the default combined fleet.' },
        ],
        default: 'cured',
      },
    ],
    briefing: ['Sword fleet engages the Reapers in orbit while Hammer lands.', 'Harbinger commands the blockade in person.', 'Campaign-linked: fleet strengths follow the saved war when one exists.'],
    build: (rules, seed, ws) => {
      const fleets: FleetSpec[] = [];
      const campaignCounts = ws.campaignAllied ? (JSON.parse(ws.campaignAllied) as { name: string; faction: FactionId; counts: Record<string, number> }[]) : undefined;
      const reaperCounts = ws.campaignReaper ? (JSON.parse(ws.campaignReaper) as Record<string, number>) : undefined;
      if ((ws.forces ?? 'campaign') === 'campaign' && campaignCounts && campaignCounts.length > 0 && reaperCounts) {
        campaignCounts.forEach((f, i) => fleets.push(fleet(`sword-${i}`, f.faction, rules, { counts: f.counts, name: f.name, position: v3(-24 + (i % 4) * 16, 0, -34 - Math.floor(i / 4) * 8), formation: i === 0 ? 'line_abreast' : 'defensive_screen', mult: 1 })));
        fleets.push(fleet('reaper-blockade', 'reaper', rules, { counts: reaperCounts, fixedClasses: ['harbinger'], name: 'Reaper blockade', side: 'B', position: v3(0, 0, 46), heading: v3(0, 0, -1), formation: 'strike_wedge', mult: 1 }));
      } else {
        fleets.push(fleet('sword-alliance', 'alliance', rules, { counts: { alliance_dreadnought: 6, alliance_carrier: 2, alliance_cruiser: 16, alliance_frigate: 24, alliance_frigate_thanix: 1 }, fixedClasses: ['alliance_frigate_thanix'], name: 'Sword Fleet (Alliance)', position: v3(-20, 0, -34), formation: 'line_abreast', ws }));
        fleets.push(fleet('sword-turian', 'turian', rules, { counts: { turian_dreadnought: 5, turian_cruiser: 10, turian_frigate: 16 }, name: 'Sword Fleet (Hierarchy)', position: v3(18, 0, -38), formation: 'line_abreast', ws }));
        fleets.push(fleet('sword-asari', 'asari', rules, { counts: { destiny_ascension: ws.ascension === 'absent' ? 0 : 1, asari_dreadnought: 2, asari_cruiser: 8 }, fixedClasses: ['destiny_ascension'], name: 'Sword Fleet (Republics)', position: v3(0, 4, -48), formation: 'defensive_screen', ws }));
        fleets.push(fleet('sword-quarian', 'quarian', rules, { counts: { quarian_heavy: 3, quarian_cruiser: 10 }, name: 'Migrant Fleet detachment', position: v3(-40, 0, -46), formation: 'defensive_screen', ws }));
        fleets.push(fleet('sword-geth', 'geth', rules, { counts: { geth_dreadnought: 1, geth_cruiser: 8, geth_frigate: 12 }, fixedClasses: ['geth_dreadnought'], name: 'Geth fleet', position: v3(40, 0, -44), formation: 'strike_wedge', ws }));
        if (ws.genophage === 'sabotaged') fleets.push(fleet('sword-salarian', 'salarian', rules, { counts: { salarian_dreadnought: 2, salarian_cruiser: 8, salarian_frigate: 12 }, name: 'Salarian First Fleet', position: v3(0, -6, -56), formation: 'line_abreast', ws }));
        fleets.push(reaperFleet('reaper-blockade', rules, { capitals: 6, destroyers: 14, harbinger: true, name: 'Reaper blockade', position: v3(0, 0, 46), ws }));
        fleets.push(reaperFleet('reaper-blockade-2', rules, { capitals: 3, destroyers: 8, name: 'Reaper reserve', position: v3(-50, 0, 76), heading: v3(0.4, 0, -1), arrivalTime: 90, ws }));
      }
      return base('final_battle_of_earth', 'Final Battle of Earth', 'final_battle_of_earth', seed, rules, 'earth_orbit', 540, 'Break the Reaper blockade of Earth.', ws, fleets);
    },
  },
  {
    id: 'alliance_fleet_engagement',
    name: 'Alliance Fleet Engagement',
    subtitle: 'Deep space — Alliance dreadnought group versus Reaper capital ships',
    environment: 'deep_space',
    description: 'A clean fleet-on-fleet engagement with no second wave: the reference battle used by the comparison mode and the balance tests.',
    recommendedRules: ['canon_me3', 'prime_apex', 'humanity_ascendant'],
    objective: 'Destroy the Reaper force.',
    maxDuration: 360,
    worldState: [SHEPARD_WORLD_STATE],
    briefing: ['A Reaper task group has been located in deep space.', 'The dreadnought group will engage at maximum range.'],
    build: (rules, seed, ws) =>
      base('alliance_fleet_engagement', 'Alliance Fleet Engagement', 'alliance_fleet_engagement', seed, rules, 'deep_space', 360, 'Destroy the Reaper force.', ws, [
        fleet('alliance-tf', 'alliance', rules, { counts: { alliance_dreadnought: 8, alliance_carrier: 1, alliance_cruiser: 16, alliance_frigate: 30, alliance_frigate_thanix: (ws.normandy ?? 'yes') === 'yes' ? 1 : 0 }, fixedClasses: ['alliance_frigate_thanix'], name: 'Alliance Task Force', formation: 'line_abreast', position: v3(0, 0, -36), ws }),
        reaperFleet('reaper-tg', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 40), ws }),
      ]),
  },
  {
    id: 'prime_apex_sol_defence',
    name: 'Prime/Apex — Sol Defence',
    subtitle: 'Alternate universe — a prepared Systems Alliance meets the invasion',
    environment: 'earth_orbit',
    description: 'The Homeworld Defence Rule in action: under Prime/Apex rules the Systems Alliance faces the Reaper invasion of Earth without allied rescue. Selecting the preset wins nothing; the fleet still has to win.',
    recommendedRules: ['prime_apex'],
    auOnly: true,
    objective: 'Defeat the Reaper invasion force in Sol without allied assistance.',
    maxDuration: 480,
    briefing: [
      'ALTERNATE UNIVERSE. Prime/Apex rules apply: HADES rounds, hyper-mass accelerators, hardened barriers.',
      'The Alliance Home Fleet is at full war strength. No allied fleets are available.',
      'Expect the Reapers to adapt. Their numbers and weapons are unchanged.',
    ],
    build: (rules, seed, ws) =>
      base('prime_apex_sol_defence', 'Prime/Apex — Sol Defence', 'prime_apex_sol_defence', seed, rules, 'earth_orbit', 480, 'Defeat the Reaper invasion force in Sol without allied assistance.', ws, [
        fleet('alliance-home', 'alliance', rules, { counts: { alliance_dreadnought: 8, alliance_carrier: 2, alliance_cruiser: 18, alliance_frigate: 30, alliance_frigate_thanix: 1 }, name: 'Alliance Home Fleet', formation: 'line_abreast', position: v3(0, 0, -36), mult: 1 }),
        reaperFleet('reaper-sol', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 44), mult: 1 }),
        reaperFleet('reaper-sol-2', rules, { capitals: 2, destroyers: 4, position: v3(-45, 0, 70), heading: v3(0.4, 0, -1), arrivalTime: 70, name: 'Reaper second wave', mult: 1 }),
      ]),
  },
  {
    id: 'prime_apex_palaven_defence',
    name: 'Prime/Apex — Palaven Defence',
    subtitle: 'Alternate universe — the enhanced Hierarchy stands alone',
    environment: 'palaven_orbit',
    description: 'Under Prime/Apex rules the Turian Hierarchy independently confronts the Reaper assault on Palaven. No allied rescue.',
    recommendedRules: ['prime_apex'],
    auOnly: true,
    objective: 'Defeat the Reaper assault on Palaven without allied assistance.',
    maxDuration: 480,
    briefing: ['ALTERNATE UNIVERSE. Hierarchy dreadnoughts carry hyper-mass accelerators and HADES rounds.', 'Hold formation. Hold the line.'],
    build: (rules, seed, ws) =>
      base('prime_apex_palaven_defence', 'Prime/Apex — Palaven Defence', 'prime_apex_palaven_defence', seed, rules, 'palaven_orbit', 480, 'Defeat the Reaper assault on Palaven without allied assistance.', ws, [
        fleet('hierarchy-home', 'turian', rules, { counts: { turian_dreadnought: 9, turian_cruiser: 18, turian_frigate: 28 }, name: 'Hierarchy Home Fleet', formation: 'line_abreast', position: v3(0, 0, -36), mult: 1 }),
        reaperFleet('reaper-trebia', rules, { capitals: 4, destroyers: 8, position: v3(0, 0, 44), mult: 1 }),
        reaperFleet('reaper-trebia-2', rules, { capitals: 2, destroyers: 4, position: v3(45, 0, 70), heading: v3(-0.4, 0, -1), arrivalTime: 70, name: 'Reaper second wave', mult: 1 }),
      ]),
  },
  {
    id: 'cerberus_ascendant_harbinger',
    name: 'Cerberus Ascendant — Harbinger',
    subtitle: 'Alternate continuity — controlled Reapers engage the independent Harbinger',
    environment: 'deep_space',
    description: 'In the Cerberus Ascendant continuity, the Illusive Man’s controlled Reaper fleet turns on Harbinger, the one Reaper that remains independent.',
    recommendedRules: ['cerberus_ascendant'],
    auOnly: true,
    objective: 'Destroy Harbinger.',
    maxDuration: 360,
    briefing: [
      'ALTERNATE CONTINUITY. The Catalyst is destroyed; the Illusive Man controls the Reaper fleet.',
      'Harbinger retains independence and has gathered the destroyers still loyal to it.',
      'Controlled Reaper units will engage. Cerberus fleet elements observe and support.',
    ],
    build: (rules, seed, ws) =>
      base('cerberus_ascendant_harbinger', 'Cerberus Ascendant — Harbinger', 'cerberus_ascendant_harbinger', seed, rules, 'deep_space', 360, 'Destroy Harbinger.', ws, [
        reaperFleet('controlled-reapers', rules, { capitals: 3, destroyers: 6, position: v3(0, 0, -40), heading: v3(0, 0, 1), side: 'A', name: 'Controlled Reaper fleet (Cerberus)', mult: 1, formation: 'line_abreast' }),
        fleet('cerberus-support', 'cerberus', rules, { counts: { cerberus_cruiser: 4, cerberus_frigate: 8 }, name: 'Cerberus support group', position: v3(-30, 0, -46), heading: v3(0.2, 0, 1), formation: 'defensive_screen', mult: 1 }),
        reaperFleet('harbinger-group', rules, { capitals: 0, destroyers: 6, harbinger: true, position: v3(0, 0, 40), name: 'Harbinger', mult: 1 }),
      ]),
  },
  {
    id: 'custom',
    name: 'Custom Battle',
    subtitle: 'Player-configured engagement',
    environment: 'deep_space',
    description: 'Configured in the Custom Battle builder.',
    recommendedRules: [],
    objective: 'Destroy the enemy force.',
    maxDuration: 420,
    briefing: ['Custom engagement.'],
    build: (rules, seed, ws) => base('custom', 'Custom Battle', 'custom', seed, rules, 'deep_space', 420, 'Destroy the enemy force.', ws, []),
  },
];

/** Additional AU chapters remain regular BattleConfig presets, so every
 * front end (including the numerical resolver) uses the same validated rosters. */
SCENARIOS.push(...EXPANDED_BATTLES.map(expanded => ({
  id:expanded.id,name:expanded.name,subtitle:expanded.subtitle,
  environment:expanded.environment,description:expanded.description,
  recommendedRules:[expanded.rules],auOnly:true,objective:expanded.objective,
  maxDuration:expanded.maxDuration,
  briefing:[expanded.era,expanded.description],
  build:(rules:RuleSet,seed:number,worldState:Record<string,string>):BattleConfig=>({
    id:expanded.id+'-'+rules.id+'-'+seed,
    name:expanded.name,scenarioId:expanded.id,alternateHistory:true,
    seed,rules,environment:expanded.environment,maxDuration:expanded.maxDuration,
    perspectiveSide:'A',objective:expanded.objective,worldState,
    fleets:([
      {side:'A' as Side,f:expanded.a,z:-expanded.distance/2,heading:1},
      {side:'B' as Side,f:expanded.b,z:expanded.distance/2,heading:-1}
    ]).map(({side,f,z,heading})=>({
      id:expanded.id+'-'+side.toLowerCase(),name:f.name,faction:f.faction,side,
      formation:f.formation,
      ships:Object.entries(f.counts).filter(([,n])=>n>0).map(([classId,count])=>({classId,count})),
      position:v3(0,0,z),heading:v3(0,0,heading),
      playerControlled:side==='A'
    }))
  })
})));

export const getScenario = (id: string): ScenarioDef => {
  const s = SCENARIOS.find((x) => x.id === id);
  if (!s) throw new Error(`Unknown scenario ${id}`);
  return s;
};

export const defaultWorldState = (s: ScenarioDef): Record<string, string> => {
  const ws: Record<string, string> = {};
  for (const o of s.worldState ?? []) ws[o.id] = o.default;
  return ws;
};

/** Convenience: build a config for a scenario + preset id. */
export function buildScenario(scenarioId: string, rulesId: string, seed: number, worldState?: Record<string, string>): BattleConfig {
  const s = getScenario(scenarioId);
  const rules = getPreset(rulesId);
  return s.build(rules, seed, { ...defaultWorldState(s), ...(worldState ?? {}) });
}

// ------------------------------------------------------------ custom battles

export type CustomFaction = FactionId;

export interface CustomFleetInput {
  faction: CustomFaction;
  name: string;
  formation: FormationType;
  counts: Record<string, number>;
  /** Explicit civilization-specific tuning, validated at the builder boundary. */
  techOverride?: Partial<TechModifiers>;
  /** Seconds after battle start when this fleet arrives (0 or undefined = present from the start). */
  arrivalTime?: number;
}

export interface CustomBattleInput {
  seed: number;
  rulesId: string;
  /** Explicit UI roster selection; old setups default to Mass Effect. */
  rosterMode?: 'mass_effect' | 'multiverse';
  environment: Environment;
  startingDistanceKm: number;
  sideA: CustomFleetInput;
  sideB: CustomFleetInput;
  maxDuration?: number;
  /** Seconds until side B's optional second wave arrives (0 = none). */
  reinforcementTime?: number;
  reinforcementCounts?: Record<string, number>;
  /** Faction of the reinforcement wave (defaults to side B's main fleet faction). */
  reinforcementFaction?: CustomFaction;
  /** Additional fleets fighting under side A / side B (united fleets of any factions). */
  extraA?: CustomFleetInput[];
  extraB?: CustomFleetInput[];
}

/** Keep only the counts that belong to the fleet's own faction (a stale roster must never spawn foreign hulls). */
export function countsForFaction(counts: Record<string, number>, faction: CustomFaction): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, n] of Object.entries(counts)) {
    const cls = SHIP_CLASSES[id];
    if (cls && cls.faction === faction && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

export function buildCustomBattle(input: CustomBattleInput, rules?: RuleSet): BattleConfig {
  const r = rules ?? getPreset(input.rulesId);
  const requested = [input.sideA, input.sideB, ...(input.extraA ?? []), ...(input.extraB ?? [])];
  const hasCrossover = requested.some(f => isCrossoverFaction(f.faction)) ||
    ((input.reinforcementTime ?? 0) > 0 && isCrossoverFaction(input.reinforcementFaction ?? input.sideB.faction));
  if (hasCrossover && (r.strictLore || r.category === 'canon')) {
    throw new Error('Crossover fleets require an AU timeline. Choose Multiverse Crossover — Sandbox.');
  }
  if (r.strictLore) {
    const rosters = [...requested.map(f => f.counts), input.reinforcementCounts ?? {}];
    for (const counts of rosters) for (const [id, n] of Object.entries(counts)) {
      if (n > 0 && SHIP_CLASSES[id] && !isShipAllowedInRules(SHIP_CLASSES[id], r)) {
        throw new Error(`Strict Lore excludes ${SHIP_CLASSES[id].name}. Choose an AU timeline to field this hull.`);
      }
    }
  }
  const half = Math.max(10, input.startingDistanceKm) / 2;
  const safeTech = (raw: Partial<TechModifiers> | undefined): Partial<TechModifiers> | undefined => {
    if (!raw || r.strictLore) return undefined;
    const out: Partial<TechModifiers> = {};
    for (const key of TECH_KEYS) {
      const value = raw[key];
      if (typeof value === 'number' && Number.isFinite(value)) out[key] = Math.min(TECH_RANGE[key][1], Math.max(TECH_RANGE[key][0], value));
    }
    return Object.keys(out).length ? out : undefined;
  };
  const mk = (f: CustomFleetInput, side: Side, id: string, x: number, z: number, heading: number, arrivalTime?: number, counts?: Record<string, number>): FleetSpec =>
    fleet(id, f.faction, r, { counts: countsForFaction(counts ?? f.counts, f.faction), techOverride: safeTech(f.techOverride), name: f.name, side, position: v3(x, 0, z), heading: v3(0, 0, heading), formation: f.formation, mult: 1, arrivalTime: arrivalTime && arrivalTime > 0 ? arrivalTime : undefined, playerControlled: side === 'A' });
  // United fleets: extra fleets of any faction sit beside the main fleet, alternating left and right, 20 km apart.
  const lateral = (i: number): number => (i % 2 === 0 ? 1 : -1) * Math.ceil((i + 1) / 2) * 20;
  const fleets: FleetSpec[] = [mk(input.sideA, 'A', 'custom-a', 0, -half, 1, input.sideA.arrivalTime), mk(input.sideB, 'B', 'custom-b', 0, half, -1, input.sideB.arrivalTime)];
  (input.extraA ?? []).forEach((f, i) => fleets.push(mk(f, 'A', `custom-a${i + 2}`, lateral(i), -half - 4 * (i + 1), 1, f.arrivalTime)));
  (input.extraB ?? []).forEach((f, i) => fleets.push(mk(f, 'B', `custom-b${i + 2}`, lateral(i), half + 4 * (i + 1), -1, f.arrivalTime)));
  const reinforcementFaction = input.reinforcementFaction ?? input.sideB.faction;
  const reinforcements = countsForFaction(input.reinforcementCounts ?? {}, reinforcementFaction);
  if (input.reinforcementTime && input.reinforcementTime > 0 && Object.values(reinforcements).some((n) => n > 0)) {
    const name = reinforcementFaction === input.sideB.faction ? `${input.sideB.name} reinforcements` : `${FACTIONS[reinforcementFaction].shortName} reinforcements`;
    fleets.push(mk({ faction: reinforcementFaction, name, formation: input.sideB.formation, counts: reinforcements }, 'B', 'custom-b-reinforcements', 0, half + 30, -1, input.reinforcementTime));
  }
  const sideName = (main: CustomFleetInput, extra: CustomFleetInput[] | undefined): string => (extra && extra.length > 0 ? `${main.name} + ${extra.length} allied fleet${extra.length > 1 ? 's' : ''}` : main.name);
  const config: BattleConfig = {
    id: `custom-${r.id}-${input.seed}`,
    name: `Custom: ${sideName(input.sideA, input.extraA)} vs ${sideName(input.sideB, input.extraB)}`,
    scenarioId: 'custom',
    seed: input.seed,
    rules: r,
    environment: input.environment,
    maxDuration: input.maxDuration ?? 420,
    perspectiveSide: 'A',
    objective: 'Destroy the enemy force.',
    fleets: fleets.filter((f) => f.ships.length > 0),
  };
  assertLoreCompatible(config);
  return config;
}
