import type { Sourced } from '@/core/provenance';
import type { CommsEvent, FactionDef, FactionDoctrine } from './factions';
import type { CrossoverFactionId, HardpointDef, ShipClassDef, ShipRole, WeaponDef } from './types';
import { SKYNET_FACTION, SKYNET_SHIPS, SKYNET_WEAPONS } from './auFactions';

/** These are explicit crossover-game conversions, not an assertion that the
 * different settings share physical yields, shield rules or a canonical scale.
 * Values use the simulator's existing damage, barrier and compressed-space units.
 */
export const CROSSOVER_CONVERSION_NOTE = 'Crossover AU simulation estimate. Uses a common game-system scale; not a canonical cross-universe yield or equivalence. Shared barrier/weapon rules are an abstraction.';
const au = <T>(value: T, note = CROSSOVER_CONVERSION_NOTE): Sourced<T> => ({ value, provenance: 'AU_MODIFIED', note });

const communication = (opening: string, firing: string): Record<CommsEvent, string[]> => ({
  battle_start: [opening], engage: [firing], focus_fire: ['Concentrate the batteries on the marked target.'],
  ally_lost: ['{ship} lost. Maintain the formation.'], capital_lost: ['Capital ship {ship} lost. Cover the gap.'],
  enemy_capital_lost: ['Enemy capital destroyed. Acquire the next target.'], enemy_destroyed: ['Target destroyed.'],
  withdraw: ['Damaged ships, recover behind the screen.'], victory: ['Battlespace secured.'],
  defeat: ['Fleet combat-ineffective. Recover surviving ships.'], heavy_losses: ['Heavy losses. Maintain fire control.'],
  fighters_launch: ['Flight operations, launch when ready.'],
});

const doctrine = (overrides: Partial<FactionDoctrine>): FactionDoctrine => ({
  preferredRangeFactor: 0.82, withdrawThreshold: 0.18, focusFire: 0.75, protectCapitals: 0.65,
  threatPriority: 0.7, finishWounded: 0.6, cohesion: 0.85, decisionInterval: 1.6, aggression: 0.65,
  ...overrides,
});

export const CROSSOVER_FACTIONS: Record<CrossoverFactionId, FactionDef> = {
  unsc: {
    id: 'unsc', name: 'UNSC — Halo crossover', shortName: 'UNSC', universe: 'halo', sandboxOnly: true,
    colour: '#8eb9db', colourHex: 0x8eb9db, engineColourHex: 0x8fcbff,
    doctrine: doctrine({ preferredRangeFactor: 0.92, protectCapitals: 0.85, withdrawThreshold: 0.25 }),
    description: 'Halo crossover sandbox. Armoured MAC warships depend on measured firing solutions and missile support; older hulls lack energy shields. All conversions are AU estimates.',
    comms: communication('UNSC battlegroup, establish MAC solutions. Hold the line.', 'MAC solution confirmed. Firing.'),
  },
  covenant: {
    id: 'covenant', name: 'Covenant — Halo crossover', shortName: 'Covenant', universe: 'halo', sandboxOnly: true,
    colour: '#ce8cff', colourHex: 0xce8cff, engineColourHex: 0xc87aff,
    doctrine: doctrine({ preferredRangeFactor: 0.78, aggression: 0.78, withdrawThreshold: 0.12 }),
    description: 'Halo crossover sandbox. Shielded cruisers and assault carriers combine plasma weapons with heavy forward energy projectors. Shield and damage conversions are AU estimates.',
    comms: communication('Fleet, bring the energy projectors to bear.', 'Projector aligned. Plasma batteries engaging.'),
  },
  imperium: {
    id: 'imperium', name: 'Imperium — Warhammer 40,000 crossover', shortName: 'Imperium', universe: 'warhammer40k', sandboxOnly: true,
    colour: '#d9ba7a', colourHex: 0xd9ba7a, engineColourHex: 0xffb45c,
    doctrine: doctrine({ preferredRangeFactor: 0.74, cohesion: 0.93, aggression: 0.72, withdrawThreshold: 0.10, decisionInterval: 2.2 }),
    description: 'Warhammer 40,000 crossover sandbox. Vast armoured hulls, void-shield equivalents, lance decks and heavy broadsides occupy a higher encounter-power tier. This is a configurable AU conversion.',
    comms: communication('Battlefleet, form the gun line. Prepare the broadsides.', 'Lance decks and macrobatteries, fire.'),
  },
  chaos: {
    id: 'chaos', name: 'Chaos — Warhammer 40,000 crossover', shortName: 'Chaos', universe: 'warhammer40k', sandboxOnly: true,
    colour: '#df6257', colourHex: 0xdf6257, engineColourHex: 0xff4a35,
    doctrine: doctrine({ preferredRangeFactor: 0.76, cohesion: 0.76, aggression: 0.85, withdrawThreshold: 0.08, finishWounded: 0.8, decisionInterval: 1.9 }),
    description: 'Warhammer 40,000 crossover sandbox. Ancient raider cruisers and battleships use long-ranged lance and macro fire. Warp powers and boarding are not modelled; numerical conversions are AU estimates.',
    comms: communication('Bring the raiding wings forward. Mark their capital ships.', 'Batteries have the range. Open fire.'),
  },
  skynet: SKYNET_FACTION,
};

