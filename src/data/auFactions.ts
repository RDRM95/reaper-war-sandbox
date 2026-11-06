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
  axiom_guard: faction('axiom_guard', 'Axiom Guard — Dissident Reaper AU', 'Axiom Guard', '#a8dfea', 0x74e3ef,
    'Axiom is a remorseful ancient Reaper protecting organics. A small grey-hulled autonomous escort force rejects the harvest. Entirely original Apex AU; no canon defection implied.',
    {preferredRangeFactor:0.75,withdrawThreshold:0.05,focusFire:0.95,cohesion:0.93,protectCapitals:0.95,aggression:0.85},
    'Axiom Guard, hold fire until threat identification is confirmed. Protect the organic flotilla.'),
  exile_hegemony: faction('exile_hegemony', 'Exile Hegemony — Return of the Ancients', 'The Exiles', '#beafed', 0xc3b2ff,
    'Descendants of a civilisation that escaped an earlier harvest return in armed exile arks to reclaim their ancestral systems. Original alternate-history faction, not established canon.',
    {preferredRangeFactor:0.93,withdrawThreshold:0.08,focusFire:0.9,cohesion:0.95,aggression:0.73},
    'Ancestral territory identified. Our arks will not yield to the younger powers.'),
  terminus_compact: faction('terminus_compact', 'Terminus Compact — United Frontier AU', 'Compact', '#e3ad63', 0xffb36b,
    'An alternate wartime union of batarian survivors, independent colonies and Aria-aligned private navies. Armoured gunships and modular siege vessels, built using original AU designs.',
    {preferredRangeFactor:0.72,withdrawThreshold:0.19,focusFire:0.7,cohesion:0.65,aggression:0.82},
    'Terminus task groups, keep the convoy lanes clear. All batteries engage.'),
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
  axiom_cleansing_beam: weapon('axiom_cleansing_beam','Axiom focused MHD beam (AU)',{
    kind:'reaper_beam',damageType:'reaper_beam',damage:2700,cooldown:8.3,range:52,
    projectileSpeed:Infinity,accuracy:0.93,penetration:1.15,beamDuration:2.8,
    heat:0,arc:55,provenance:au('Axiom main emitter; retains Reaper MHD physics, original AU tuning.')
  }),
  axiom_interceptor: weapon('axiom_interceptor','Guardian interceptor emitter (AU)',{
    kind:'reaper_beam',damageType:'reaper_beam',damage:850,cooldown:6.6,range:37,
    projectileSpeed:Infinity,accuracy:0.86,beamDuration:2,heat:0,arc:100,
  }),
  exile_ark_lance: weapon('exile_ark_lance','Exile ancestral spinal lance (AU)',{
    kind:'thanix',damageType:'thanix_stream',damage:1950,cooldown:8,range:78,
    projectileSpeed:Infinity,accuracy:0.86,penetration:1.15,beamDuration:2.2,heat:27,arc:18,
  }),
  exile_cruiser_rail: weapon('exile_cruiser_rail','Exile long-range accelerator (AU)',{
    damage:510,cooldown:3.5,range:58,accuracy:0.82,penetration:.90,heat:15,arc:28,
  }),
  terminus_siege_round: weapon('terminus_siege_round','Terminus compact siege cannon (AU)',{
    damage:1450,cooldown:6.7,range:43,accuracy:0.68,penetration:1,heat:24,arc:16,
  }),
  terminus_torpedo: weapon('terminus_torpedo','Compact breaching torpedo (AU)',{
    kind:'disruptor_torpedo',damageType:'warhead',damage:360,cooldown:9.2,range:24,
    projectileSpeed:3,missileHp:25,magazine:14,accuracy:.79,penetration:1.0,heat:6,arc:160,
  }),
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
  axiom_ancient: hull({id:'axiom_ancient',name:'Axiom — Benevolent Capital Reaper (AU)',faction:'axiom_guard',role:'reaper_capital',lengthM:4200,
    hull:48000,armour:520,barriers:33000,barrierRegen:210,maxSpeed:.53,acceleration:.047,turnRate:2.0,sensorRange:250,pointValue:7400,
    hardpoints:[hp('axiom_cleansing_beam',[0,-85,980]),hp('axiom_interceptor',[80,-20,280],25,3),hp('reaper_point_defence',[0,20,0],0,14)],
    description:'Axiom: a pale, weathered 4.2 km capital Reaper with protective doctrine and anti-harvest optics. Mass-effect-inducing morale behaviour is narrative only; combat statistics remain ordinary damage/barriers.'}),
  axiom_warden: hull({id:'axiom_warden',name:'Axiom Guard sentinel (AU)',faction:'axiom_guard',role:'reaper_destroyer',lengthM:280,
    hull:3400,armour:110,barriers:2300,barrierRegen:33,maxSpeed:1.25,acceleration:.23,turnRate:16,sensorRange:115,pointValue:210,
    hardpoints:[hp('axiom_interceptor',[0,-8,108]),hp('reaper_point_defence',[0,5,0],0,3)],
    description:'A pale-grey sentinel Reaper, original protective derivative, with shorter attack beams and anti-fighter emitters.'}),
  exile_ark: hull({id:'exile_ark',name:'Exile ancestral war-ark (AU)',faction:'exile_hegemony',role:'dreadnought',lengthM:2600,
    hull:26000,armour:270,barriers:19000,barrierRegen:145,maxSpeed:.37,acceleration:.032,turnRate:2.8,sensorRange:180,pointValue:2600,
    hardpoints:[hp('exile_ark_lance',[0,-28,1160]),hp('exile_cruiser_rail',[85,25,250],75,6),hp('au_point_defence',[0,70,0],0,12)],
    description:'Heavily protected colony-ark refitted as a siege dreadnought; extremely powerful forward lance but slow manoeuvres.'}),
  exile_raider: hull({id:'exile_raider',name:'Exile hegemon intercept cruiser (AU)',faction:'exile_hegemony',role:'cruiser',lengthM:730,
    hull:3800,armour:70,barriers:3100,barrierRegen:45,maxSpeed:1.07,acceleration:.2,turnRate:11,sensorRange:130,pointValue:155,
    hardpoints:[hp('exile_cruiser_rail',[0,0,310]),hp('au_auxiliary_lance',[18,-7,90],30,2),hp('au_point_defence',[0,15,0],0,3)],
    description:'Long-nosed deep-range raider with offset plasma projectors and advanced sensors; original exile silhouette.'}),
  compact_siege: hull({id:'compact_siege',name:'Terminus Compact siege dreadnought (AU)',faction:'terminus_compact',role:'dreadnought',lengthM:1120,
    hull:11600,armour:190,barriers:5400,barrierRegen:55,maxSpeed:.51,acceleration:.065,turnRate:4.1,sensorRange:102,pointValue:500,
    hardpoints:[hp('terminus_siege_round',[0,0,515]),hp('terminus_torpedo',[30,-15,170],35,4),hp('au_point_defence',[0,30,0],0,8)],
    description:'Modular siege hull assembled by batarian survivors and frontier dockyards; a slow main slug backed by torpedo racks.'}),
  compact_gunship: hull({id:'compact_gunship',name:'Terminus Compact breacher (AU)',faction:'terminus_compact',role:'frigate',lengthM:260,
    hull:990,armour:40,barriers:720,barrierRegen:20,maxSpeed:1.5,acceleration:.37,turnRate:19,sensorRange:72,pointValue:58,
    hardpoints:[hp('exile_cruiser_rail',[0,0,115]),hp('terminus_torpedo',[10,-5,45],25,2),hp('au_point_defence',[0,8,0],0,1)],
    description:'Cheap compact assault escort with a locally produced breaching rack; effective as a close-range wolfpack.'}),
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
