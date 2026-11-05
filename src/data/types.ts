import type { Sourced } from '@/core/provenance';

export const MASS_EFFECT_FACTION_IDS = ['alliance', 'turian', 'asari', 'salarian', 'quarian', 'geth', 'cerberus', 'reaper'] as const;
export const CROSSOVER_FACTION_IDS = ['unsc', 'covenant', 'imperium', 'chaos', 'skynet'] as const;
export const SANDBOX_FACTION_IDS = ['prothean', 'past_cycle', 'player_civ'] as const;
export type MassEffectFactionId = (typeof MASS_EFFECT_FACTION_IDS)[number];
export type CrossoverFactionId = (typeof CROSSOVER_FACTION_IDS)[number];
export type SandboxFactionId = (typeof SANDBOX_FACTION_IDS)[number];
export type FactionId = MassEffectFactionId | CrossoverFactionId | SandboxFactionId;

export const isCrossoverFaction = (id: string): id is CrossoverFactionId => (CROSSOVER_FACTION_IDS as readonly string[]).includes(id);
export const isMassEffectFaction = (id: string): id is MassEffectFactionId => (MASS_EFFECT_FACTION_IDS as readonly string[]).includes(id);
export const isSandboxFaction = (id: string): id is SandboxFactionId => (SANDBOX_FACTION_IDS as readonly string[]).includes(id);

export type ShipRole =
  | 'fighter'
  | 'frigate'
  | 'cruiser'
  | 'dreadnought'
  | 'carrier'
  | 'reaper_destroyer'
  | 'reaper_capital';

export type WeaponKind =
  | 'mass_accelerator'
  | 'thanix'
  | 'gardian'
  | 'missile'
  | 'disruptor_torpedo'
  | 'reaper_beam';

export type DamageType = 'kinetic' | 'thanix_stream' | 'laser' | 'warhead' | 'reaper_beam';

export interface WeaponDef {
  id: string;
  name: string;
  kind: WeaponKind;
  damageType: DamageType;
  /** Damage per shot (or per second for beams). */
  damage: number;
  /** Seconds between shots / bursts. */
  cooldown: number;
  /** Maximum effective range in km (compressed battlespace). */
  range: number;
  /** Projectile speed km/s; Infinity for hitscan beams. */
  projectileSpeed: number;
  /** Base accuracy 0..1 at optimal range against a cruiser-sized target. */
  accuracy: number;
  /** Penetration factor vs armour (0..1+). */
  penetration: number;
  /** Beam burst duration in seconds (beams only). */
  beamDuration?: number;
  /** For missiles: hull HP of the missile and its speed. */
  missileHp?: number;
  /** Heat units generated per shot (ship heat capacity is 100). */
  heat: number;
  /** Rounds carried per mount; undefined = not ammunition-limited. Fighters rearm at their carrier. */
  magazine?: number;
  /** Point-defence lasers fire in heat-limited bursts: `shots` before a `recovery`-second pause. */
  burst?: { shots: number; recovery: number };
  /** Whether this weapon can target fighters/missiles. */
  antiSmall: boolean;
  /** Prefer firing at larger targets. */
  antiCapital: boolean;
  /** Firing arc in degrees relative to the hardpoint facing (360 = turret). */
  arc: number;
  provenance: Sourced<string>;
}

export interface HardpointDef {
  weaponId: string;
  /** Local offset on the hull, in metres along ship axes (x right, y up, z forward). */
  offset: [number, number, number];
  /** Facing direction yaw in degrees (0 = forward). */
  facing: number;
  /** Number of identical mounts represented by this hardpoint. */
  count: number;
}

export interface ShipClassDef {
  id: string;
  name: string;
  /** Short label used for auto-generated vessel names. */
  shortName?: string;
  faction: FactionId;
  role: ShipRole;
  /** Whether this class name/design is canonical or an original fan design. */
  designProvenance: Sourced<string>;
  lengthM: Sourced<number>;
  /** Hull integrity points. */
  hull: Sourced<number>;
  /** Armour thickness (flat per-hit reduction, depletes slowly). */
  armour: Sourced<number>;
  /** Kinetic barrier capacity. */
  barriers: Sourced<number>;
  /** Barrier regeneration per second when not recently hit. */
  barrierRegen: Sourced<number>;
  /** Maximum combat manoeuvring speed km/s (compressed). */
  maxSpeed: Sourced<number>;
  /** Acceleration km/s^2. */
  acceleration: Sourced<number>;
  /** Turn rate degrees/s. */
  turnRate: Sourced<number>;
  /** Sensor range km. */
  sensorRange: Sourced<number>;
  /** Target profile multiplier (1 = cruiser). Larger is easier to hit. */
  signature: number;
  /** Electronic warfare rating 0..1 (reduces enemy accuracy). */
  ecm: number;
  /** Crew/VI effectiveness 0..1.5 */
  crewQuality: number;
  hardpoints: HardpointDef[];
  /** Fighters carried (launched at battle start / on order). */
  fighterComplement?: { classId: string; count: number };
  /** Point value for scenario balancing and comparison metrics. */
  pointValue: number;
  description: string;
}