function weapon(id: string, name: string, values: Partial<WeaponDef>, note = CROSSOVER_CONVERSION_NOTE): WeaponDef {
  return {
    id, name, kind: 'mass_accelerator', damageType: 'kinetic', damage: 1000, cooldown: 8,
    range: 70, projectileSpeed: 35, accuracy: 0.74, penetration: 0.85, heat: 18,
    antiSmall: false, antiCapital: true, arc: 12,
    ...values,
    provenance: au(name, note),
  };
}

export const CROSSOVER_WEAPONS: Record<string, WeaponDef> = {
  unsc_mac: weapon('unsc_mac', 'UNSC cruiser MAC (crossover estimate)', {
    damage: 2600, cooldown: 9, range: 72, projectileSpeed: 40, penetration: 1.05, heat: 24,
  }),
  unsc_super_mac: weapon('unsc_super_mac', 'Infinity heavy MAC (crossover estimate)', {
    damage: 11000, cooldown: 12, range: 90, projectileSpeed: 48, penetration: 1.35, heat: 32, arc: 10,
  }),
  unsc_archer: weapon('unsc_archer', 'UNSC Archer missile battery (crossover estimate)', {
    kind: 'missile', damageType: 'warhead', damage: 520, cooldown: 9, range: 65,
    projectileSpeed: 5.5, missileHp: 90, magazine: 24, penetration: 0.7, accuracy: 0.78, heat: 7, arc: 360,
  }, `${CROSSOVER_CONVERSION_NOTE} The 360-degree engagement envelope represents vertical/pod launch followed by missile guidance, not a fixed broadside gun barrel.`),
  covenant_plasma_lance: weapon('covenant_plasma_lance', 'Covenant energy projector (crossover estimate)', {
    kind: 'thanix', damageType: 'thanix_stream', damage: 1400, cooldown: 8.5, beamDuration: 2,
    range: 74, projectileSpeed: Infinity, penetration: 1.1, heat: 27, arc: 18,
  }),
  covenant_heavy_lance: weapon('covenant_heavy_lance', 'Assault-carrier energy projector (crossover estimate)', {
    kind: 'thanix', damageType: 'thanix_stream', damage: 3600, cooldown: 10, beamDuration: 2.6,
    range: 92, projectileSpeed: Infinity, penetration: 1.3, heat: 34, arc: 18,
  }),
  covenant_plasma_torpedo: weapon('covenant_plasma_torpedo', 'Covenant plasma torpedo (crossover estimate)', {
    kind: 'missile', damageType: 'warhead', damage: 1500, cooldown: 11, range: 74,
    projectileSpeed: 4.8, missileHp: 180, magazine: 20, penetration: 1.05, accuracy: 0.8, heat: 12, arc: 270,
  }, `${CROSSOVER_CONVERSION_NOTE} Each guided plasma bank has an estimated 270-degree engagement envelope including forward targets; this does not widen the fixed energy projector.`),
  wh_macro_cruiser: weapon('wh_macro_cruiser', 'Cruiser macrobattery (crossover estimate)', {
    damage: 3100, cooldown: 10, range: 82, projectileSpeed: 27, penetration: 1.1, heat: 16, arc: 110,
  }),
  wh_macro_battleship: weapon('wh_macro_battleship', 'Battleship macrobattery (crossover estimate)', {
    damage: 7200, cooldown: 12, range: 100, projectileSpeed: 30, penetration: 1.4, heat: 21, arc: 110,
  }),
  wh_lance_cruiser: weapon('wh_lance_cruiser', 'Cruiser lance deck (crossover estimate)', {
    kind: 'thanix', damageType: 'thanix_stream', damage: 2300, cooldown: 11, beamDuration: 2.5,
    range: 90, projectileSpeed: Infinity, penetration: 1.4, heat: 28, arc: 220,
  }),
  wh_lance_battleship: weapon('wh_lance_battleship', 'Battleship lance deck (crossover estimate)', {
    kind: 'thanix', damageType: 'thanix_stream', damage: 5200, cooldown: 14, beamDuration: 3,
    range: 110, projectileSpeed: Infinity, penetration: 1.7, heat: 34, arc: 220,
  }),
  wh_torpedo: weapon('wh_torpedo', 'Heavy void torpedo (crossover estimate)', {
    kind: 'missile', damageType: 'warhead', damage: 10500, cooldown: 22, range: 96,
    projectileSpeed: 3.2, missileHp: 900, magazine: 8, penetration: 1.4, accuracy: 0.7, heat: 18, arc: 35,
  }),
  crossover_point_defence: weapon('crossover_point_defence', 'Crossover defensive battery (estimate)', {
    kind: 'gardian', damageType: 'laser', damage: 45, cooldown: 0.45, range: 9,
    projectileSpeed: Infinity, accuracy: 0.88, penetration: 0.2, heat: 2,
    burst: { shots: 8, recovery: 2.5 }, antiSmall: true, antiCapital: false, arc: 360,
  }),
  ...SKYNET_WEAPONS,
};

