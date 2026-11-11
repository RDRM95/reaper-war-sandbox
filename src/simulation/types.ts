import type { Vec3 } from '@/core/vec3';
import type { DamageType, FactionId, ShipRole } from '@/data/types';
import type { EffectiveWeapon, RuleSet, TechModifiers } from '@/timelines/rules';

export type Side = 'A' | 'B';

export type FormationType =
  | 'defensive_screen'
  | 'line_abreast'
  | 'strike_wedge'
  | 'capital_column'
  | 'fighter_screen'
  | 'dispersed';

export const FORMATION_LABELS: Record<FormationType, string> = {
  defensive_screen: 'Defensive screen',
  line_abreast: 'Broad defensive line',
  strike_wedge: 'Concentrated strike group',
  capital_column: 'Capital ship formation',
  fighter_screen: 'Fighter interception screen',
  dispersed: 'Dispersed formation',
};

export type OrderType =
  | 'attack'
  | 'attack_target'
  | 'defend_position'
  | 'hold_formation'
  | 'advance'
  | 'withdraw'
  | 'escort'
  | 'intercept'
  /** Attack from the enemy's flank: the fleet goes round to one side of it at its own range. */
  | 'flank'
  /** Attack through the enemy: the fleet drives past it to the far side. */
  | 'breakthrough'
  | 'retreat';

export type TargetPriority = 'default' | 'reaper_destroyers' | 'reaper_capitals' | 'capitals' | 'escorts' | 'fighters';

export interface FleetOrders {
  order: OrderType;
  /** Target ship id for attack_target / escort / intercept. */
  targetId?: string;
  /** Position for defend_position. */
  position?: Vec3;
  formation: FormationType;
  focusFire: boolean;
  /** Hold organic dreadnought spinal guns; PD, escorts and Reapers stay active. */
  primaryFire?: 'free' | 'hold';
  priority: TargetPriority;
  protectCapitals: boolean;
  fightersDeployed: boolean;
  /** GARDIAN concentrates on missiles rather than fighters. */
  pointDefenceMissiles: boolean;
}

export interface ShipSpec {
  classId: string;
  count: number;
  /** Optional named vessels (e.g. "SSV Kilimanjaro") assigned in order. */
  names?: string[];
}

export interface FleetSpec {
  id: string;
  name: string;
  faction: FactionId;
  side: Side;
  ships: ShipSpec[];
  formation: FormationType;
  /** Fleet centre at deployment (km). */
  position: Vec3;
  /** Initial facing (unit vector). */
  heading: Vec3;
  initialOrder?: Partial<FleetOrders>;
  /** Seconds after battle start when the fleet arrives (0 = present at start). */
  arrivalTime?: number;
  /** Player can command this fleet. */
  playerControlled?: boolean;
  /** Scenario-level technology override for this fleet (e.g. Reaper-upgraded geth). Merged over the faction's rules. */
  techOverride?: Partial<TechModifiers>;
}

export type Environment =
  | 'earth_orbit'
  | 'palaven_orbit'
  | 'thessia_orbit'
  | 'rannoch_orbit'
  | 'surkesh_orbit'
  | 'citadel'
  | 'deep_space'
  | 'relay';

export interface BattleConfig {
  id: string;
  name: string;
  scenarioId: string;
  /** Explicit scenario metadata used by the Strict Lore launch boundary. */
  alternateHistory?: boolean;
  seed: number;
  rules: RuleSet;
  fleets: FleetSpec[];
  environment: Environment;
  /** Battle ends by attrition judgement at this time (s). */
  maxDuration: number;
  /** Fleets on this side are the "player"/perspective side for results. */
  perspectiveSide: Side;
  /** Human-readable description of objective. */
  objective: string;
  /** Optional narrative label for world-state choices used by the scenario. */
  worldState?: Record<string, string>;
}

