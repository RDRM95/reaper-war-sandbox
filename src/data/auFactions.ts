import type { Sourced } from '@/core/provenance';
import type { CommsEvent, FactionDef, FactionDoctrine } from './factions';
import type { FactionId, HardpointDef, SandboxFactionId, ShipClassDef, ShipRole, WeaponDef } from './types';

/** Original what-if designs, not recovered Prothean plans or established
 * Terminator spacecraft. Every conversion uses the shared simulation scale. */
export const AU_DESIGN_NOTE = 'Original alternate-history simulation estimate. These ship plans, dimensions, weapons and comparative power values are invented for the AU sandbox, not established franchise canon.';
const au = <T>(value: T, note = AU_DESIGN_NOTE): Sourced<T> => ({ value, provenance: 'AU_MODIFIED', note });
const comms = (opening: string, firing: string): Record<CommsEvent, string[]> => ({
  battle_start: [opening], engage: [firing], focus_fire: ['Concentrate on the designated threat.'],
  ally_lost: ['{ship} lost. Preserve the formation.'], capital_lost: ['Capital unit {ship} destroyed. Close the gap.'],
  enemy_capital_lost: ['Enemy capital disabled. Continue the engagement.'], enemy_destroyed: ['Hostile vessel eliminated.'],
  withdraw: ['Recover damaged units behind the battle line.'], victory: ['Battlespace secured.'],
  defeat: ['Fleet combat capacity exhausted. Preserve the survivors.'], heavy_losses: ['Heavy losses. Reassess target priority.'],
  fighters_launch: ['Flight operations, launch when ready.'],
});
const doctrine = (p: Partial<FactionDoctrine>): FactionDoctrine => ({
  preferredRangeFactor: 0.84, withdrawThreshold: 0.2, focusFire: 0.75, protectCapitals: 0.7,
  threatPriority: 0.65, finishWounded: 0.55, cohesion: 0.85, decisionInterval: 1.7, aggression: 0.6, ...p,
});
const faction = (id: FactionId, name: string, shortName: string, colour: string, glow: number, description: string, p: Partial<FactionDoctrine>, opening: string): FactionDef => ({
  id, name, shortName, colour, colourHex: Number.parseInt(colour.slice(1), 16), engineColourHex: glow,
  universe: id === 'skynet' ? 'terminator' : 'mass_effect', sandboxOnly: true,
  doctrine: doctrine(p), description, comms: comms(opening, 'Firing solution confirmed. Batteries engaging.'),
});

export const SANDBOX_FACTIONS: Record<SandboxFactionId, FactionDef> = {
  prothean: faction('prothean', 'Prothean Empire — surviving-cycle AU', 'Prothean', '#c8b477', 0xd7dc92,
    'An alternate surviving Prothean Empire, fielding original extrapolated warships. Their advanced defence and energy batteries remain vulnerable to Reaper concentration; no canonical ship blueprint is claimed.',
    { preferredRangeFactor: 0.87, withdrawThreshold: 0.12, cohesion: 0.93, aggression: 0.65 }, 'Imperial line, the harvest ends here.'),
  past_cycle: faction('past_cycle', 'Past-cycle civilization — generated AU', 'Past cycle', '#78cbb4', 0x6ee0c8,
    'A generated civilization from an invented earlier cycle. Static original hull frames receive explicit, seeded fleet technology and political modifiers; their identity and history are AU fiction.',
    { preferredRangeFactor: 0.85, cohesion: 0.82, protectCapitals: 0.8 }, 'Our surviving fleets are in position. Remember the worlds behind us.'),
  player_civ: faction('player_civ', 'Player civilization — AU charter', 'Player civilization', '#91c6ee', 0x74baff,
    'A real selectable fleet faction for the civilization sandbox. Its charter, politics, production and research determine the ships and per-fleet modifiers it can actually deploy.',
    { preferredRangeFactor: 0.84, protectCapitals: 0.85 }, 'Charter fleet, stand ready. Our choices brought us here.'),
};
export const SKYNET_FACTION = faction('skynet', 'Skynet — orbital extrapolation', 'Skynet', '#dc7678', 0xff4234,
  'Terminator-inspired AU extrapolation. These autonomous orbital Hunter-Killers are invented spacefaring designs, not established film spacecraft. Armoured machine hulls have no energy shields and can be overwhelmed by Reaper fire.',
  { preferredRangeFactor: 0.82, withdrawThreshold: 0, cohesion: 0.96, decisionInterval: 1.1, aggression: 0.8 }, 'Strategic threat assessed. Orbital extermination fleet online.');

