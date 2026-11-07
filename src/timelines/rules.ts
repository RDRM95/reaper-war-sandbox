import { isMassEffectFaction, type FactionId, type ShipClassDef, type WeaponDef } from '@/data/types';

/**
 * The alternate-universe rule engine.
 *
 * A RuleSet is plain data. Nothing in it is executed; imports are validated
 * against the schema in `schema.ts`. Rules modify the actual simulation by
 * changing the effective ship/weapon statistics produced by `applyRules*`,
 * by substituting weapons, and by changing fleet composition multipliers
 * consumed by scenario builders.
 */

/** Multipliers applied to a faction group's technology. 1 = canon ME3. */
export interface TechModifiers {
  massAcceleratorDamage: number;
  massAcceleratorPenetration: number;
  massAcceleratorRange: number;
  fireRate: number; // >1 = faster cooldowns
  heatCapacity: number;
  kineticBarrierStrength: number;
  barrierRegen: number;
  armourStrength: number;
  hullIntegrity: number;
  speed: number;
  sensors: number;
  electronicWarfare: number; // scales ECM rating
  accuracy: number;
  fighterStrength: number;
  torpedoDamage: number;
  gardianEffectiveness: number;
  /** Beam/stream weapons (Thanix for organics, primary beams for Reapers). */
  beamDamage: number;
  crewQuality: number;
}

export interface SpecialTechnology {
  /** Alliance/Turian dreadnoughts refit their spinal gun with the AU hyper-mass accelerator. */
  hyperMassAccelerators: boolean;
  /** HADES penetrators: kinetic rounds ignore a fraction of armour and pierce barriers more efficiently. */
  hadesRounds: boolean;
  /** Where Thanix cannons are mounted. */
  thanixAvailability: 'canon' | 'fleetwide' | 'none';
  /** Reaper command network can be disrupted: losing a capital ship degrades others' coordination. */
  reaperCommandVulnerability: boolean;
  /** Indoctrination disabled: no morale/coordination penalty on organics from Reaper presence. */
  indoctrinationDisabled: boolean;
}

export interface FleetStrength {
  alliance: number;
  turian: number;
  asari: number;
  salarian: number;
  quarian: number;
  geth: number;
  cerberus: number;
  reaper: number;
}

export interface StrategicVariables {
  /** Degree of allied coordination 0..1. Affects decision interval & accuracy. */
  alliedCoordination: number;
  /** Reaper strategic competence multiplier 0.5..1.5. */
  reaperCompetence: number;
  /** Indoctrination effectiveness 0..1 — degrades organic crew quality in Reaper presence. */
  indoctrinationEffectiveness: number;
  /** Reaper reinforcement availability multiplier. */
  reaperReinforcements: number;
  /** Whether the war can be won conventionally (campaign). */
  conventionalVictoryPossible: boolean;
  crucibleAvailable: boolean;
  shepardAlive: boolean;
  shepardEffectiveness: number; // 0..2
  illusiveManIndoctrinated: boolean;
  cerberusStance: 'hostile' | 'neutral' | 'cooperative' | 'controls_reapers';
  harbingerOperational: boolean;
  catalystOperational: boolean;
  /** Homeworld Defence Rule (Prime/Apex): Alliance & Turians can hold their homeworlds unaided. */
  homeworldIndependence: boolean;
  /** AU strategic drive: human fleets can cross relay-free routes in campaign time. */
  relayIndependentHumanFTL?: boolean;
}

export type TimelineCategory = 'canon' | 'au' | 'custom';

export interface RuleSet {
  id: string;
  name: string;
  tagline: string;
  category: TimelineCategory;
  /** Built-in source-led roster/technology policy; imports cannot claim it. */
  strictLore?: boolean;
  /** Display grouping for the AU hub; never a claim of canonical history. */
  family?: 'human_au' | 'historical_au' | 'hfy' | 'crossover';
  /** Faction used when opening a profile's custom battle. */
  preferredFaction?: FactionId;
  /** False for historical/crossover branches without a compatible 2186 campaign. */
  campaignCompatible?: boolean;
  description: string;
  /** Explicit list of changed history; shown in codex and comparison. */
  historyChanges: string[];
  organic: TechModifiers;
  reaper: TechModifiers;
  /** Per-faction overrides merged on top of `organic`. */
  factionOverrides: Partial<Record<FactionId, Partial<TechModifiers>>>;
  special: SpecialTechnology;
  fleetStrength: FleetStrength;
  strategic: StrategicVariables;
}