export interface WeaponState {
  index: number;
  hardpointIndex: number;
  mount: number;
  def: EffectiveWeapon;
  cooldown: number;
  /** Local offset in km. */
  offset: Vec3;
  facing: number;
  /** For beams: remaining burst time and current target. */
  beamRemaining: number;
  beamTargetId?: string;
  beamHit: boolean;
  /** Stable contact on the target's rotating hull, local kilometres. */
  beamLocalHit?: Vec3;
  /** Glancing contact strength, 0.58–1. The weapon's main damage model is unchanged. */
  beamGlance?: number;
  /** World-space termination point of an active beam (km). */
  beamEnd?: Vec3;
  /** World-space origin of the active beam (km). */
  beamStart?: Vec3;
  /** Rounds remaining for magazine-limited weapons (undefined = unlimited). */
  ammo?: number;
  /** Shots left in the current point-defence burst (burst weapons only). */
  burstLeft?: number;
  /** Seconds until a spent burst recovers. */
  burstRecover: number;
}

export interface Subsystems {
  engines: number; // 0..1
  weapons: number;
  sensors: number;
}

export interface ShipStats {
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  hits: number;
  kills: number;
}

export interface ShipState {
  id: string;
  name: string;
  classId: string;
  faction: FactionId;
  role: ShipRole;
  side: Side;
  fleetId: string;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  /** Engine output requested by motion control, 0 = idle or failed. Render-only telemetry. */
  engineThrust?: number;
  /** Inertial unpowered drift is not disguised as engine propulsion. */
  inertialCoast?: boolean;
  heading: Vec3;
  prevHeading: Vec3;
  lengthKm: number;
  radiusKm: number;
  signature: number;
  hull: number;
  maxHull: number;
  armour: number;
  maxArmour: number;
  barriers: number;
  maxBarriers: number;
  barrierRegen: number;
  maxSpeed: number;
  acceleration: number;
  turnRate: number; // rad/s
  sensorRange: number;
  ecm: number;
  crewQuality: number;
  heat: number;
  heatCapacity: number;
  overheated: boolean;
  weapons: WeaponState[];
  subsystems: Subsystems;
  alive: boolean;
  destroyedAt?: number;
  targetId?: string;
  /** Earliest automatic target change; invalid targets and player commands bypass it. */
  targetLockUntil?: number;
  /** Hysteretic range controller state, independent from facing. */
  engagementMode?: 'approach' | 'hold' | 'reposition';
  /** Stable trim from assigned formation station after entering the range band. */
  firingOffset?: Vec3;
  firingTargetId?: string;
  /** Formation slot offset in fleet-local space (km). */
  slot: Vec3;
  withdrawing: boolean;
  /** Left the battlespace (retreated). Still alive, no longer participates. */
  escaped: boolean;
  lastHitAt: number;
  /** Time the ship first fired (for comms). */
  firstShotAt?: number;
  /** Fighter returning to its carrier to reload torpedoes. */
  rearming?: boolean;
  /** Seconds of hangar time left before a rearming fighter relaunches. */
  rearmTimer?: number;
  aiTimer: number;
  stats: ShipStats;
  /** Carrier: fighters not yet launched. */
  hangar?: { classId: string; remaining: number; launchTimer: number };
  /** Fighter: id of carrier (returns there when recalled). */
  carrierId?: string;
  pointValue: number;
  /** Ship-level overrides from player orders. */
  forcedTargetId?: string;
  escortId?: string;
}

export interface Projectile {
  id: number;
  shooterId: string;
  side: Side;
  weapon: EffectiveWeapon;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  ttl: number;
  intendedTargetId: string;
}

export interface Missile {
  id: number;
  shooterId: string;
  side: Side;
  weapon: EffectiveWeapon;
  pos: Vec3;
  prevPos: Vec3;
  vel: Vec3;
  targetId: string;
  hp: number;
  ttl: number;
  alive: boolean;
}

export interface BeamVisual {
  shooterId: string;
  weaponIndex: number;
  targetId: string;
  /** Point the beam terminates at (km). */
  end: Vec3;
  remaining: number;
  kind: 'thanix' | 'reaper_beam';
  hit: boolean;
}