const weapon = (id: string, name: string, p: Partial<WeaponDef>): WeaponDef => ({
  id, name, kind: 'mass_accelerator', damageType: 'kinetic', damage: 350, cooldown: 4,
  range: 56, projectileSpeed: 32, accuracy: 0.84, penetration: 0.8, heat: 12,
  antiSmall: false, antiCapital: true, arc: 18, provenance: au(name), ...p,
});
const orbitalWeapon = (id: string, name: string, p: Partial<WeaponDef>): WeaponDef => weapon(id, name, {
  ...p, provenance: au(name, `${AU_DESIGN_NOTE} This is not a canonical cross-universe yield or equivalence.`),
});
export const SANDBOX_WEAPONS: Record<string, WeaponDef> = {
  au_cruiser_accelerator: weapon('au_cruiser_accelerator', 'Charter-pattern cruiser accelerator (AU)', { damage: 350, cooldown: 4, range: 52, penetration: 0.85, arc: 24 }),
  au_capital_accelerator: weapon('au_capital_accelerator', 'Charter-pattern capital accelerator (AU)', { damage: 1100, cooldown: 5, range: 66, penetration: 1.1, heat: 20, arc: 12 }),
  au_auxiliary_lance: weapon('au_auxiliary_lance', 'Auxiliary directed-plasma lance (AU)', { kind: 'thanix', damageType: 'thanix_stream', damage: 350, cooldown: 8, beamDuration: 1.5, range: 54, projectileSpeed: Infinity, penetration: 0.95, heat: 17, arc: 30 }),
  au_capital_lance: weapon('au_capital_lance', 'Past-cycle capital lance (AU)', { kind: 'thanix', damageType: 'thanix_stream', damage: 1300, cooldown: 9, beamDuration: 2.2, range: 68, projectileSpeed: Infinity, penetration: 1.1, heat: 27, arc: 24 }),
  au_prothean_lance: weapon('au_prothean_lance', 'Prothean-victory heavy lance (AU)', { kind: 'thanix', damageType: 'thanix_stream', damage: 2100, cooldown: 8, beamDuration: 2.5, range: 74, projectileSpeed: Infinity, penetration: 1.2, heat: 29, arc: 20 }),
  au_point_defence: weapon('au_point_defence', 'Charter defensive laser (AU)', { kind: 'gardian', damageType: 'laser', damage: 30, cooldown: 0.4, range: 6, projectileSpeed: Infinity, heat: 1.5, burst: { shots: 8, recovery: 2.5 }, antiSmall: true, antiCapital: false, arc: 360 }),
};
export const SKYNET_WEAPONS: Record<string, WeaponDef> = {
  skynet_hunter_cannon: orbitalWeapon('skynet_hunter_cannon', 'Hunter-Killer orbital cannon (AU extrapolation)', { damage: 300, cooldown: 3.2, range: 45, penetration: 0.9, heat: 11, arc: 25 }),
  skynet_harvester_cannon: orbitalWeapon('skynet_harvester_cannon', 'Harvester heavy accelerator (AU extrapolation)', { damage: 2000, cooldown: 7, range: 68, penetration: 1.2, heat: 25, arc: 14 }),
  skynet_missile: orbitalWeapon('skynet_missile', 'Autonomous orbital missile (AU extrapolation)', { kind: 'missile', damageType: 'warhead', damage: 480, cooldown: 9, range: 54, projectileSpeed: 4.8, missileHp: 70, magazine: 12, penetration: 0.8, heat: 8, arc: 180 }),
  skynet_point_defence: orbitalWeapon('skynet_point_defence', 'Machine defensive laser (AU extrapolation)', { kind: 'gardian', damageType: 'laser', damage: 36, cooldown: 0.35, range: 7, projectileSpeed: Infinity, heat: 1.5, burst: { shots: 10, recovery: 2.5 }, antiSmall: true, antiCapital: false, arc: 360 }),
};