export const CANON_TECH: TechModifiers = {
  massAcceleratorDamage: 1,
  massAcceleratorPenetration: 1,
  massAcceleratorRange: 1,
  fireRate: 1,
  heatCapacity: 1,
  kineticBarrierStrength: 1,
  barrierRegen: 1,
  armourStrength: 1,
  hullIntegrity: 1,
  speed: 1,
  sensors: 1,
  electronicWarfare: 1,
  accuracy: 1,
  fighterStrength: 1,
  torpedoDamage: 1,
  gardianEffectiveness: 1,
  beamDamage: 1,
  crewQuality: 1,
};

export const CANON_SPECIAL: SpecialTechnology = {
  hyperMassAccelerators: false,
  hadesRounds: false,
  thanixAvailability: 'canon',
  reaperCommandVulnerability: false,
  indoctrinationDisabled: false,
};

export const CANON_FLEETS: FleetStrength = {
  alliance: 1,
  turian: 1,
  asari: 1,
  salarian: 1,
  quarian: 1,
  geth: 1,
  cerberus: 1,
  reaper: 1,
};

export const CANON_STRATEGIC: StrategicVariables = {
  alliedCoordination: 0.5,
  reaperCompetence: 1,
  indoctrinationEffectiveness: 1,
  reaperReinforcements: 1,
  conventionalVictoryPossible: false,
  crucibleAvailable: true,
  shepardAlive: true,
  shepardEffectiveness: 1,
  illusiveManIndoctrinated: true,
  cerberusStance: 'hostile',
  harbingerOperational: true,
  catalystOperational: true,
  homeworldIndependence: false,
  relayIndependentHumanFTL: false,
};

export const TECH_KEYS = Object.keys(CANON_TECH) as (keyof TechModifiers)[];

/** Deep-clone a rule set (rules are plain JSON). */
export const cloneRules = (r: RuleSet): RuleSet => JSON.parse(JSON.stringify(r)) as RuleSet;

/** Effective technology modifiers for a given faction under a rule set. */
export function techFor(rules: RuleSet, faction: FactionId): TechModifiers {
  if (rules.strictLore) return { ...CANON_TECH };
  // APEX refits belong to Mass Effect. Alien settings keep their declared
  // crossover conversion, with explicit per-faction overrides when desired.
  const base = !isMassEffectFaction(faction) ? CANON_TECH : faction === 'reaper' ? rules.reaper : rules.organic;
  const override = rules.factionOverrides[faction];
  return override ? { ...base, ...override } : { ...base };
}

// --------------------------------------------------------------------------
// Effective statistics
// --------------------------------------------------------------------------

export interface EffectiveShipStats {
  hull: number;
  armour: number;
  barriers: number;
  barrierRegen: number;
  maxSpeed: number;
  acceleration: number;
  turnRate: number;
  sensorRange: number;
  ecm: number;
  crewQuality: number;
  heatCapacity: number;
  /** AU flag: armour ignored fraction by incoming HADES rounds is handled on the weapon side. */
}

export function applyRulesToShip(cls: ShipClassDef, rules: RuleSet): EffectiveShipStats {
  const t = techFor(rules, cls.faction);
  const isFighter = cls.role === 'fighter';
  const f = isFighter ? t.fighterStrength : 1;
  let crew = cls.crewQuality * t.crewQuality;
  if (cls.faction !== 'reaper') {
    // Indoctrination pressure and coordination quality shape crew effectiveness.
    const indoct = rules.special.indoctrinationDisabled ? 0 : rules.strategic.indoctrinationEffectiveness;
    crew *= 1 - 0.08 * indoct;
    crew *= 0.9 + 0.2 * rules.strategic.alliedCoordination;
  } else {
    crew *= rules.strategic.reaperCompetence;
  }
  return {
    hull: cls.hull.value * t.hullIntegrity * f,
    armour: cls.armour.value * t.armourStrength * f,
    barriers: cls.barriers.value * t.kineticBarrierStrength * f,
    barrierRegen: cls.barrierRegen.value * t.barrierRegen * f,
    maxSpeed: cls.maxSpeed.value * t.speed,
    acceleration: cls.acceleration.value * t.speed,
    turnRate: cls.turnRate.value * (0.8 + 0.2 * t.speed),
    sensorRange: cls.sensorRange.value * t.sensors,
    ecm: Math.min(0.95, cls.ecm * t.electronicWarfare),
    crewQuality: crew,
    heatCapacity: 100 * t.heatCapacity,
  };
}