export interface FleetState {
  spec: FleetSpec;
  orders: FleetOrders;
  anchor: Vec3;
  heading: Vec3;
  /** Fleet-level focus target. */
  focusTargetId?: string;
  /** Minimum fleet focus commitment before considering a better live target. */
  focusLockUntil?: number;
  /** Shared tactical observations; movement does not rescan all enemies per ship. */
  enemyCentre?: Vec3;
  engagementRange?: number;
  engagementMode?: 'approach' | 'hold';
  decisionTimer: number;
  arrived: boolean;
  startPoints: number;
  /** Comms cooldowns to avoid spam. */
  commsCooldown: number;
  /** Coordination penalty (Reaper command vulnerability). */
  coordinationPenalty: number;
}

// -------------------------------------------------------------------- Events

export type BattleEvent =
  | { t: number; type: 'battle_start'; name: string }
  | { t: number; type: 'ship_deployed'; shipId: string; classId: string; faction: FactionId; side: Side; name: string }
  | { t: number; type: 'fleet_arrived'; fleetId: string }
  | { t: number; type: 'hades_detonation'; shipId: string; targetId: string; weaponId: string; internalDamage: number; payloadDamage: number; pos: Vec3 }
  | { t: number; type: 'primary_volley_issued'; fleetId: string; side: Side }
  | { t: number; type: 'weapon_fired'; shipId: string; weaponId: string; targetId: string; weaponIndex: number; kind: string }
  | { t: number; type: 'projectile_impact'; shipId: string; targetId: string; damage: number; damageType: DamageType; barrierDamage: number; hullDamage: number; pos: Vec3; glancing?: boolean }
  | { t: number; type: 'barrier_damaged'; shipId: string; remaining: number }
  | { t: number; type: 'barriers_down'; shipId: string }
  | { t: number; type: 'subsystem_disabled'; shipId: string; subsystem: keyof Subsystems; level: number }
  | { t: number; type: 'ship_destroyed'; shipId: string; killerId?: string; classId: string; faction: FactionId; side: Side; name: string; pos: Vec3; role: ShipRole }
  | { t: number; type: 'missile_intercepted'; missileId: number; interceptorId: string; pos: Vec3 }
  | { t: number; type: 'fighters_launched'; carrierId: string; count: number }
  | { t: number; type: 'ammunition_depleted'; shipId: string; weaponId: string }
  | { t: number; type: 'fighter_rearmed'; shipId: string; carrierId: string }
  | { t: number; type: 'fleet_withdraw'; fleetId: string; side: Side }
  | { t: number; type: 'ship_withdrawing'; shipId: string }
  | { t: number; type: 'reinforcement_arrival'; fleetId: string; side: Side }
  | { t: number; type: 'order_issued'; fleetId: string; order: string }
  | { t: number; type: 'comms'; faction: FactionId; side: Side; text: string }
  | { t: number; type: 'objective_completed'; side: Side; text: string }
  | { t: number; type: 'battle_end'; winner: Side | 'draw'; reason: string };

export interface SideSummary {
  side: Side;
  factions: FactionId[];
  deployed: number;
  destroyed: number;
  survivors: number;
  capitalDeployed: number;
  capitalLost: number;
  reaperCapitalLost: number;
  reaperDestroyersLost: number;
  damageDealt: number;
  damageTaken: number;
  shotsFired: number;
  hits: number;
  pointsDeployed: number;
  pointsLost: number;
  survivalPercent: number;
  /** Damage dealt per point of fleet value lost. */
  tacticalEffectiveness: number;
  lossesByClass: Record<string, { deployed: number; lost: number; name: string }>;
}

export interface BattleResult {
  configId: string;
  scenarioId: string;
  rulesId: string;
  rulesName: string;
  seed: number;
  duration: number;
  winner: Side | 'draw';
  reason: string;
  perspectiveSide: Side;
  outcome: 'victory' | 'defeat' | 'draw';
  sides: Record<Side, SideSummary>;
  eventCount: number;
  objectiveCompleted: boolean;
}