const hp = (weaponId: string, offset: [number, number, number], facing = 0, count = 1): HardpointDef => ({ weaponId, offset, facing, count });
interface HullInput {
  id: string; name: string; faction: FactionId; role: ShipRole; lengthM: number;
  hull: number; armour: number; barriers: number; barrierRegen: number; maxSpeed: number;
  acceleration: number; turnRate: number; sensorRange: number; pointValue: number;
  hardpoints: HardpointDef[]; description: string;
}
function hull(p: HullInput): ShipClassDef {
  return { ...p, shortName: p.name, designProvenance: au(`${p.name}: original what-if hull, not an established ship class.`),
    lengthM: au(p.lengthM), hull: au(p.hull), armour: au(p.armour), barriers: au(p.barriers),
    barrierRegen: au(p.barrierRegen), maxSpeed: au(p.maxSpeed), acceleration: au(p.acceleration),
    turnRate: au(p.turnRate), sensorRange: au(p.sensorRange), signature: Math.max(0.5, p.lengthM / 700),
    ecm: p.faction === 'skynet' ? 0.25 : 0.2, crewQuality: p.faction === 'skynet' ? 1.15 : 1,
  };
}
export const SANDBOX_SHIPS: Record<string, ShipClassDef> = {
  player_civ_cruiser: hull({ id: 'player_civ_cruiser', name: 'Charter cruiser', faction: 'player_civ', role: 'cruiser', lengthM: 700,
    hull: 3900, armour: 75, barriers: 2800, barrierRegen: 30, maxSpeed: 0.9, acceleration: 0.15, turnRate: 9, sensorRange: 100, pointValue: 280,
    hardpoints: [hp('au_cruiser_accelerator', [0, 0, 310]), hp('au_auxiliary_lance', [0, 25, 260]), hp('au_point_defence', [0, 30, 0], 0, 4)],
    description: 'A player-civilization cruiser frame with both kinetic and energy batteries, allowing research and doctrine to alter real weapons rather than flavour text. Original AU hull.' }),
  player_civ_dreadnought: hull({ id: 'player_civ_dreadnought', name: 'Charter dreadnought', faction: 'player_civ', role: 'dreadnought', lengthM: 1200,
    hull: 11000, armour: 150, barriers: 7500, barrierRegen: 65, maxSpeed: 0.54, acceleration: 0.06, turnRate: 3.5, sensorRange: 120, pointValue: 900,
    hardpoints: [hp('au_capital_accelerator', [0, 0, 540]), hp('au_auxiliary_lance', [0, 45, 420], 0, 2), hp('au_point_defence', [0, 55, 0], 0, 7)],
    description: 'A substantial charter-built capital frame. Its two weapon types and defensive layers receive explicit per-fleet research/political modifiers; it is not automatically superior to a Reaper.' }),
  past_cycle_cruiser: hull({ id: 'past_cycle_cruiser', name: 'Past-cycle sentinel cruiser', faction: 'past_cycle', role: 'cruiser', lengthM: 900,
    hull: 4800, armour: 95, barriers: 4200, barrierRegen: 42, maxSpeed: 0.78, acceleration: 0.12, turnRate: 7, sensorRange: 110, pointValue: 400,
    hardpoints: [hp('au_cruiser_accelerator', [0, 0, 390]), hp('au_auxiliary_lance', [0, 40, 320], 0, 2), hp('au_point_defence', [0, 45, 0], 0, 5)],
    description: 'An original reusable frame for invented earlier-cycle cultures. Generated names, charter choices and technology are preserved in the owning fleet, not by mutating this catalogue.' }),
  past_cycle_dreadnought: hull({ id: 'past_cycle_dreadnought', name: 'Past-cycle citadel ship', faction: 'past_cycle', role: 'dreadnought', lengthM: 1500,
    hull: 16000, armour: 180, barriers: 11500, barrierRegen: 80, maxSpeed: 0.48, acceleration: 0.05, turnRate: 2.8, sensorRange: 130, pointValue: 1200,
    hardpoints: [hp('au_capital_accelerator', [0, 0, 660]), hp('au_capital_lance', [0, 55, 560]), hp('au_point_defence', [0, 65, 0], 0, 8)],
    description: 'A heavier ancient-cycle frame used by seeded civilizations. Exact hulls and histories are AU inventions; combined batteries and shields remain within the declared common simulation.' }),
  prothean_cruiser: hull({ id: 'prothean_cruiser', name: 'Prothean imperial cruiser (AU)', faction: 'prothean', role: 'cruiser', lengthM: 1000,
    hull: 7000, armour: 135, barriers: 9500, barrierRegen: 65, maxSpeed: 0.76, acceleration: 0.11, turnRate: 6, sensorRange: 130, pointValue: 650,
    hardpoints: [hp('au_capital_lance', [0, -20, 420]), hp('au_cruiser_accelerator', [0, 35, 350]), hp('au_point_defence', [0, 60, 0], 0, 6)],
    description: 'An invented surviving-Empire warship with advanced energy batteries and barriers. The appearance and armament are extrapolated, not a recovered canonical Prothean design.' }),
  prothean_dreadnought: hull({ id: 'prothean_dreadnought', name: 'Prothean imperial dreadnought (AU)', faction: 'prothean', role: 'dreadnought', lengthM: 2200,
    hull: 22000, armour: 230, barriers: 18000, barrierRegen: 110, maxSpeed: 0.45, acceleration: 0.04, turnRate: 2.3, sensorRange: 150, pointValue: 1800,
    hardpoints: [hp('au_prothean_lance', [0, -30, 970]), hp('au_capital_accelerator', [0, 55, 800]), hp('au_point_defence', [0, 90, 0], 0, 10)],
    description: 'A surviving-cycle AU capital ship. Advanced protection and lance energy create a formidable opponent while concentrated Reaper fire remains lethal. All specifications are explicit estimates.' }),
};
export const SKYNET_SHIPS: Record<string, ShipClassDef> = {
  skynet_hunter: hull({ id: 'skynet_hunter', name: 'Orbital Hunter-Killer (AU)', faction: 'skynet', role: 'frigate', lengthM: 320,
    hull: 1700, armour: 85, barriers: 0, barrierRegen: 0, maxSpeed: 1.15, acceleration: 0.23, turnRate: 15, sensorRange: 90, pointValue: 120,
    hardpoints: [hp('skynet_hunter_cannon', [0, 0, 140]), hp('skynet_missile', [0, -20, 70], 0, 2), hp('skynet_point_defence', [0, 25, 0], 0, 2)],
    description: 'Terminator-inspired orbital extrapolation: an uncrewed armoured Hunter-Killer with finite missile magazines and no energy shields. Not an established movie spacecraft.' }),
  skynet_harvester: hull({ id: 'skynet_harvester', name: 'Orbital Harvester capital ship (AU)', faction: 'skynet', role: 'dreadnought', lengthM: 1200,
    hull: 18000, armour: 260, barriers: 0, barrierRegen: 0, maxSpeed: 0.50, acceleration: 0.055, turnRate: 3.4, sensorRange: 125, pointValue: 1100,
    hardpoints: [hp('skynet_harvester_cannon', [0, 0, 540]), hp('skynet_missile', [0, -55, 350], 0, 4), hp('skynet_point_defence', [0, 70, 0], 0, 8)],
    description: 'A large autonomous orbital factory-warship extrapolated for Skynet-vs-Reapers encounters. Heavy armour replaces shields; self-repair, time travel and factory reproduction are not simulated.' }),
};