export interface EffectiveWeapon extends WeaponDef {
  /** Fraction of target armour ignored (HADES). */
  armourBypass: number;
  /** Multiplier on barrier efficiency against this weapon (HADES lowers it). */
  barrierEfficiencyMultiplier: number;
  /** AU simulation estimate: fraction of the existing shot budget reserved for an internal HADES warhead. */
  internalWarheadFraction?: number;
  /** Original weapon id if this one was substituted by a rule. */
  substitutedFrom?: string;
}

/**
 * Resolve the weapon a hardpoint actually mounts under the rules (handles AU
 * substitutions), then scale it by the faction's technology modifiers.
 */
export function applyRulesToWeapon(
  weapon: WeaponDef,
  faction: FactionId,
  cls: ShipClassDef,
  rules: RuleSet,
  catalogue: Record<string, WeaponDef>,
): EffectiveWeapon {
  const t = techFor(rules, faction);
  let w: WeaponDef = weapon;
  let substitutedFrom: string | undefined;

  if (faction !== 'reaper' && isMassEffectFaction(faction) && !rules.strictLore) {
    // Hyper-mass accelerators replace dreadnought spinal guns.
    if (
      rules.special.hyperMassAccelerators &&
      cls.role === 'dreadnought' &&
      weapon.id !== 'omaha_spinal' &&
      weapon.id !== 'cerberus_hades_spinal' &&
      weapon.id !== 'valkyrie_nova' &&
      weapon.kind === 'mass_accelerator' &&
      weapon.antiCapital &&
      weapon.arc <= 20
    ) {
      w = catalogue.apex_hyper_ma;
      substitutedFrom = weapon.id;
    }
    // Thanix availability.
    if (rules.special.thanixAvailability === 'fleetwide' && weapon.id === 'alliance_cruiser_main') {
      w = { ...catalogue.alliance_thanix, damage: catalogue.alliance_thanix.damage * 1.4, cooldown: 5.5 };
      substitutedFrom = weapon.id;
    }
    if (rules.special.thanixAvailability === 'none' && weapon.kind === 'thanix') {
      w = catalogue.alliance_cruiser_main;
      substitutedFrom = weapon.id;
    }
  }

  const isMA = w.kind === 'mass_accelerator';
  const isBeam = w.kind === 'thanix' || w.kind === 'reaper_beam';
  const isTorp = w.kind === 'disruptor_torpedo' || w.kind === 'missile';
  const isGardian = w.kind === 'gardian';
  const fighterMult = cls.role === 'fighter' ? t.fighterStrength : 1;

  let damage = w.damage * fighterMult;
  if (isMA) damage *= t.massAcceleratorDamage;
  if (isBeam) damage *= t.beamDamage;
  if (isTorp) damage *= t.torpedoDamage;
  if (isGardian) damage *= t.gardianEffectiveness;

  const hades = (w.id === 'cerberus_hades_spinal' && !rules.strictLore) ||
    (faction !== 'reaper' && isMassEffectFaction(faction) && !rules.strictLore && rules.special.hadesRounds && isMA);
  const nova = w.id === 'valkyrie_nova';

  return {
    ...w,
    damage,
    penetration: isMA ? w.penetration * t.massAcceleratorPenetration : w.penetration,
    range: isMA ? w.range * t.massAcceleratorRange : w.range,
    cooldown: (rules.strictLore && w.id === 'alliance_dn_main' ? 2 : w.cooldown) / t.fireRate,
    accuracy: Math.min(0.99, w.accuracy * t.accuracy),
    armourBypass: nova ? 0.95 : hades ? 0.5 : 0,
    barrierEfficiencyMultiplier: nova ? 0.12 : hades ? 0.6 : 1,
    internalWarheadFraction: nova ? 0 : hades ? 0.35 : 0,
    substitutedFrom,
  };
}