const hp = (weaponId: string, offset: [number, number, number], facing = 0, count = 1): HardpointDef => ({ weaponId, offset, facing, count });
interface HullInput {
  id: string; name: string; shortName: string; faction: CrossoverFactionId; role: ShipRole;
  lengthM: number; hull: number; armour: number; barriers: number; barrierRegen: number;
  maxSpeed: number; acceleration: number; turnRate: number; sensorRange: number;
  signature: number; ecm: number; crewQuality: number; hardpoints: HardpointDef[]; pointValue: number; description: string;
}
function hull(p: HullInput): ShipClassDef {
  return {
    ...p, designProvenance: au(`${p.name}: original crossover representation of a ship class from another setting.`),
    lengthM: au(p.lengthM), hull: au(p.hull), armour: au(p.armour), barriers: au(p.barriers),
    barrierRegen: au(p.barrierRegen), maxSpeed: au(p.maxSpeed), acceleration: au(p.acceleration),
    turnRate: au(p.turnRate), sensorRange: au(p.sensorRange),
  };
}

export const CROSSOVER_SHIPS: Record<string, ShipClassDef> = {
  unsc_marathon: hull({
    id: 'unsc_marathon', name: 'Marathon-class heavy cruiser', shortName: 'Marathon', faction: 'unsc', role: 'cruiser',
    lengthM: 1170, hull: 13000, armour: 150, barriers: 0, barrierRegen: 0,
    maxSpeed: 0.72, acceleration: 0.15, turnRate: 5, sensorRange: 160, signature: 1.9, ecm: 0.18, crewQuality: 1,
    hardpoints: [hp('unsc_mac', [0, 0, 500], 0, 2), hp('unsc_archer', [100, 0, 0], 90, 3), hp('unsc_archer', [-100, 0, 0], -90, 3), hp('crossover_point_defence', [0, 70, 0], 0, 6)],
    pointValue: 950,
    description: 'Halo crossover. An armoured MAC cruiser with missile support and no energy shields. The 1,170 m length is an illustrative class-scale conversion; yields and every combat value are AU estimates.',
  }),
  unsc_infinity: hull({
    id: 'unsc_infinity', name: 'Infinity-class supercarrier', shortName: 'Infinity', faction: 'unsc', role: 'carrier',
    lengthM: 5694, hull: 76000, armour: 300, barriers: 52000, barrierRegen: 210,
    maxSpeed: 0.46, acceleration: 0.065, turnRate: 2.1, sensorRange: 220, signature: 5.1, ecm: 0.28, crewQuality: 1.15,
    hardpoints: [hp('unsc_super_mac', [0, 0, 2500], 0, 2), hp('unsc_archer', [450, 0, 0], 90, 5), hp('unsc_archer', [-450, 0, 0], -90, 5), hp('crossover_point_defence', [0, 220, 0], 0, 10)],
    pointValue: 5200,
    description: 'Halo crossover. A shielded supercarrier with exceptionally heavy MAC batteries. This starter roster represents its ship batteries; embarked fighters and deployed escort frigates are not abstracted into bonus damage or invented complements.',
  }),
  covenant_ccs: hull({
    id: 'covenant_ccs', name: 'CCS-class battlecruiser', shortName: 'CCS', faction: 'covenant', role: 'cruiser',
    lengthM: 1782, hull: 21000, armour: 140, barriers: 32000, barrierRegen: 170,
    maxSpeed: 0.70, acceleration: 0.14, turnRate: 4.5, sensorRange: 180, signature: 2.6, ecm: 0.24, crewQuality: 1,
    hardpoints: [hp('covenant_plasma_lance', [0, -70, 680]), hp('covenant_plasma_torpedo', [260, 0, 0], 90, 2), hp('covenant_plasma_torpedo', [-260, 0, 0], -90, 2), hp('crossover_point_defence', [0, 100, 0], 0, 7)],
    pointValue: 1600,
    description: 'Halo crossover. A shield-heavy battlecruiser using plasma and a forward energy projector. Shields are converted into the simulator’s common barrier system; no exact cross-universe shield physics is claimed.',
  }),
  covenant_cas: hull({
    id: 'covenant_cas', name: 'CAS-class assault carrier', shortName: 'CAS', faction: 'covenant', role: 'carrier',
    lengthM: 5347, hull: 84000, armour: 270, barriers: 125000, barrierRegen: 420,
    maxSpeed: 0.44, acceleration: 0.06, turnRate: 2, sensorRange: 230, signature: 5.8, ecm: 0.3, crewQuality: 1.1,
    hardpoints: [hp('covenant_heavy_lance', [0, -200, 1800], 0, 2), hp('covenant_plasma_torpedo', [600, 0, 0], 90, 4), hp('covenant_plasma_torpedo', [-600, 0, 0], -90, 4), hp('crossover_point_defence', [0, 250, 0], 0, 10)],
    pointValue: 7400,
    description: 'Halo crossover. A vast assault carrier with heavy shielding and paired projectors. The starter model simulates its main batteries; embarked fighter wings are not yet represented. All conversion values are AU estimates.',
  }),
  imperium_lunar: hull({
    id: 'imperium_lunar', name: 'Lunar-class cruiser', shortName: 'Lunar', faction: 'imperium', role: 'cruiser',
    lengthM: 5000, hull: 175000, armour: 700, barriers: 160000, barrierRegen: 380,
    maxSpeed: 0.36, acceleration: 0.045, turnRate: 2.2, sensorRange: 250, signature: 6.5, ecm: 0.12, crewQuality: 1,
    hardpoints: [hp('wh_macro_cruiser', [500, 0, 0], 90, 4), hp('wh_macro_cruiser', [-500, 0, 0], -90, 4), hp('wh_lance_cruiser', [0, 200, 0], 0, 2), hp('wh_torpedo', [0, 0, 2200], 0, 2), hp('crossover_point_defence', [0, 300, 0], 0, 10)],
    pointValue: 11000,
    description: 'Warhammer 40,000 crossover. A heavily armoured cruiser with broadside macrobatteries, lances and prow torpedoes. Five kilometres is an illustrative scale estimate. Void shields use the shared barrier abstraction; boarding and warp effects are not simulated.',
  }),
  imperium_retribution: hull({
    id: 'imperium_retribution', name: 'Retribution-class battleship', shortName: 'Retribution', faction: 'imperium', role: 'dreadnought',
    lengthM: 8000, hull: 460000, armour: 1250, barriers: 390000, barrierRegen: 650,
    maxSpeed: 0.28, acceleration: 0.027, turnRate: 1.2, sensorRange: 280, signature: 9, ecm: 0.13, crewQuality: 1.1,
    hardpoints: [hp('wh_macro_battleship', [900, 0, 0], 90, 6), hp('wh_macro_battleship', [-900, 0, 0], -90, 6), hp('wh_lance_battleship', [0, 350, 0], 0, 3), hp('wh_torpedo', [0, 0, 3500], 0, 4), hp('crossover_point_defence', [0, 450, 0], 0, 14)],
    pointValue: 31000,
    description: 'Warhammer 40,000 crossover. An imposing eight-kilometre-scale battleship built around heavy broadside fire. Its high encounter tier and point value are explicit AU balancing estimates, not a canonical verdict against another universe.',
  }),
  chaos_murder: hull({
    id: 'chaos_murder', name: 'Murder-class cruiser', shortName: 'Murder', faction: 'chaos', role: 'cruiser',
    lengthM: 5000, hull: 150000, armour: 590, barriers: 145000, barrierRegen: 340,
    maxSpeed: 0.42, acceleration: 0.055, turnRate: 2.5, sensorRange: 260, signature: 5.8, ecm: 0.2, crewQuality: 1.05,
    hardpoints: [hp('wh_macro_cruiser', [480, 0, 0], 90, 4), hp('wh_macro_cruiser', [-480, 0, 0], -90, 4), hp('wh_lance_cruiser', [0, 190, 0], 0, 3), hp('crossover_point_defence', [0, 280, 0], 0, 9)],
    pointValue: 10000,
    description: 'Warhammer 40,000 crossover. An ancient raiding cruiser with long-ranged lance support and broadside fire. It is faster and less protected than the converted Lunar class. Warp powers and boarding are outside this model.',
  }),
  chaos_desolator: hull({
    id: 'chaos_desolator', name: 'Desolator-class battleship', shortName: 'Desolator', faction: 'chaos', role: 'dreadnought',
    lengthM: 7500, hull: 390000, armour: 1050, barriers: 350000, barrierRegen: 600,
    maxSpeed: 0.32, acceleration: 0.035, turnRate: 1.5, sensorRange: 290, signature: 8.2, ecm: 0.23, crewQuality: 1.1,
    hardpoints: [hp('wh_macro_battleship', [800, 0, 0], 90, 4), hp('wh_macro_battleship', [-800, 0, 0], -90, 4), hp('wh_lance_battleship', [0, 300, 0], 0, 4), hp('wh_torpedo', [0, 0, 3200], 0, 3), hp('crossover_point_defence', [0, 420, 0], 0, 12)],
    pointValue: 28500,
    description: 'Warhammer 40,000 crossover. A lance-heavy battleship with torpedo support and a broad, shallow attack wing. Relative durability, firing cadence and weapon energy are common-system AU estimates.',
  }),
  ...SKYNET_SHIPS,
};
